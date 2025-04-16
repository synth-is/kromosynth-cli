import fs from 'fs-extra';
import { runCmd } from './qd-common.js';
import { gzipSync, gunzipSync } from 'fflate';

// Helper functions for compression
function writeCompressedJSON(filePath, content) {
  const jsonString = JSON.stringify(content);
  const uint8 = new TextEncoder().encode(jsonString);
  const compressed = gzipSync(uint8);
  fs.writeFileSync(filePath, compressed);
}

export function readCompressedOrPlainJSON(gzipPath, plainPath) {
  try {
    // Try reading compressed file first
    if (fs.existsSync(gzipPath)) {
      const compressed = fs.readFileSync(gzipPath);
      const decompressed = gunzipSync(new Uint8Array(compressed));
      return JSON.parse(new TextDecoder().decode(decompressed));
    }
    // Fall back to plain JSON
    if (fs.existsSync(plainPath)) {
      const content = fs.readFileSync(plainPath, 'utf8');
      return JSON.parse(content);
    }
    return null;
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
}

export function createEvoRunDir(evoRunDirPath) {
  if (!fs.existsSync(evoRunDirPath)) fs.mkdirSync(evoRunDirPath, { recursive: true });
}

export function getGenomeKey(evolutionRunId, genomeId) {
  return `genome_${evolutionRunId}_${genomeId}`;
}

export function getFeaturesKey(evolutionRunId, genomeId) {
  return `features_${evolutionRunId}_${genomeId}`;
}

export function readGenomeAndMetaFromDisk(evolutionRunId, genomeId, evoRunDirPath) {
  let genomeJSONString;
  try {
    const genomeKey = getGenomeKey(evolutionRunId, genomeId);
    const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
    const gzipPath = `${evoRunDirPath}${evoRunDirPathSeparator}${genomeKey}.json.gz`;
    const plainPath = `${evoRunDirPath}${evoRunDirPathSeparator}${genomeKey}.json`;
    
    const result = readCompressedOrPlainJSON(gzipPath, plainPath);
    if (result) {
      genomeJSONString = JSON.stringify(result);
    } else {
      console.error(`Genome file not found at ${gzipPath} or ${plainPath}`);
    }
  } catch (err) {
    console.error("readGenomeFromDisk: ", err);
  }
  return genomeJSONString;
}

export function saveEliteMapToDisk(eliteMap, evoRunDirPath, evolutionRunId, terrainName, addToGit) {
  if (Array.isArray(eliteMap)) {
    for (const oneEliteMap of eliteMap) {
      const refSetName = oneEliteMap.classConfigurations[0].refSetName;
      saveEliteMapToDisk(oneEliteMap, evoRunDirPath, evolutionRunId, refSetName, addToGit);
    }
  } else {
    const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
    const eliteMapFileName = `${getEliteMapKey(evolutionRunId, terrainName)}.json`;
    const eliteMapFilePath = `${evoRunDirPath}${evoRunDirPathSeparator}${eliteMapFileName}`;
    const eliteMapStringified = JSON.stringify(eliteMap, null, 2); // prettified to obtain the benefits (compression of git diffs)

    if (!fs.existsSync(eliteMapFilePath)) {
      fs.mkdirSync(evoRunDirPath, { recursive: true });
    }
    fs.writeFileSync(eliteMapFilePath, eliteMapStringified);

    if (addToGit) {
      runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);
    }
  }
}

export function readEliteMapFromDisk(evolutionRunId, evoRunDirPath, terrainName) {
  let eliteMap;
  try {
    const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
    const eliteMapFilePath = `${evoRunDirPath}${evoRunDirPathSeparator}${getEliteMapKey(evolutionRunId, terrainName)}.json`;
    if (fs.existsSync(eliteMapFilePath)) {
      const eliteMapJSONString = fs.readFileSync(eliteMapFilePath, 'utf8');
      eliteMap = JSON.parse(eliteMapJSONString);
    }
  } catch (err) {
    console.error("readEliteMapFromDisk: ", err);
    throw new Error("Error reading eliteMap from disk");
  }
  return eliteMap;
}

export function saveEliteMapMetaToDisk(eliteMapMeta, evoRunDirPath, evolutionRunId) {
  const eliteMapMetaFileName = `eliteMapMeta_${evolutionRunId}.json.gz`;
  const eliteMapMetaFilePath = `${evoRunDirPath}${eliteMapMetaFileName}`;
  writeCompressedJSON(eliteMapMetaFilePath, eliteMapMeta);
}

export function readEliteMapMetaFromDisk(evolutionRunId, evoRunDirPath) {
  try {
    const gzipPath = `${evoRunDirPath}eliteMapMeta_${evolutionRunId}.json.gz`;
    const plainPath = `${evoRunDirPath}eliteMapMeta_${evolutionRunId}.json`;
    return readCompressedOrPlainJSON(gzipPath, plainPath);
  } catch (err) {
    console.error("readEliteMapMetaFromDisk: ", err);
    return null;
  }
}

export function saveCellFeaturesToDisk(cellFeatures, eliteMap, evoRunDirPath, evolutionRunId) {
  const cellFeaturesDirPath = `${evoRunDirPath}cellFeatures/`;
  if (!fs.existsSync(cellFeaturesDirPath)) fs.mkdirSync(cellFeaturesDirPath, { recursive: true });

  let featureExtractionType;
  if (eliteMap.classConfigurations && eliteMap.classConfigurations.length) {
    featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
  }

  for (const cellKey in cellFeatures) {
    if (!featureExtractionType || cellFeatures[cellKey][featureExtractionType]) {
      if (!eliteMap.cells[cellKey].elts[0]) {
        console.error(`Error: eliteMap.cells[${cellKey}].elts[0] is undefined`);
        continue;
      }

      const genomeId = eliteMap.cells[cellKey].elts[0].g;
      const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
      const cellFeaturesFileName = `${featuresKey}.json.gz`;
      const cellFeaturesFilePath = `${cellFeaturesDirPath}${cellFeaturesFileName}`;

      const exists = fs.existsSync(cellFeaturesFilePath);
      if (!exists) {
        writeCompressedJSON(cellFeaturesFilePath, cellFeatures[cellKey]);
      }
    }
  }
}

export function readCellFeaturesFromDiskForEliteMap(evoRunDirPath, evolutionRunId, eliteMap) {
  let cellFeatures = {};
  for (const cellKey in eliteMap.cells) {
    if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
      const genomeId = eliteMap.cells[cellKey].elts[0].g;
      const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
      const gzipPath = `${evoRunDirPath}cellFeatures/${featuresKey}.json.gz`;
      const plainPath = `${evoRunDirPath}cellFeatures/${featuresKey}.json`;

      const features = readCompressedOrPlainJSON(gzipPath, plainPath);
      if (features) {
        cellFeatures[cellKey] = features;
      }
    }
  }
  return cellFeatures;
}

export function saveLostFeaturesToDisk(lostFeatures, eliteMap, evoRunDirPath) {
  const lostFeaturesDirPath = `${evoRunDirPath}lostFeatures/`;
  if (!fs.existsSync(lostFeaturesDirPath)) fs.mkdirSync(lostFeaturesDirPath, { recursive: true });
  
  const featuresKey = `lostFeatures_generation_${eliteMap.generationNumber}`;
  const lostFeaturesFileName = `${featuresKey}.json.gz`;
  const lostFeaturesFilePath = `${lostFeaturesDirPath}${lostFeaturesFileName}`;
  
  writeCompressedJSON(lostFeaturesFilePath, lostFeatures);
}

export function readAllLostFeaturesFromDisk(evoRunDirPath, projectionFeatureType) {
  const lostFeaturesDirPath = `${evoRunDirPath}lostFeatures/`;
  let allLostFeatures = [];
  let allLostScores = [];
  if (fs.existsSync(lostFeaturesDirPath)) {
    const files = fs.readdirSync(lostFeaturesDirPath);
    const lostFeaturesFiles = files.filter(file => 
      file.startsWith('lostFeatures_generation_') && 
      (file.endsWith('.json.gz') || file.endsWith('.json'))
    );

    for (const file of lostFeaturesFiles) {
      const gzipPath = `${lostFeaturesDirPath}${file}`;
      const plainPath = gzipPath.replace('.json.gz', '.json');
      
      const lostFeatures = readCompressedOrPlainJSON(gzipPath, plainPath);
      if (lostFeatures) {
        for (const key in lostFeatures) {
          if (lostFeatures[key][projectionFeatureType]?.features) {
            allLostFeatures.push(lostFeatures[key][projectionFeatureType].features);
            allLostScores.push(lostFeatures[key].score);
          }
        }
      }
    }
  }

  return {
    lostFeatures: allLostFeatures,
    lostScores: allLostScores
  };
}

export function saveCellFeaturesAtGenerationToDisk(cellFeatures, featureType, generation, evoRunDirPath) {
  const generationFeaturesDirPath = `${evoRunDirPath}generationFeatures/`;
  if (!fs.existsSync(generationFeaturesDirPath)) fs.mkdirSync(generationFeaturesDirPath, { recursive: true });
  
  const featuresKey = `generationFeatures_generation_${generation}`;
  const generationFeaturesFileName = `${featuresKey}.json.gz`;
  const generationFeaturesFilePath = `${generationFeaturesDirPath}${generationFeaturesFileName}`;
  
  const generationFeatures = Object.keys(cellFeatures).map(cellKey => ({
    [featureType]: cellFeatures[cellKey][featureType].features
  }));
  
  writeCompressedJSON(generationFeaturesFilePath, generationFeatures);
  return generationFeaturesFilePath;
}

export function getCellFeaturesFilePathForLatestGeneration(evoRunDirPath) {
  const generationFeaturesDirPath = `${evoRunDirPath}generationFeatures/`;
  if (!fs.existsSync(generationFeaturesDirPath)) {
    return null;
  }
  
  const files = fs.readdirSync(generationFeaturesDirPath);
  const generationFeaturesFiles = files
    .filter(file => file.startsWith('generationFeatures_generation_'))
    .sort()
    .reverse();
    
  if (generationFeaturesFiles.length === 0) return null;
  
  return `${generationFeaturesDirPath}${generationFeaturesFiles[0]}`;
}

export function readFeaturesForGenomeIdsFromDisk(evoRunDirPath, evolutionRunId, genomeIds) {
  let genomeFeatures = {};
  
  for (const genomeId of genomeIds) {
    const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
    const gzipPath = `${evoRunDirPath}cellFeatures/${featuresKey}.json.gz`;
    const plainPath = `${evoRunDirPath}cellFeatures/${featuresKey}.json`;
    
    const features = readCompressedOrPlainJSON(gzipPath, plainPath);
    if (features) {
      genomeFeatures[genomeId] = features;
    }
  }
  
  return genomeFeatures;
}

export function saveGenomeToDisk(genome, evolutionRunId, genomeId, evoRunDirPath, addToGit) {
  const genomeKey = getGenomeKey(evolutionRunId, genomeId);
  const genomeFileName = `${genomeKey}.json.gz`;
  const genomeFilePath = `${evoRunDirPath}${genomeFileName}`;
  
  if (fs.existsSync(genomeFilePath)) {
    console.error(`Error: genome file already exists at ${genomeFilePath}`);
    return;
  }

  writeCompressedJSON(genomeFilePath, {
    _id: genomeKey,
    genome
  });

  if (addToGit) {
    runCmd(`git -C ${evoRunDirPath} add ${genomeFileName}`);
  }
}

export function getEliteMapKey(evolutionRunId, terrainName) {
  if (undefined === terrainName) {
    return `elites_${evolutionRunId}`;
  } else {
    return `elites_${evolutionRunId}_${terrainName}`;
  }
}

export function getEliteGenomeIdsFromEliteMaps(eliteMaps) {
  let eliteGenomeIds = [];
  if (Array.isArray(eliteMaps)) {
    for (const oneEliteMap of eliteMaps) {
      eliteGenomeIds = eliteGenomeIds.concat(getEliteGenomeIdsFromEliteMap(oneEliteMap));
    }
  } else {
    eliteGenomeIds = getEliteGenomeIdsFromEliteMap(eliteMaps);
  }
  return eliteGenomeIds;
}

export function getEliteGenomeIdsFromEliteMap(eliteMap) {
  let eliteGenomeIds = [];
  for (const cellKey in eliteMap.cells) {
    if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
      eliteGenomeIds.push(eliteMap.cells[cellKey].elts[0].g);
    }
  }
  return eliteGenomeIds;
}

export function getMapFromEliteKeysToGenomeIds(eliteMap) {
  const eliteKeysToGenomeIds = new Map();
  for (const cellKey in eliteMap.cells) {
    if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
      eliteKeysToGenomeIds.set(cellKey, eliteMap.cells[cellKey].elts[0].g);
    }
  }
  return eliteKeysToGenomeIds;
}