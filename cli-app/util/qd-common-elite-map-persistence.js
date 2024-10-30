///// elite map perisistence
import fs from 'fs-extra';
import { promises as fsPromise } from 'fs';
import { runCmd } from './qd-common.js';

export function createEvoRunDir( evoRunDirPath ) {
  if( ! fs.existsSync(evoRunDirPath) ) fs.mkdirSync( evoRunDirPath, { recursive: true } );
}

export function getGenomeKey( evolutionRunId, genomeId ) {
  return `genome_${evolutionRunId}_${genomeId}`;
}
export function getFeaturesKey( evolutionRunId, genomeId ) {
  return `features_${evolutionRunId}_${genomeId}`;
}

export async function readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath ) {
  let genomeJSONString;
  try {
    const genomeKey = getGenomeKey(evolutionRunId, genomeId);
    const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
    const genomeFilePath = `${evoRunDirPath}${evoRunDirPathSeparator}${genomeKey}.json`;
    if( fs.existsSync(genomeFilePath) ) {
      genomeJSONString = fs.readFileSync(genomeFilePath, 'utf8');
      // console.log(`Genome file found: ${genomeFilePath}`);
    } else {
      console.error(`Genome file NOT found: ${genomeFilePath}`);
    }
  } catch( err ) {
    console.error("readGenomeFromDisk: ", err);
  }
  return genomeJSONString;
}

export function saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName, addToGit ) {
  if( Array.isArray(eliteMap) ) {
    for( const oneEliteMap of eliteMap ) {
      const refSetName = oneEliteMap.classConfigurations[0].refSetName;
      saveEliteMapToDisk( oneEliteMap, evoRunDirPath, evolutionRunId, refSetName, addToGit );
    }
  } else {
    const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
    const eliteMapFileName = `${getEliteMapKey(evolutionRunId, terrainName)}.json`;
    const eliteMapFilePath = `${evoRunDirPath}${evoRunDirPathSeparator}${eliteMapFileName}`;
    const eliteMapStringified = JSON.stringify(eliteMap, null, 2); // prettified to obtain the benefits (compression of git diffs)
    // await fsPromise.writeFile( eliteMapFilePath, eliteMapStringified );
    if( ! fs.existsSync(eliteMapFilePath) ) {
      fs.mkdirSync( evoRunDirPath, { recursive: true } );
    }
    fs.writeFileSync( eliteMapFilePath, eliteMapStringified );

    if( addToGit ) {
      // add file to git (possibly redundantly)
      runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);
    }
  }
}
export function readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName ) {
  let eliteMap;
  try {
    const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
    const eliteMapFilePath = `${evoRunDirPath}${evoRunDirPathSeparator}${getEliteMapKey(evolutionRunId, terrainName)}.json`;
    if( fs.existsSync(eliteMapFilePath) ) {
      const eliteMapJSONString = fs.readFileSync(eliteMapFilePath, 'utf8');
      eliteMap = JSON.parse( eliteMapJSONString );
    }
  } catch( err ) {
    console.error("readEliteMapFromDisk: ", err);
    throw new Error("Error reading eliteMap from disk");
  }
  return eliteMap;
}

export function saveEliteMapMetaToDisk( eliteMapMeta, evoRunDirPath, evolutionRunId ) {
  const eliteMapMetaFileName = `eliteMapMeta_${evolutionRunId}.json`;
  const eliteMapMetaFilePath = `${evoRunDirPath}${eliteMapMetaFileName}`;
  const eliteMapMetaStringified = JSON.stringify(eliteMapMeta, null, 2); // prettified to obtain the benefits (compression of git diffs)
  fs.writeFileSync( eliteMapMetaFilePath, eliteMapMetaStringified );
}

export function readEliteMapMetaFromDisk( evolutionRunId, evoRunDirPath) {
  let eliteMapMeta;
  try {
    const eliteMapMetaFilePath = `${evoRunDirPath}eliteMapMeta_${evolutionRunId}.json`;
    if( fs.existsSync(eliteMapMetaFilePath) ) {
      const eliteMapMetaJSONString = fs.readFileSync(eliteMapMetaFilePath, 'utf8');
      eliteMapMeta = JSON.parse( eliteMapMetaJSONString );
    }
  } catch( err ) {
    console.error("readEliteMapMetaFromDisk: ", err);
  }
  return eliteMapMeta;
}

export async function saveCellFeaturesToDisk( cellFeatures, eliteMap, evoRunDirPath, evolutionRunId ) {
  const cellFeaturesDirPath = `${evoRunDirPath}cellFeatures/`;
  if( ! fs.existsSync(cellFeaturesDirPath) ) fs.mkdirSync( cellFeaturesDirPath, { recursive: true } );
  // for each cell key in cellFeatures, save the features to disk with the corresponding key
  let featureExtractionType;
  if( eliteMap.classConfigurations && eliteMap.classConfigurations.length ) {
    featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
  }
  for( const cellKey in cellFeatures ) {
    if( ! featureExtractionType || cellFeatures[cellKey][featureExtractionType] ) {
      // either we're not using classConfigurations or
      // we're using classConfigurations and the featureExtractionType is present in the cellFeatures;
      // - this means that the features have already been extracted for this cellKey, in this map
      if( ! eliteMap.cells[cellKey].elts[0] ) {
        console.error(`Error: eliteMap.cells[${cellKey}] is undefined`);
      }
      if( ! eliteMap.cells[cellKey].elts[0] ) {
        console.error(`Error: eliteMap.cells[${cellKey}].elts[0] is undefined`);
      }
      const genomeId = eliteMap.cells[cellKey].elts[0].g;
      const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
      const cellFeaturesFileName = `${featuresKey}.json`;
      const cellFeaturesFilePath = `${cellFeaturesDirPath}${cellFeaturesFileName}`;
      // using .stat instead of .existsSync in an effort to speed things up a bit: https://stackoverflow.com/a/67837194/169858
      const exists = !!(await fs.promises.stat(cellFeaturesFilePath).catch(() => null));
      if( ! exists ) {
        const cellFeaturesStringified = JSON.stringify(cellFeatures[cellKey], null, 2); // prettified to obtain the benefits (compression of git diffs)
        fs.writeFileSync( cellFeaturesFilePath, cellFeaturesStringified );  
      }
    }
  }
}
export function readCellFeaturesFromDiskForEliteMap( evoRunDirPath, evolutionRunId, eliteMap ) {
  let cellFeatures = {};
  // for all populated cells in the eliteMap, read the features from disk
  for( const cellKey in eliteMap.cells ) {
    if( eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length ) {
      const genomeId = eliteMap.cells[cellKey].elts[0].g;
      const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
      const cellFeaturesFileName = `${featuresKey}.json`;
      const cellFeaturesFilePath = `${evoRunDirPath}cellFeatures/${cellFeaturesFileName}`;
      if( fs.existsSync(cellFeaturesFilePath) ) {
        try {
          const cellFeaturesJSONString = fs.readFileSync( cellFeaturesFilePath, 'utf8' );
          const cellFeaturesJSON = JSON.parse( cellFeaturesJSONString );
          cellFeatures[cellKey] = cellFeaturesJSON;
        } catch( err ) {
          console.error("readCellFeaturesFromDiskForEliteMap: ", err);
        }
      }
    }
  }
  return cellFeatures;
}

export function saveLostFeaturesToDisk( lostFeatures, eliteMap, evoRunDirPath ) {
  const lostFeaturesDirPath = `${evoRunDirPath}lostFeatures/`;
  if( ! fs.existsSync(lostFeaturesDirPath) ) fs.mkdirSync( lostFeaturesDirPath, { recursive: true } );
  const featuresKey = `lostFeatures_generation_${eliteMap.generationNumber}`;
  const lostFeaturesFileName = `${featuresKey}.json`;
  const lostFeaturesFilePath = `${lostFeaturesDirPath}${lostFeaturesFileName}`;
  const lostFeaturesStringified = JSON.stringify(lostFeatures, null, 2); // prettified to obtain the benefits (compression of git diffs)
  fs.writeFileSync( lostFeaturesFilePath, lostFeaturesStringified );
}
export function readAllLostFeaturesFromDisk( evoRunDirPath, projectionFeatureType ) {
  const lostFeaturesDirPath = `${evoRunDirPath}lostFeatures/`;
  let allLostFeatures = [];

  if (fs.existsSync(lostFeaturesDirPath)) {
    const files = fs.readdirSync(lostFeaturesDirPath);
    const lostFeaturesFiles = files.filter(file => file.startsWith('lostFeatures_generation_'));

    for (const file of lostFeaturesFiles) {
      const filePath = `${lostFeaturesDirPath}${file}`;
      const lostFeaturesJSONString = fs.readFileSync(filePath, 'utf8');
      const lostFeatures = JSON.parse(lostFeaturesJSONString);

      for (const key in lostFeatures) {
        if (lostFeatures.hasOwnProperty(key) && lostFeatures[key][projectionFeatureType] && lostFeatures[key][projectionFeatureType].features) {
          allLostFeatures.push(lostFeatures[key][projectionFeatureType].features);
        }
      }
    }
  }

  return allLostFeatures;
}

export function readFeaturesForGenomeIdsFromDisk( evoRunDirPath, evolutionRunId, genomeIds ) {
  let genomeFeatures = {};
  for( const genomeId of genomeIds ) {
    const featuresKey = getFeaturesKey(evolutionRunId, genomeId);
    const featuresFileName = `${featuresKey}.json`;
    const featuresFilePath = `${evoRunDirPath}cellFeatures/${featuresFileName}`;
    if( fs.existsSync(featuresFilePath) ) {
      const featuresJSONString = fs.readFileSync( featuresFilePath, 'utf8' );
      const featuresJSON = JSON.parse( featuresJSONString );
      genomeFeatures[genomeId] = featuresJSON;
    }
  }
  return genomeFeatures;
}

export function getEliteGenomeIdsFromEliteMaps( eliteMaps ) {
  let eliteGenomeIds = [];
  if( Array.isArray(eliteMaps) ) {
    for( const oneEliteMap of eliteMaps ) {
      eliteGenomeIds = eliteGenomeIds.concat( getEliteGenomeIdsFromEliteMap(oneEliteMap) );
    }
  } else {
    eliteGenomeIds = getEliteGenomeIdsFromEliteMap(eliteMaps);
  }
  return eliteGenomeIds;
}

export function getEliteGenomeIdsFromEliteMap( eliteMap ) {
  let eliteGenomeIds = [];
  for( const cellKey in eliteMap.cells ) {
    if( eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length ) {
      eliteGenomeIds.push( eliteMap.cells[cellKey].elts[0].g );
    }
  }
  return eliteGenomeIds;
}

export function getMapFromEliteKeysToGenomeIds( eliteMap ) { // similar to getEliteGenomeIdsFromEliteMap; initially implemented for terrain-remap
  const eliteKeysToGenomeIds = new Map();
  for( const cellKey in eliteMap.cells ) {
    if( eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length ) {
      eliteKeysToGenomeIds.set( cellKey, eliteMap.cells[cellKey].elts[0].g );
    }
  }
  return eliteKeysToGenomeIds;
}

export async function saveGenomeToDisk( genome, evolutionRunId, genomeId, evoRunDirPath, addToGit ) {
  const genomeKey = getGenomeKey(evolutionRunId, genomeId);
  const genomeFileName = `${genomeKey}.json`;
  const genomeFilePath = `${evoRunDirPath}${genomeFileName}`;
  if( fs.existsSync(genomeFilePath) ) {
    console.error(`Error: genome file already exists at ${genomeFilePath}`);
  }
  const genomeString = JSON.stringify({
    _id: genomeKey,
    genome
  });
  await fsPromise.writeFile( genomeFilePath, genomeString );
  if( addToGit ) {
    // add file to git (without committing)
    runCmd(`git -C ${evoRunDirPath} add ${genomeFileName}`);
  }
}

export function getEliteMapKey( evolutionRunId, terrainName ) {
  if( undefined === terrainName ) {
    return `elites_${evolutionRunId}`;
  } else {
    return `elites_${evolutionRunId}_${terrainName}`;
  }
}