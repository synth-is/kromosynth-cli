// sqlite-persistence-provider.js - SQLite database persistence with file fallback
import {
  createEvoRunDir,
  readGenomeAndMetaFromDisk,
  saveEliteMapToDisk, readEliteMapFromDisk, 
  saveEliteMapMetaToDisk, readEliteMapMetaFromDisk,
  saveCellFeaturesToDisk, readCellFeaturesFromDiskForEliteMap, 
  readFeaturesForGenomeIdsFromDisk,
  getEliteGenomeIdsFromEliteMaps,
  saveGenomeToDisk, getEliteMapKey,
  saveLostFeaturesToDisk, readAllLostFeaturesFromDisk,
  saveCellFeaturesAtGenerationToDisk,
  getFeaturesKey,
  readCompressedOrPlainJSON
} from './qd-common-elite-map-persistence.js';
import { getRunDB, createRunDB } from './genome-db.js';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

// Promisify zlib functions
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * SQLitePersistenceProvider extends the file-based persistence with SQLite storage
 * for genomes and features while maintaining backward compatibility.
 */
export class SQLitePersistenceProvider {
  /**
   * Create evolution run directory
   */
  createEvoRunDir(...args) {
    return createEvoRunDir(...args);
  }

  /**
   * Read genome and metadata from either SQLite database (if available) or fallback to disk
   */
  async readGenomeAndMetaFromDisk(evolutionRunId, genomeId, evoRunDirPath) {
    // First try to get from SQLite if available
    const db = getRunDB(evoRunDirPath);
    if (db && db.hasGenomeDb) {
      const compressedData = await db.getGenome(genomeId);
      if (compressedData) {
        try {
          // Handle both cases - compressed data from our new implementation and uncompressed data from old storage
          // Check if it's a buffer or a serialized buffer representation {type:'Buffer', data:Array}
          if (Buffer.isBuffer(compressedData) || 
              (compressedData.type === 'Buffer' && Array.isArray(compressedData.data))) {
            
            // Convert to actual Buffer if needed
            const bufferData = Buffer.isBuffer(compressedData) ? 
              compressedData : Buffer.from(compressedData.data);
              
            // Decompress the data
            const decompressedData = await gunzip(bufferData);
            const genomeData = JSON.parse(decompressedData.toString());
            return JSON.stringify(genomeData);
          } else {
            // Handle uncompressed data (legacy/import data)
            return JSON.stringify(compressedData);
          }
        } catch (err) {
          console.error(`Error decompressing genome ${genomeId}:`, err);
        }
      }
    }
    
    // Fallback to file-based storage
    return readGenomeAndMetaFromDisk(evolutionRunId, genomeId, evoRunDirPath);
  }

  /**
   * Save elite map to disk (continue using file-based storage for elite maps)
   */
  saveEliteMapToDisk(...args) {
    return saveEliteMapToDisk(...args);
  }

  /**
   * Read elite map from disk
   */
  readEliteMapFromDisk(...args) {
    return readEliteMapFromDisk(...args);
  }

  /**
   * Save elite map metadata to disk
   */
  saveEliteMapMetaToDisk(...args) {
    return saveEliteMapMetaToDisk(...args);
  }

  /**
   * Read elite map metadata from disk
   */
  readEliteMapMetaFromDisk(...args) {
    return readEliteMapMetaFromDisk(...args);
  }

  /**
   * Save cell features to SQLite database if available, otherwise fallback to disk
   */
  async saveCellFeaturesToDisk(cellFeatures, eliteMap, evoRunDirPath, evolutionRunId, terrainName) {
    // First ensure the DB exists or create it
    let db = getRunDB(evoRunDirPath, { writable: true });
    
    if (!db || !db.hasFeatureDb) {
      // Create a new database for this run
      db = createRunDB(evoRunDirPath);
    }
    
    let useSQLite = true;
    
    if (!db || !db.hasFeatureDb) {
      // If couldn't create SQLite database, fallback to file-based storage
      useSQLite = false;
      saveCellFeaturesToDisk(cellFeatures, eliteMap, evoRunDirPath, evolutionRunId);
      return;
    }

    // Get feature extraction type
    let featureExtractionType;
    if (eliteMap.classConfigurations && eliteMap.classConfigurations.length) {
      featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
    }

    const promises = [];
    
    // Save each cell's features to SQLite
    for (const cellKey in cellFeatures) {
      if (!featureExtractionType || cellFeatures[cellKey][featureExtractionType]) {
        if (!eliteMap.cells[cellKey].elts[0]) {
          console.error(`Error: eliteMap.cells[${cellKey}].elts[0] is undefined`);
          continue;
        }

        const genomeId = eliteMap.cells[cellKey].elts[0].g;
        
        // Convert feature data to JSON and compress with highest compression level (9)
        const jsonData = Buffer.from(JSON.stringify(cellFeatures[cellKey]));
        const compressedData = await gzip(jsonData, { level: 9 });
        
        // Save compressed data to SQLite
        promises.push(db.saveFeature(genomeId, compressedData));
      }
    }
    
    await Promise.all(promises);
  }

  /**
   * Read cell features from SQLite database if available, otherwise fallback to disk
   */
  async readCellFeaturesFromDiskForEliteMap(evoRunDirPath, evolutionRunId, eliteMap) {
    const db = getRunDB(evoRunDirPath);
    const useSQLite = db && db.hasFeatureDb;
    
    if (!useSQLite) {
      // Fallback to file-based storage
      return readCellFeaturesFromDiskForEliteMap(evoRunDirPath, evolutionRunId, eliteMap);
    }
    
    const cellFeatures = {};
    
    // Read each cell's features from SQLite
    for (const cellKey in eliteMap.cells) {
      if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
        const genomeId = eliteMap.cells[cellKey].elts[0].g;
        const compressedFeatures = await db.getFeature(genomeId);
        
        if (compressedFeatures) {
          try {
            // Handle both cases - compressed data from our new implementation and uncompressed data from old storage
            // Check if it's a buffer or a serialized buffer representation {type:'Buffer', data:Array}
            if (Buffer.isBuffer(compressedFeatures) || 
                (compressedFeatures.type === 'Buffer' && Array.isArray(compressedFeatures.data))) {
              
              // Convert to actual Buffer if needed
              const bufferData = Buffer.isBuffer(compressedFeatures) ? 
                compressedFeatures : Buffer.from(compressedFeatures.data);
                
              // Decompress the data
              const decompressedData = await gunzip(bufferData);
              const features = JSON.parse(decompressedData.toString());
              cellFeatures[cellKey] = features;
            } else {
              // Handle uncompressed data (legacy/import data)
              cellFeatures[cellKey] = compressedFeatures;
            }
          } catch (err) {
            console.error(`Error decompressing features for cell ${cellKey}:`, err);
          }
        }
      }
    }
    
    return cellFeatures;
  }

  /**
   * Read features for a set of genome IDs, preferring SQLite if available
   */
  async readFeaturesForGenomeIdsFromDisk(evoRunDirPath, evolutionRunId, genomeIds) {
    const db = getRunDB(evoRunDirPath);
    const useSQLite = db && db.hasFeatureDb;
    
    if (!useSQLite) {
      // Fallback to file-based storage
      return readFeaturesForGenomeIdsFromDisk(evoRunDirPath, evolutionRunId, genomeIds);
    }
    
    const genomeFeatures = {};
    
    // Read each genome's features from SQLite
    for (const genomeId of genomeIds) {
      const compressedFeatures = await db.getFeature(genomeId);
      
      if (compressedFeatures) {
        try {
          // Handle both cases - compressed data from our new implementation and uncompressed data from old storage
          // Check if it's a buffer or a serialized buffer representation {type:'Buffer', data:Array}
          if (Buffer.isBuffer(compressedFeatures) || 
              (compressedFeatures.type === 'Buffer' && Array.isArray(compressedFeatures.data))) {
            
            // Convert to actual Buffer if needed
            const bufferData = Buffer.isBuffer(compressedFeatures) ? 
              compressedFeatures : Buffer.from(compressedFeatures.data);
              
            // Decompress the data
            const decompressedData = await gunzip(bufferData);
            const features = JSON.parse(decompressedData.toString());
            genomeFeatures[genomeId] = features;
          } else {
            // Handle uncompressed data (legacy/import data)
            genomeFeatures[genomeId] = compressedFeatures;
          }
        } catch (err) {
          console.error(`Error decompressing features for genome ${genomeId}:`, err);
        }
      } else {
        // Try fallback to file if not found in SQLite
        const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
        const gzipPath = path.join(evoRunDirPath, 'cellFeatures', `${featuresKey}.json.gz`);
        const plainPath = path.join(evoRunDirPath, 'cellFeatures', `${featuresKey}.json`);
        
        try {
          const features = readCompressedOrPlainJSON(gzipPath, plainPath);
          if (features) {
            genomeFeatures[genomeId] = features;
          }
        } catch (err) {
          // Feature not found in database or file
        }
      }
    }
    
    return genomeFeatures;
  }

  /**
   * Get elite genome IDs from elite maps
   */
  getEliteGenomeIdsFromEliteMaps(...args) {
    return getEliteGenomeIdsFromEliteMaps(...args);
  }

  /**
   * Save genome to SQLite database if available, otherwise fallback to disk
   */
  async saveGenomeToDisk(genome, evolutionRunId, genomeId, evoRunDirPath, addToGit) {
    // First ensure the DB exists or create it
    let db = getRunDB(evoRunDirPath, { writable: true });
    
    if (!db || !db.hasGenomeDb) {
      // Create a new database for this run
      db = createRunDB(evoRunDirPath);
    }
    
    const useSQLite = db && db.hasGenomeDb;
    
    if (!useSQLite) {
      // Fallback to file-based storage
      return saveGenomeToDisk(genome, evolutionRunId, genomeId, evoRunDirPath, addToGit);
    }
    
    // Save to SQLite with compression
    const data = {
      _id: `genome_${evolutionRunId}_${genomeId}`,
      genome
    };
    
    // Convert to JSON and compress with highest compression level (9)
    const jsonData = Buffer.from(JSON.stringify(data));
    const compressedData = await gzip(jsonData, { level: 9 });
    
    await db.saveGenome(genomeId, compressedData);
  }

  /**
   * Get elite map key
   */
  getEliteMapKey(...args) {
    return getEliteMapKey(...args);
  }

  /**
   * Save lost features to disk (continue using file-based storage for lost features)
   */
  saveLostFeaturesToDisk(...args) {
    return saveLostFeaturesToDisk(...args);
  }

  /**
   * Read all lost features from disk
   */
  readAllLostFeaturesFromDisk(...args) {
    return readAllLostFeaturesFromDisk(...args);
  }

  /**
   * Save cell features at generation to disk (continue using file-based storage)
   */
  saveCellFeaturesAtGenerationToDisk(...args) {
    return saveCellFeaturesAtGenerationToDisk(...args);
  }

  /**
   * List all genome IDs for which features are available in the SQLite database.
   * Returns an array of genome IDs (as strings).
   */
  async listAllFeatureGenomeIds(evoRunDirPath) {
    const db = getRunDB(evoRunDirPath);
    if (db && db.hasFeatureDb && typeof db.listAllFeatureGenomeIds === 'function') {
      // If the DB implementation provides a direct method, use it
      return await db.listAllFeatureGenomeIds();
    }
    // Fallback: not supported, return empty array
    return [];
  }
}
