import fs from 'fs';
import {
  runCmd, spawnCmd,
  getEvoRunDirPath,
  readGenomeAndMetaFromDisk,
  calcVariance, calcStandardDeviation, calcMeanDeviation,
  averageAttributes, standardDeviationAttributes
} from './util/qd-common.js';
import nthline from 'nthline';
import {
	getAudioBufferFromGenomeAndMeta, getGenomeFromGenomeString,
  patchFromAsNEATnetwork, getRoundedFrequencyValue
} from 'kromosynth';
import { getAudioContext, getNewOfflineAudioContext, playAudio } from './util/rendering-common.js';
import figlet from 'figlet';
import { log } from 'console';
import { mean } from 'mathjs';
import Statistics from 'statistics.js'


///// class labels

export async function getClassLabels( evoRunConfig, evoRunId ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, 0 );
  const cellKeys = Object.keys(eliteMap.cells);
  return cellKeys;
}

// checks if the evoRunConfig contains classConfigurations, each with a "refSetName" defining a "terrain" for one eliteMap
// - if so, returns the terrain names, indicating that there are multiple eliteMaps
function getTerrainNames( evoRunConfig ) {
  const classConfigurations = evoRunConfig.classifiers[evoRunConfig.classifierIndex].classConfigurations;
  if( classConfigurations ) {
    return classConfigurations.map( classConfiguration => classConfiguration.refSetName );
  }
  return [];
}


///// elite diversity, from cellFeatures files

function calculateEuclideanDistance(vectorA, vectorB) {
  let distance = 0.0;
  for (let i = 0; i < vectorA.length; i++) {
      distance += Math.pow(vectorA[i] - vectorB[i], 2);
  }
  return Math.sqrt(distance);
}
function calculateDistanceMatrix(embeddings) {
  const numEmbeddings = embeddings.length;
  const distanceMatrix = Array.from(Array(numEmbeddings), () => new Array(numEmbeddings));
  for (let i = 0; i < numEmbeddings; i++) {
      for (let j = i; j < numEmbeddings; j++) { // Start at i to avoid redundant calculations.
          if (i === j) {
              distanceMatrix[i][j] = 0; // Distance to itself is 0.
          } else {
              const distance = calculateEuclideanDistance(embeddings[i], embeddings[j]);
              distanceMatrix[i][j] = distance;
              distanceMatrix[j][i] = distance; // Use symmetry to save computation.
          }
      }
  }
  return distanceMatrix;
}
function calculateAveragePairwiseDistance(distanceMatrix) {
  let sumDistances = 0;
  let count = 0;
  for (let i = 0; i < distanceMatrix.length; i++) {
      for (let j = i + 1; j < distanceMatrix.length; j++) { // Avoid diagonal and redundant pairs.
          sumDistances += distanceMatrix[i][j];
          count += 1;
      }
  }
  return sumDistances / count;
}
export function getDiversityFromEmbeddingFiles( evoRunConfig, evoRunId) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const embeddingFilePaths = fs.readdirSync(evoRunDirPath).filter( filePath => filePath.includes("cellFeatures_") );
  const diversity = {};
  for( const oneEmbeddingFilePath of embeddingFilePaths ) {
    // given a file name ending like "_gen100_terrain0.json", we want to extract the generation number and the "terrain0" part
    const cellFeaturesAtGenerationMatch = oneEmbeddingFilePath.match(/_gen(\d+)_(.*)\.json/);
    if( cellFeaturesAtGenerationMatch ) {
      const generation = oneEmbeddingFilePath.match(/_gen(\d+)_/)[1];
      const terrain = oneEmbeddingFilePath.match(/_gen\d+_(.*)\.json/)[1];
      // read in the file at oneEmbeddingFilePath
      const cellFeaturesString = fs.readFileSync(`${evoRunDirPath}${oneEmbeddingFilePath}`, 'utf8');
      const cellFeatures = JSON.parse(cellFeaturesString);
      // for each value in the cellFeatures object, calculate the diversity
      const embeddings = [];
      for( const oneCellKey of Object.keys(cellFeatures) ) {
        const cellFeaturesAndEmbedding = cellFeatures[oneCellKey];
        const embedding = cellFeaturesAndEmbedding.embedding;
        if( embedding ) { // there can also be keys lik "_timestamp" and "_generationNumber"
          // calculate the mean of the embeddings
          const meanVector = embedding.reduce((acc, vec) => acc.map((val, i) => val + vec[i]), new Array(embedding[0].length).fill(0))
          .map(val => val / embedding.length);
          embeddings.push(meanVector);
        }
      }
      const distanceMatrix = calculateDistanceMatrix(embeddings);
      const averagePairwiseDistance = calculateAveragePairwiseDistance(distanceMatrix);
      if( ! diversity[terrain] ) {
        diversity[terrain] = {};
      }
      diversity[terrain][generation] = averagePairwiseDistance;
    }
  }
  return diversity;
}

///// QD score

export async function calculateQDScoresForAllIterations( evoRunConfig, evoRunId, stepSize = 1, excludeEmptyCells, classRestriction, maxIterationIndex ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  let qdScores;
  const terrainNames = getTerrainNames( evoRunConfig );
  if( terrainNames.length ) {
    qdScores = {};
    for( const oneTerrainName of terrainNames ) { // not taking maxIterationIndex into account here, for now
      qdScores[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
    }
    for( let iterationIndex = 0, qdScoreIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, qdScoreIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating QD scores for iteration ${iterationIndex}...`);
        for( const oneTerrainName of terrainNames ) {
          qdScores[oneTerrainName][qdScoreIndex] = await calculateQDScoreForOneIteration(
            evoRunConfig, evoRunId, iterationIndex, excludeEmptyCells, classRestriction, oneTerrainName
          );
        }
      }
      // if( maxIterationIndex && maxIterationIndex < iterationIndex ) break;
    }
  } else {
    if( maxIterationIndex ) {
      qdScores = new Array(Math.ceil(maxIterationIndex / stepSize));
    } else {
      qdScores = new Array(Math.ceil(commitCount / stepSize));
    }
    for( let iterationIndex = 0, qdScoreIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, qdScoreIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating QD score for iteration ${iterationIndex}...`);
        qdScores[qdScoreIndex] = await calculateQDScoreForOneIteration(
          evoRunConfig, evoRunId, iterationIndex, excludeEmptyCells, classRestriction
        );
      }
      if( maxIterationIndex && maxIterationIndex < iterationIndex ) break;
    }
  }
  const qdScoresStringified = JSON.stringify(qdScores);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const qdScoresFilePath = `${evoRunDirPath}qd-scores_step-${stepSize}.json`;
  fs.writeFileSync( qdScoresFilePath, qdScoresStringified );
  return qdScores;
}

export async function calculateQDScoreForOneIteration( 
    evoRunConfig, evoRunId, iterationIndex, excludeEmptyCells, classRestriction, terrainName
) {
  const eliteMap = await getEliteMap( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
    );
  return calculateQDScoreForEliteMap( eliteMap, excludeEmptyCells, classRestriction ); 
}

export function calculateQDScoreForEliteMap(
  eliteMap, excludeEmptyCells, classRestriction
) {
  const cellKeys = getCellKeys( eliteMap, excludeEmptyCells, classRestriction );
  const cellCount = getCellCount( eliteMap, excludeEmptyCells, classRestriction );
  let cumulativeScore = 0;
  let cellScoreCounts = 0;
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      cumulativeScore += parseFloat(eliteMap.cells[oneCellKey].elts[0].s);
      cellScoreCounts++;
    }
  }
  // proper QD score is a holistic metric which sums the objective values of all cells in the archive
  // (https://btjanaka.net/static/qd-auc/qd-auc-paper.pdf)
  // while dividing by cellCount (including empty or not (covered) would be performance or precision)
  let qdScore;
  // when we have a classRestriction, assume that we are comparing against single-class-runs
  // and that the qdScore is the performance against individual classes, rather than a sum over all
  if( classRestriction && classRestriction.length ) {
    console.log("dividing qd score, from", cellScoreCounts, "cellScoreCounts by", cellCount)
    qdScore = cumulativeScore / cellCount; // TODO: median?
  } else {
    qdScore = cumulativeScore;
  }
  return qdScore;
}

///// cell scores

export async function getCellScoresForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const cellScores = new Array(Math.ceil(commitCount / stepSize));
  for( let iterationIndex = 0, cellScoresIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, cellScoresIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating cell scores for iteration ${iterationIndex}...`);
      cellScores[cellScoresIndex] = await getCellScoresForOneIteration(
        evoRunConfig, evoRunId, iterationIndex
      );
    }
  }
  const cellScoresStringified = JSON.stringify(cellScores);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const cellScoresFilePath = `${evoRunDirPath}cell-scores_step-${stepSize}.json`;
  fs.writeFileSync( cellScoresFilePath, cellScoresStringified );
  return cellScores;
}

export async function getCellScoresForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const cellScores = cellKeys.map( oneCellKey => {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      return parseFloat(eliteMap.cells[oneCellKey].elts[0].s);
    } else {
      return 0;
    }
  });
  return cellScores;
}

///// map coverage

export function getCoverageForEliteMap( eliteMap, scoreThreshold = 0 ) {
  const cellKeys = Object.keys(eliteMap.cells);
  const cellCount = cellKeys.length;
  let coveredCellCount = 0;
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      if( parseFloat(eliteMap.cells[oneCellKey].elts[0].s) >= scoreThreshold ) {
        coveredCellCount++;
      }
    }
  }
  const coverage = coveredCellCount / cellCount;
  return coverage;
}

export async function getCoverageForOneIteration( evoRunConfig, evoRunId, iterationIndex, scoreThreshold = 0, terrainName ) {
  const eliteMap = await getEliteMap( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
  );
  return getCoverageForEliteMap( eliteMap, scoreThreshold );
}

export async function getCoverageForAllIterations( evoRunConfig, evoRunId, stepSize = 1, scoreThreshold = 0 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const terrainNames = getTerrainNames( evoRunConfig );
  let coverages;
  if( terrainNames.length ) {
    coverages = {};
    for( const oneTerrainName of terrainNames ) {
      coverages[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
    }
    for( let iterationIndex = 0, coverageIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, coverageIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating coverage for iteration ${iterationIndex}...`);
        for( const oneTerrainName of terrainNames ) {
          coverages[oneTerrainName][coverageIndex] = await getCoverageForOneIteration(
            evoRunConfig, evoRunId, iterationIndex, scoreThreshold, oneTerrainName
          );
        }
      }
    }
  } else {
    coverages = new Array(Math.ceil(commitCount / stepSize));
    for( let iterationIndex = 0, coverageIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, coverageIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating coverage for iteration ${iterationIndex}...`);
        coverages[coverageIndex] = await getCoverageForOneIteration(
          evoRunConfig, evoRunId, iterationIndex, scoreThreshold
        );
      }
    }
  }

  const coveragesStringified = JSON.stringify(coverages);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const coveragesFilePath = `${evoRunDirPath}coverages_step-${stepSize}_threshold-${scoreThreshold}.json`;
  fs.writeFileSync( coveragesFilePath, coveragesStringified );
  return coverages;
}


// QD score heatmap

export async function getScoreMatrixForLastIteration( evoRunConfig, evoRunId ) {
  const terrainNames = getTerrainNames( evoRunConfig );
  let scoreMatrixes;
  if( terrainNames.length ) {
    scoreMatrixes = {};
    for( const oneTerrainName of terrainNames ) {
      console.log(`Calculating score matrix for terrain ${oneTerrainName}...`);
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, undefined/*iteration*/, false, oneTerrainName );
      scoreMatrixes[oneTerrainName] = await getScoreMatrixForTerrain( evoRunConfig, evoRunId, oneTerrainName );
    }
  } else {
    const eliteMap = await getEliteMap( evoRunConfig, evoRunId, undefined/*iteration*/, false );
    scoreMatrixes = await getScoreMatrixForTerrain( evoRunConfig, evoRunId );
  }
  return scoreMatrixes;
}

export async function getScoreMatrixForTerrain( evoRunConfig, evoRunId, terrainName ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, undefined/*iteration*/, false, terrainName );
  return getScoreMatrixFromEliteMap( eliteMap );
}

export async function getScoreMatrixFromEliteMap( eliteMap ) {
  let scoresArray = [];

  // Iterate over each key in the JSON object
  for (let key in eliteMap.cells) {
    let [firstIndex, secondIndex] = key.split(/[_|,]/); // Split key by underscore or comma

    firstIndex = parseInt(firstIndex);
    secondIndex = parseInt(secondIndex);

    // Create nested arrays to store scores
    scoresArray[firstIndex] = scoresArray[firstIndex] || [];

    // Check if "elts" array exists and has elements
    if (
      eliteMap.cells[key].hasOwnProperty("elts") && 
      eliteMap.cells[key].elts.length > 0
    ) {
      scoresArray[firstIndex][secondIndex] = eliteMap.cells[key].elts[0].s;
    } else {
      scoresArray[firstIndex][secondIndex] = null; // Handle empty "elts" array
    }
  }

  return scoresArray;
}

///// elite count
export function getNewEliteCountForEliteMap( eliteMap ) {
  return eliteMap.eliteCountAtGeneration;
}
export async function getNewEliteCountForOneIteration( evoRunConfig, evoRunId, iterationIndex, terrainName ) {
  const eliteMap = await getEliteMap( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
  );
  return getNewEliteCountForEliteMap( eliteMap );
}
export async function getNewEliteCountForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  // NB: stepSize larger than 1 doesn't really make sense for new elite count
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const terrainNames = getTerrainNames( evoRunConfig );
  let eliteCounts;
  if( terrainNames.length ) {
    eliteCounts = {};
    for( const oneTerrainName of terrainNames ) {
      eliteCounts[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
    }
    for( let iterationIndex = 0, eliteCountIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, eliteCountIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating elite count for iteration ${iterationIndex}...`);
        for( const oneTerrainName of terrainNames ) {
          eliteCounts[oneTerrainName][eliteCountIndex] = await getNewEliteCountForOneIteration(
            evoRunConfig, evoRunId, iterationIndex, oneTerrainName
          );
        }
      }
    }
  } else {
    eliteCounts = new Array(Math.ceil(commitCount / stepSize));
    for( let iterationIndex = 0, eliteCountIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, eliteCountIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating elite count for iteration ${iterationIndex}...`);
        eliteCounts[eliteCountIndex] = await getNewEliteCountForOneIteration(
          evoRunConfig, evoRunId, iterationIndex
        );
      }
    }
  }
  const eliteCountsStringified = JSON.stringify(eliteCounts);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const eliteCountsFilePath = `${evoRunDirPath}elite-counts_step-${stepSize}.json`;
  fs.writeFileSync( eliteCountsFilePath, eliteCountsStringified );
  return eliteCounts;
}

///// genome sets

export async function getGenomeSetsForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const genomeKeys = cellKeys.map( oneCellKey => {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      return eliteMap.cells[oneCellKey].elts[0].g;
    }
  });
  const genomeSet = new Set(genomeKeys);
  return genomeSet;
}

async function getNodeAndConnectionCountSetsForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const nodeAndConnectionCountKeys = new Set();
  for (const oneCellKey of cellKeys) {
    if (eliteMap.cells[oneCellKey].elts.length) {
      const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
      const { 
        cppnNodeCount, cppnConnectionCount, asNEATPatchNodeCount, asNEATPatchConnectionCount 
      } = await getGenomeStatistics(genomeId, evoRunConfig, evoRunId);
      const nodeAndConnectionCountKey = `${cppnNodeCount}-${cppnConnectionCount}-${asNEATPatchNodeCount}-${asNEATPatchConnectionCount}`;
      nodeAndConnectionCountKeys.add(nodeAndConnectionCountKey);
    }
  }
  return nodeAndConnectionCountKeys;
}

export async function getGenomeSetsForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const genomeSets = new Array(Math.ceil(commitCount / stepSize));
  const nodeAndConnectionCountSets = []; // coarser difference metric; where there is actual difference in node and connection count
  const genomeSetsAdditions = new Array(Math.ceil(commitCount / stepSize)); // new genomes added in each iteration
  const genomeSetsRemovals = new Array(Math.ceil(commitCount / stepSize)); // genomes removed in each iteration
  for( let iterationIndex = 0, genomeSetsIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, genomeSetsIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating genome sets for iteration ${iterationIndex}...`);
      genomeSets[genomeSetsIndex] = await getGenomeSetsForOneIteration(
        evoRunConfig, evoRunId, iterationIndex
      );
      nodeAndConnectionCountSets[genomeSetsIndex] = await getNodeAndConnectionCountSetsForOneIteration(
        evoRunConfig, evoRunId, iterationIndex
      );
      if( genomeSetsIndex > 0 ) {
        genomeSetsAdditions[genomeSetsIndex] = new Set(
          [...genomeSets[genomeSetsIndex]].filter(x => !genomeSets[genomeSetsIndex-1].has(x))
        );
        genomeSetsRemovals[genomeSetsIndex] = new Set(
          [...genomeSets[genomeSetsIndex-1]].filter(x => !genomeSets[genomeSetsIndex].has(x))
        );
      }
    }
  }
  return { genomeSets, nodeAndConnectionCountSets, genomeSetsAdditions, genomeSetsRemovals };
}

async function getGenomeSetsWithRenderingVariationsAsContainerDimensionsForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const renderingVariationKeys = new Set(
    cellKeys.map( oneCellKey => oneCellKey.split("-")[oneCellKey.split("-").length-1] )
  );
  const genomeSets = {};
  for( const oneRenderingVariationKey of renderingVariationKeys ) {
    cellKeys.filter( oneCellKey => oneCellKey.split("-")[oneCellKey.split("-").length-1] === oneRenderingVariationKey ).map( oneCellKey => {
      if( eliteMap.cells[oneCellKey].elts.length ) {
        const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
        if( !genomeSets[oneRenderingVariationKey] ) {
          genomeSets[oneRenderingVariationKey] = new Set();
        }
        genomeSets[oneRenderingVariationKey].add( genomeId );
      }
    } );
  }
  // get the intersection of all sets
  const genomeSetIntersection = new Set(
    [...genomeSets[Object.keys(genomeSets)[0]]].filter( genomeId => {
      return Object.keys(genomeSets).every( oneRenderingVariationKey => {
        return genomeSets[oneRenderingVariationKey].has( genomeId );
      } );
    } )
  );
  genomeSets["intersection-all"] = genomeSetIntersection;

  // another approach to get the intersection of all sets, confirming that the above approach is correct
  // // array containing the sets as arrays
  // const genomeSetsAsArrays = [];
  // for( const oneRenderingVariationKey of Object.keys(genomeSets) ) {
  //   genomeSetsAsArrays.push( [...genomeSets[oneRenderingVariationKey]] );
  // }
  // console.log("genomeSetsAsArrays",genomeSetsAsArrays)
  // genomeSets["intersection2"] = new Set(genomeSetsAsArrays.reduce((a, b) => a.filter(c => b.includes(c))));

  // count how often a genome appears in at least two sets
  const genomeSetIntersectionCount = {};
  for( const oneRenderingVariationKey of Object.keys(genomeSets) ) {
    for( const oneGenomeId of genomeSets[oneRenderingVariationKey] ) {
      if( !genomeSetIntersectionCount[oneGenomeId] ) {
        genomeSetIntersectionCount[oneGenomeId] = 0;
      }
      genomeSetIntersectionCount[oneGenomeId]++;
    }
  }
  // get the genomes that appear in at least two sets
  const genomeSetIntersection2 = new Set(
    Object.keys(genomeSetIntersectionCount).filter( genomeId => genomeSetIntersectionCount[genomeId] > 1 )
  );
  genomeSets["intersection2"] = genomeSetIntersection2;
  // get the genomes that appear in at least three sets
  const genomeSetIntersection3 = new Set(
    Object.keys(genomeSetIntersectionCount).filter( genomeId => genomeSetIntersectionCount[genomeId] > 2 )
  );
  genomeSets["intersection3"] = genomeSetIntersection3;

  // total number of genomes in all sets
  const genomeSetUnion = new Set();
  for( const oneRenderingVariationKey of Object.keys(genomeSets) ) {
    for( const oneGenomeId of genomeSets[oneRenderingVariationKey] ) {
      genomeSetUnion.add( oneGenomeId );
    }
  }
  genomeSets["union"] = genomeSetUnion;
  
  return genomeSets;
}

export async function getGenomeSetsWithRenderingVariationsAsContainerDimensionsForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const genomeSets = new Array(Math.ceil(commitCount / stepSize));
  for( let iterationIndex = 0, genomeSetsIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, genomeSetsIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating genome sets for iteration ${iterationIndex}...`);
      genomeSets[genomeSetsIndex] = await getGenomeSetsWithRenderingVariationsAsContainerDimensionsForOneIteration(
        evoRunConfig, evoRunId, iterationIndex
      );
    }
  }
  return genomeSets;
}

export async function getGenomeCountsForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const genomeSetsCollection = await getGenomeSetsForAllIterations( evoRunConfig, evoRunId, stepSize );
  return { // conversion to arrays for JSON.stringify
    genomeCount: genomeSetsCollection.genomeSets.map( oneSet => [...oneSet].length ), 
    nodeAndConnectionCountSetCount: genomeSetsCollection.nodeAndConnectionCountSets.map( oneSet => [...oneSet].length ),
    genomeSetsAdditions: genomeSetsCollection.genomeSetsAdditions.map( oneSet => [...oneSet].length ),
    genomeSetsRemovals: genomeSetsCollection.genomeSetsRemovals.map( oneSet => [...oneSet].length )
  };
}

export async function getGenomeCountsWithRenderingVariationsAsContainerDimensionsForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const genomeSetsCollection = await getGenomeSetsWithRenderingVariationsAsContainerDimensionsForAllIterations( evoRunConfig, evoRunId, stepSize );
  return { // conversion to arrays for JSON.stringify
    genomeCount: genomeSetsCollection.map( oneSet => {
      // [...oneSet].length
      // for each key in oneSet, get the size of the set and map to an objct with the key as the key and the size as the value
      const genomeCount = {};
      for( const oneKey of Object.keys(oneSet) ) {
        genomeCount[oneKey] = oneSet[oneKey].size;
      }
      return genomeCount;
    } )
  };
}

///// network complexity

export async function getGenomeStatisticsAveragedForAllIterations( evoRunConfig, evoRunId, stepSize = 1, excludeEmptyCells, classRestriction, maxIterationIndex ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  let genomeStatistics;
  if( maxIterationIndex ) {
    genomeStatistics = new Array(Math.ceil(maxIterationIndex / stepSize));
  } else {
    genomeStatistics = new Array(Math.ceil(commitCount / stepSize));
  }
  for( let iterationIndex = 0, genomeStatisticsIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, genomeStatisticsIndex++ ) {
    const lastIteration = ((iterationIndex+stepSize) > commitCount);
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating genome statistics for iteration ${iterationIndex}...`);
      genomeStatistics[genomeStatisticsIndex] = await getGenomeStatisticsAveragedForOneIteration(
        evoRunConfig, evoRunId, iterationIndex,
        excludeEmptyCells, classRestriction,
        lastIteration
      );
    }
    if( maxIterationIndex && maxIterationIndex < iterationIndex ) break;
  }
  const genomeStatisticsStringified = JSON.stringify(genomeStatistics);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const genomeStatisticsFilePath = `${evoRunDirPath}genome-statistics_step-${stepSize}.json`;
  fs.writeFileSync( genomeStatisticsFilePath, genomeStatisticsStringified );
  return genomeStatistics;
}

export async function getGenomeStatisticsAveragedForOneIteration( 
    evoRunConfig, evoRunId, iterationIndex, excludeEmptyCells, classRestriction,
    calculateNodeTypeStatistics = false
) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = getCellKeys( eliteMap, excludeEmptyCells, classRestriction );
  // get count of cells where the elts value contains a non empty array
  const cellCount = getCellCount( eliteMap, excludeEmptyCells, classRestriction );
  const cppnCounts = [];
  let cumulativeCppnCounts = 0;
  const cppnNodeCounts = [];
  let cumulativeCppnNodeCount = 0;
  const cppnConnectionCounts = [];
  let cumulativeCppnConnectionCount = 0;
  const asNEATPatchNodeCounts = [];
  let cumulativeAsNEATPatchNodeCount = 0;
  const asNEATPatchConnectionCounts = [];
  let cumulativeAsNEATPatchConnectionCount = 0;
  const networkOutputsCounts = [];
  let cumulativeNetworkOutputsCount = 0;
  const frequencyRangesCounts = [];
  let cumulativeFrequencyRangesCount = 0;

  const cppNodeTypeCountObjects = [];
  const asNEATPatchNodeTypeCountObjects = [];
  
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
      // TODO might want to ensure this is done only once per unique genomeId, to avoid unnecessary disk reads
      const {
        cppnCount,
        cppnNodeCount, cppnConnectionCount, asNEATPatchNodeCount, asNEATPatchConnectionCount,
        networkOutputsCount, frequencyRangesCount
      } = await getGenomeStatistics( genomeId, evoRunConfig, evoRunId );
      cppnNodeCounts.push(cppnNodeCount);
      cumulativeCppnNodeCount += cppnNodeCount;
      cppnConnectionCounts.push(cppnConnectionCount);
      cumulativeCppnConnectionCount += cppnConnectionCount;
      asNEATPatchNodeCounts.push(asNEATPatchNodeCount);
      cumulativeAsNEATPatchNodeCount += asNEATPatchNodeCount;
      asNEATPatchConnectionCounts.push(asNEATPatchConnectionCount);
      cumulativeAsNEATPatchConnectionCount += asNEATPatchConnectionCount;

      cppnCounts.push(cppnCount);
      cumulativeCppnCounts += cppnCount;

      networkOutputsCounts.push(networkOutputsCount);
      cumulativeNetworkOutputsCount += networkOutputsCount;
      frequencyRangesCounts.push(frequencyRangesCount);
      cumulativeFrequencyRangesCount += frequencyRangesCount;

      if( calculateNodeTypeStatistics ) {
        const { cppnNodeTypeCounts, asNEATPatchNodeTypeCounts } = await getGenomeNodeTypeStatistics( genomeId, evoRunConfig, evoRunId );
        cppNodeTypeCountObjects.push(cppnNodeTypeCounts);
        asNEATPatchNodeTypeCountObjects.push(asNEATPatchNodeTypeCounts);
      }
    }
  }
  const cppnCount = cumulativeCppnCounts / cellCount;
  const cppnCountStdDev = calcStandardDeviation(cppnCounts);
  const cppnNodeCountStdDev = calcStandardDeviation(cppnNodeCounts);
  const averageCppnNodeCount = cumulativeCppnNodeCount / cellCount;
  const cppnConnectionCountStdDev = calcStandardDeviation(cppnConnectionCounts);
  const averageCppnConnectionCount = cumulativeCppnConnectionCount / cellCount;
  const asNEATPatchNodeCountStdDev = calcStandardDeviation(asNEATPatchNodeCounts);
  const averageAsNEATPatchNodeCount = cumulativeAsNEATPatchNodeCount / cellCount;
  const asNEATPatchConnectionCountStdDev = calcStandardDeviation(asNEATPatchConnectionCounts);
  const averageAsNEATPatchConnectionCount = cumulativeAsNEATPatchConnectionCount / cellCount;
  const networkOutputsCountStdDev = calcStandardDeviation(networkOutputsCounts);
  const averageNetworkOutputsCount = cumulativeNetworkOutputsCount / cellCount;
  const frequencyRangesCountStdDev = calcStandardDeviation(frequencyRangesCounts);
  const averageFrequencyRangesCount = cumulativeFrequencyRangesCount / cellCount;

  let cppnNodeTypeCounts;
  let asNEATPatchNodeTypeCounts;
  let cppnNodeTypeCountsStdDev;
  let asNEATPatchNodeTypeCountsStdDev;
  if( calculateNodeTypeStatistics ) {
    cppnNodeTypeCounts = averageAttributes(cppNodeTypeCountObjects);
    asNEATPatchNodeTypeCounts = averageAttributes(asNEATPatchNodeTypeCountObjects);
    cppnNodeTypeCountsStdDev = standardDeviationAttributes(cppNodeTypeCountObjects);
    asNEATPatchNodeTypeCountsStdDev = standardDeviationAttributes(asNEATPatchNodeTypeCountObjects);
  } else {
    cppnNodeTypeCounts = undefined;
    asNEATPatchNodeTypeCounts = undefined;
    cppnNodeTypeCountsStdDev = undefined;
    asNEATPatchNodeTypeCountsStdDev = undefined;
  }

  return {
    cppnCount, cppnCountStdDev,

    cppnNodeCountStdDev, cppnConnectionCountStdDev, asNEATPatchNodeCountStdDev, asNEATPatchConnectionCountStdDev,
    averageCppnNodeCount, averageCppnConnectionCount, averageAsNEATPatchNodeCount, averageAsNEATPatchConnectionCount,
    
    averageNetworkOutputsCount, averageFrequencyRangesCount, networkOutputsCountStdDev, frequencyRangesCountStdDev,

    cppnNodeTypeCounts, asNEATPatchNodeTypeCounts,
    cppnNodeTypeCountsStdDev, asNEATPatchNodeTypeCountsStdDev
  };
}

async function getGenomeStatistics( genomeId, evoRunConfig, evoRunId ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
  const genomeAndMeta = await getGenomeFromGenomeString( genomeString, {} /*evoParams*/ );
  
  // const cppnNodeCount = genomeAndMeta.waveNetwork.offspring.nodes.length;
  // handle single or multiple CPPNs
  let cppnNodeCount = 0;
  let cppnConnectionCount = 0;
  let cppnCount = 0;

  if (genomeAndMeta.waveNetwork.offspring) {
    // Single CPPN
    cppnNodeCount = genomeAndMeta.waveNetwork.offspring.nodes.filter(
      node => node.nodeType !== "Bias" && node.nodeType !== "Input" && node.nodeType !== "Output"
    ).length;
    cppnConnectionCount = genomeAndMeta.waveNetwork.offspring.connections.length;
    cppnCount = 1;
  } else if (genomeAndMeta.waveNetwork.oneCPPNPerFrequency === true && genomeAndMeta.waveNetwork.CPPNs) {
    // Multiple CPPNs
    for (const key in genomeAndMeta.waveNetwork.CPPNs) {
      if (genomeAndMeta.waveNetwork.CPPNs[key].offspring) {
        const offspring = genomeAndMeta.waveNetwork.CPPNs[key].offspring;
        cppnNodeCount += offspring.nodes.filter(
          node => node.nodeType !== "Bias" && node.nodeType !== "Input" && node.nodeType !== "Output"
        ).length;
        cppnConnectionCount += offspring.connections.length;
        cppnCount++;
      }
    }
  }

  const averageCppnNodeCount = cppnCount > 0 ? cppnNodeCount / cppnCount : 0;
  const averageCppnConnectionCount = cppnCount > 0 ? cppnConnectionCount / cppnCount : 0;
  
  const asNEATPatchNodeCount = genomeAndMeta.asNEATPatch.nodes.length;
  const asNEATPatchConnectionCount = genomeAndMeta.asNEATPatch.connections.length;
  // console.log("genomeId:", genomeId, "cppnNodeCount:", cppnNodeCount, "cppnConnectionCount:", cppnConnectionCount, "asNEATPatchNodeCount:", asNEATPatchNodeCount, "asNEATPatchConnectionCount:", asNEATPatchConnectionCount);

  // get synthIsPatch from the genome, to have networkOutputs available, and calculate average CPPN output usage and number of frequency ranges; a Set after util.range.getRoundedFrequencyValue
  const synthIsPatch = patchFromAsNEATnetwork( genomeAndMeta.asNEATPatch.toJSON() );
  const uniqueNetworkOutputs = new Set();
  const uniqueRoundedFrequencies = new Set();
  synthIsPatch.networkOutputs.forEach(output => {
    uniqueNetworkOutputs.add(output.networkOutput);
    const roundedFrequency = getRoundedFrequencyValue(output.frequency);
    uniqueRoundedFrequencies.add(roundedFrequency);
  });


  return { 
    cppnCount,
    cppnNodeCount: averageCppnNodeCount, cppnConnectionCount: averageCppnConnectionCount, asNEATPatchNodeCount, asNEATPatchConnectionCount,
    networkOutputsCount: uniqueNetworkOutputs.size, frequencyRangesCount: uniqueRoundedFrequencies.size
  };
}

async function getGenomeNodeTypeStatistics( genomeId, evoRunConfig, evoRunId ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
  const genomeAndMeta = await getGenomeFromGenomeString( genomeString, {} /*evoParams*/ );
  let cppnNodeTypes;
  let cppnCount = 0;
  if (genomeAndMeta.waveNetwork.offspring) {
    // Single CPPN
    cppnNodeTypes = genomeAndMeta.waveNetwork.offspring.nodes.map( node => {
      if( node.nodeType !== "Bias" && node.nodeType !== "Input" && node.nodeType !== "Output" ) {
        return node.activationFunction;
      } else {
        return "Input/Output/Bias";
      }
    } ).filter( nodeType => nodeType !== "Input/Output/Bias" );
    cppnCount = 1;
  } else if (genomeAndMeta.waveNetwork.oneCPPNPerFrequency === true && genomeAndMeta.waveNetwork.CPPNs) {
    // Multiple CPPNs
    cppnNodeTypes = [];
    for (const key in genomeAndMeta.waveNetwork.CPPNs) {
      if (genomeAndMeta.waveNetwork.CPPNs[key].offspring) {
        const offspring = genomeAndMeta.waveNetwork.CPPNs[key].offspring;
        cppnNodeTypes = cppnNodeTypes.concat(
          offspring.nodes.map( node => {
            if( node.nodeType !== "Bias" && node.nodeType !== "Input" && node.nodeType !== "Output" ) {
              return node.activationFunction;
            } else {
              return "Input/Output/Bias";
            }
          } ).filter( nodeType => nodeType !== "Input/Output/Bias" )
        );
        cppnCount++;
      }
    }
  }

  const cppnNodeTypeCounts = {};
  for( const oneNodeType of cppnNodeTypes ) {
    if( cppnNodeTypeCounts[oneNodeType] === undefined ) {
      cppnNodeTypeCounts[oneNodeType] = 0;
    }
    cppnNodeTypeCounts[oneNodeType]++;
  }
  // get the average count of each node type
  for( const oneNodeType of Object.keys(cppnNodeTypeCounts) ) {
    cppnNodeTypeCounts[oneNodeType] /= cppnCount;
  }
  const asNEATPatchNodeTypes = genomeAndMeta.asNEATPatch.nodes.map( node => {
    if( node.type === 18 ) {
      return "WhiteNoise";
    } else if( node.type === 19 ) {
      return "PinkNoise";
    } else if( node.type === 20 ) {
      return "BrownNoise";
    } else {
      return node.name;
    }
  } ).filter( nodeType => nodeType !== "OutNode" && nodeType !== "NetworkOutputNode" && nodeType !== "NoteNetworkOutputNode" );
  const asNEATPatchNodeTypeCounts = {};
  for( const oneNodeType of asNEATPatchNodeTypes ) {
    if( asNEATPatchNodeTypeCounts[oneNodeType] === undefined ) {
      asNEATPatchNodeTypeCounts[oneNodeType] = 0;
    }
    asNEATPatchNodeTypeCounts[oneNodeType]++;
  }
  return {
    cppnNodeTypeCounts, asNEATPatchNodeTypeCounts
  };
}

///// saturation generations

export async function getCellSaturationGenerations( evoRunConfig, evoRunId ) {
  const cellEliteGenerations = {};
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const iterationIndex = commitCount - 1;
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = getCellKeys( eliteMap );
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      const cellEliteGenerationNumber = eliteMap.cells[oneCellKey].elts[0].gN;
      cellEliteGenerations[oneCellKey] = cellEliteGenerationNumber;
    }
  }
  return cellEliteGenerations;
}

///// score variance

async function getCellScoreVarianceForGenomeIdSet( evoRunConfig, evoRunId, iterationIndex, genomeIds ) {
  // TODO get scores form previous step if removed indexes?
  const genomeScores = await getGenomeScores( evoRunConfig, evoRunId, iterationIndex, genomeIds );
  const genomeScoreVariance = await getScoreVarianceForGenomes( genomeScores );
  return genomeScoreVariance;
}

async function getGenomeScores( evoRunConfig, evoRunId, iterationIndex, genomeIds ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const cellCount = cellKeys.length;
  // for each unique genomeId, collect all scores
  const genomeScores = {};
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      if( !genomeIds || genomeIds.includes( eliteMap.cells[oneCellKey].elts[0].g ) ) {
        const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
        const score = eliteMap.cells[oneCellKey].elts[0].s;
        if( !genomeScores[genomeId] ) {
          genomeScores[genomeId] = [];
        }
        genomeScores[genomeId].push( score );
      }
    }
  }
  return genomeScores;
}

async function getScoreVarianceForGenomes( genomeScores ) {
  // for each unique genomeId, calculate variance
  const genomeScoreVariances = {};
  const genomeScoreStandardDeviations = {};
  const genomeScoreMeanDeviations = {};
  for( const oneGenomeId of Object.keys(genomeScores) ) {
    const scores = genomeScores[oneGenomeId];
   
    const variance = calcVariance( scores );
    genomeScoreVariances[oneGenomeId] = variance;

    const standardDeviation = calcStandardDeviation( scores );
    genomeScoreStandardDeviations[oneGenomeId] = standardDeviation;

    const meanDeviation = calcMeanDeviation( scores );
    genomeScoreMeanDeviations[oneGenomeId] = meanDeviation;
  }
  // for each unique genomeId, calculate average variance
  const genomeScoreVarianceSum = Object.values(genomeScoreVariances).reduce( (sum, variance) => sum + variance, 0 );
  const averageGenomeScoreVariance = genomeScoreVarianceSum / Object.keys(genomeScoreVariances).length;

  // for each unique genomeId, calculate average standard deviation
  const genomeScoreStandardDeviationSum = Object.values(genomeScoreStandardDeviations).reduce( (sum, standardDeviation) => sum + standardDeviation, 0 );
  const averageGenomeScoreStandardDeviation = genomeScoreStandardDeviationSum / Object.keys(genomeScoreStandardDeviations).length;

  // for each unique genomeId, calculate average mean deviation
  const genomeScoreMeanDeviationSum = Object.values(genomeScoreMeanDeviations).reduce( (sum, meanDeviation) => sum + meanDeviation, 0 );
  const averageGenomeScoreMeanDeviation = genomeScoreMeanDeviationSum / Object.keys(genomeScoreMeanDeviations).length;

  return {
    averageGenomeScoreVariance, averageGenomeScoreStandardDeviation, averageGenomeScoreMeanDeviation
  };
}

export async function getScoreVarianceForEliteGenomes( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteGenomeIds = Array.from((await getGenomeSetsForOneIteration( evoRunConfig, evoRunId, iterationIndex )).values());
  const genomeScores = getGenomeScores( evoRunConfig, evoRunId, iterationIndex );
  const scoreVarianceForEliteGenomes = getScoreVarianceForGenomes( evoRunConfig, evoRunId, iterationIndex, eliteGenomeIds, genomeScores );
  return scoreVarianceForEliteGenomes;
}

export async function getScoreVarianceForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const cellCount = cellKeys.length;
  const mapScores = new Array( cellCount );
  for( const [i, oneCellKey] of cellKeys.entries() ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      const score = eliteMap.cells[oneCellKey].elts[0].s;
      mapScores[i] = score;
    }
  }
  let scoreVariance, scoreStandardDeviation, scoreMeanDeviation;
  // check if mapScores contains only undefined values
  if( mapScores.every( score => score === undefined ) ) {
    scoreVariance = undefined;
    scoreStandardDeviation = undefined;
    scoreMeanDeviation = undefined;
  } else {
    scoreVariance = calcVariance( mapScores );
    scoreStandardDeviation = calcStandardDeviation( mapScores );
    scoreMeanDeviation = calcMeanDeviation( mapScores );
  }
  return {
    scoreVariance, scoreStandardDeviation, scoreMeanDeviation
  };
}

export async function getScoreStatsForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const scoreVarianceForEliteGenomes = await getScoreVarianceForEliteGenomes( evoRunConfig, evoRunId, iterationIndex );
  const scoreVariance = await getScoreVarianceForOneIteration( evoRunConfig, evoRunId, iterationIndex );
  return {
    scoreVarianceForEliteGenomes, scoreVariance
  };
}

export async function getScoreVarianceForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const genomeSetsCollection = await getGenomeSetsForAllIterations( evoRunConfig, evoRunId, stepSize );
  const scoreVarianceForAllIterations = [];
  for( let i = 0; i < genomeSetsCollection.genomeSets.length; i++ ) {
    console.log( `Calculating score variance for step ${i}` );
    const eliteGenomeIds = Array.from(genomeSetsCollection.genomeSets[i].values());
    const scoreVarianceForElitesAtIteration = await getCellScoreVarianceForGenomeIdSet( evoRunConfig, evoRunId, i*stepSize, eliteGenomeIds );
    let scoreVarianceForNewElitesAtIteration;
    let scoreVarianceForRemovedElitesAtIteration;
    if( i > 0 ) {
      const newEliteGenomeIds = Array.from(genomeSetsCollection.genomeSetsAdditions[i].values());
      const removedEliteGenomeIds = Array.from(genomeSetsCollection.genomeSetsRemovals[i].values());
      scoreVarianceForNewElitesAtIteration = await getCellScoreVarianceForGenomeIdSet( evoRunConfig, evoRunId, i*stepSize, newEliteGenomeIds );
      scoreVarianceForRemovedElitesAtIteration = await getCellScoreVarianceForGenomeIdSet( evoRunConfig, evoRunId, (i-1)*stepSize, removedEliteGenomeIds ); // i-1 because we want to get the score variance for the iteration before the removal
    }
    const scoreVarianceAtIteration = await getScoreVarianceForOneIteration( evoRunConfig, evoRunId, i*stepSize );
    scoreVarianceForAllIterations.push( {
      scoreVarianceAtIteration,
      scoreVarianceForElitesAtIteration, scoreVarianceForNewElitesAtIteration, scoreVarianceForRemovedElitesAtIteration
    } );
  }
  return scoreVarianceForAllIterations;
}


///// elites energy

export async function getElitesEnergy( evoRunConfig, evoRunId, stepSize = 1, excludeEmptyCells, classRestrictionList, maxIterationIndex ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const eliteEnergies = {};
  const eliteIterationEnergies = [];
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
      const cellKeys = getCellKeys( eliteMap, excludeEmptyCells, classRestrictionList );
      for( const oneCellKey of cellKeys ) {
        const cell = eliteMap.cells[oneCellKey];
        if( cell.elts.length ) {
          const genomeId = cell.elts[0].g;
          if( eliteEnergies[oneCellKey] === undefined ) {
            eliteEnergies[oneCellKey] = [];
            eliteEnergies[oneCellKey].push( {
              genomeId,
              iterationIndex,
              energy: iterationIndex
            } );
            log( `Elite energy for cell ${oneCellKey} at iteration ${iterationIndex}: ${eliteEnergies[oneCellKey].at(-1).energy}` );
          } else if( eliteEnergies[oneCellKey].at(-1).genomeId !== genomeId ) {
            eliteEnergies[oneCellKey].push( {
              genomeId,
              iterationIndex,
              energy: iterationIndex - eliteEnergies[oneCellKey].at(-1).iterationIndex
            } );
            log( `Elite energy for cell ${oneCellKey} at iteration ${iterationIndex}: ${eliteEnergies[oneCellKey].at(-1).energy}` );
          }
        }
      }
      const cellCount = getCellCount( eliteMap, excludeEmptyCells, classRestrictionList );
      const oneIterationEnergy = Object.values(eliteEnergies).reduce( (acc, cur) => acc + cur.at(-1).energy, 0 ) / cellCount;
      eliteIterationEnergies.push( oneIterationEnergy );
    }
    if( maxIterationIndex && maxIterationIndex < iterationIndex ) break;
  }
  const averageEnergyPerCell = {};
  for( const oneCellKey of Object.keys(eliteEnergies) ) {
    if( eliteEnergies[oneCellKey].length ) {
      averageEnergyPerCell[oneCellKey] = eliteEnergies[oneCellKey].reduce( (acc, cur) => acc + cur.energy, 0 ) / eliteEnergies[oneCellKey].length;
    }
  }
  const averageEnergy = Object.values(averageEnergyPerCell).reduce( (acc, cur) => acc + cur, 0 ) / Object.values(averageEnergyPerCell).length;
  return {
    // eliteEnergies,
    averageEnergyPerCell,
    averageEnergy,
    eliteIterationEnergies
  };
}

///// goal switching

export async function getGoalSwitches( evoRunConfig, evoRunId, stepSize = 1, evoParams, contextArrays ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const classChampionAndGoalSwitchCount = {};
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) { // stepSize > 1 might be misleading here
      log( `Calculating goal switches and goal switches for iteration ${iterationIndex}` );
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
      const cellKeys = Object.keys(eliteMap.cells);
      for( const oneCellKey of cellKeys ) {
        const cell = eliteMap.cells[oneCellKey];
        if( cell.elts.length ) {
          const genomeId = cell.elts[0].g;
          const score = cell.elts[0].s;
          if( classChampionAndGoalSwitchCount[oneCellKey] === undefined ) {
            classChampionAndGoalSwitchCount[oneCellKey] = {
              championCount : 0,
              goalSwitchCount : 0, // "number of times during a run that a new class champion was the offspring of a champion of another class" (orig. innovations engine paper: http://dx.doi.org/10.1145/2739480.2754703)
              lastChampion: undefined,
              // lastClass: oneCellKey,
              score: score,
              contextSwitchCount: 0,
              contextDwellCount: 0
            }
          }
          if( genomeId !== classChampionAndGoalSwitchCount[oneCellKey].lastChampion ) {
            classChampionAndGoalSwitchCount[oneCellKey].championCount++;
            classChampionAndGoalSwitchCount[oneCellKey].lastChampion = genomeId;
            classChampionAndGoalSwitchCount[oneCellKey].lastClass = oneCellKey;
            classChampionAndGoalSwitchCount[oneCellKey].score = score;

            const classEliteGenomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
            const classEliteGenome = await getGenomeFromGenomeString(classEliteGenomeString, evoParams);
            // check if attribute parentGenomes of classEliteGenome is defined and the array contains a genome with an eliteClass attribute that is not equal to oneCellKey
            if( classEliteGenome.parentGenomes && classEliteGenome.parentGenomes.find( parentGenome => parentGenome.eliteClass !== oneCellKey ) ) {
              classChampionAndGoalSwitchCount[oneCellKey].goalSwitchCount++;
            }
            // check if the eliteClasses belong to different contexts
            let isContextSwitch = false;
            let isContextDwell = false;
            if( contextArrays && contextArrays.length ) {
              for( const contextArray of contextArrays ) {
                // .some ... .includes to find substrings in the contextArray
                if( contextArray.some(str => oneCellKey.includes(str)) && classEliteGenome.parentGenomes && ! contextArray.some(str => classEliteGenome.parentGenomes[0].eliteClass.includes(str)) ) {
                  isContextSwitch = true;
                  break;
                } else if( contextArray.some(str => oneCellKey.includes(str)) && classEliteGenome.parentGenomes && contextArray.some(str => classEliteGenome.parentGenomes[0].eliteClass.includes(str)) ) {
                  isContextDwell = true;
                  break;
                }
              }
              if( isContextSwitch ) {
                classChampionAndGoalSwitchCount[oneCellKey].contextSwitchCount++;
              } else if( isContextDwell ) {
                classChampionAndGoalSwitchCount[oneCellKey].contextDwellCount++;
              }
            }
          }
        }
      }
    }
  }
  const averageChampionCount = Object.values(classChampionAndGoalSwitchCount).reduce( (acc, cur) => acc + cur.championCount, 0 ) / Object.values(classChampionAndGoalSwitchCount).length;
  const averageGoalSwitchCount = Object.values(classChampionAndGoalSwitchCount).reduce( (acc, cur) => acc + cur.goalSwitchCount, 0 ) / Object.values(classChampionAndGoalSwitchCount).length;
  const averageContextSwitchCount = Object.values(classChampionAndGoalSwitchCount).reduce( (acc, cur) => acc + cur.contextSwitchCount, 0 ) / Object.values(classChampionAndGoalSwitchCount).length;
  const averageContextDwellCount = Object.values(classChampionAndGoalSwitchCount).reduce( (acc, cur) => acc + cur.contextDwellCount, 0 ) / Object.values(classChampionAndGoalSwitchCount).length;
  let contextSwitchDwellRatio;
  if( averageContextDwellCount > 0 ) {
    contextSwitchDwellRatio = averageContextSwitchCount / averageContextDwellCount;
  } else {
    contextSwitchDwellRatio = averageContextSwitchCount;
  }
  // goalSwitchCount and score, from classChampionAndGoalSwitchCount, into separate arrays
  // const goalSwitches = [];
  // const scores = [];
  // for( const oneCellKey of Object.keys(classChampionAndGoalSwitchCount) ) {
  //   goalSwitches.push( classChampionAndGoalSwitchCount[oneCellKey].goalSwitchCount );
  //   scores.push( classChampionAndGoalSwitchCount[oneCellKey].score );
  // }
  // const goalSwitchScoreCorrelation = pearsonCorrelation( goalSwitches, scores );

  const goalSwitcesAndScores = Object.values(classChampionAndGoalSwitchCount).map( obj => {
    return {
      goalSwitchCount: obj.goalSwitchCount,
      score: obj.score
    };
  });
  const goalSwitchesAndScoresVars = {
    goalSwitchCount: 'metric',
    score: 'metric'
  };
  let stats = new Statistics(goalSwitcesAndScores, goalSwitchesAndScoresVars);
  let r = stats.correlationCoefficient('goalSwitchCount', 'score');
  const goalSwitchScoreCorrelation = r.correlationCoefficient;
  
  return {
    classChampionAndGoalSwitchCount,
    averageChampionCount,
    averageGoalSwitchCount,
    goalSwitchScoreCorrelation,
    averageContextSwitchCount,
    averageContextDwellCount,
    contextSwitchDwellRatio
  };
}

export async function getGoalSwitchesThroughLineages( evoRunConfig, evoRunId, evoParams, contextArrays ) {
  const goalSwitchesToCells = {};
  const scoresToCells = {};
  const contextSwitchesToCells = {};
  const contextDwellsToCells = {};
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const iterationIndex = commitCount - 1;
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = getCellKeys( eliteMap );
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      console.log( `Calculating goal switches for cell ${oneCellKey}` );
      let goalSwitchCount = 0;
      let contextSwitchCount = 0;
      let contextDwellCount = 0;
      let currentClass = oneCellKey;
      let genomeId = eliteMap.cells[oneCellKey].elts[0].g;
      let currentEliteScore = eliteMap.cells[oneCellKey].elts[0].s;
      scoresToCells[oneCellKey] = currentEliteScore;
      let classEliteGenome;
      do {
        const classEliteGenomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
        classEliteGenome = await getGenomeFromGenomeString(classEliteGenomeString, evoParams);
        if( classEliteGenome.parentGenomes ) {
          // check if the eliteClasses belong to different contexts
          let isContextSwitch = false;
          let isContextDwell = false;
          if( contextArrays && contextArrays.length ) {
            for( const contextArray of contextArrays ) {
              if( contextArray.some(str => currentClass.includes(str)) && classEliteGenome.parentGenomes && contextArray.some(str => classEliteGenome.parentGenomes[0].eliteClass.includes(str)) ) {
                isContextDwell = true;
                break;
              } else if( contextArray.some(str => currentClass.includes(str)) && classEliteGenome.parentGenomes && ! contextArray.some(str => classEliteGenome.parentGenomes[0].eliteClass.includes(str)) ) { 
                isContextSwitch = true;
                break;
              }
            }
            if( isContextSwitch ) {
              contextSwitchCount++;
            } else if( isContextDwell ) {
              contextDwellCount++;
            }
          }
          // goal switch check
          if( currentClass !== classEliteGenome.parentGenomes[0].eliteClass ) { // assume only one parent
            // console.log(oneCellKey + ", goalSwitchCount:", goalSwitchCount, "at generation", classEliteGenome.generationNumber, "from", currentClass, "to", classEliteGenome.parentGenomes[0].eliteClass);
            goalSwitchCount++;
            currentClass = classEliteGenome.parentGenomes[0].eliteClass;
          }
          genomeId = classEliteGenome.parentGenomes[0].genomeId;
        }
      } while( classEliteGenome.parentGenomes );
      goalSwitchesToCells[oneCellKey] = goalSwitchCount;
      contextSwitchesToCells[oneCellKey] = contextSwitchCount;
      contextDwellsToCells[oneCellKey] = contextDwellCount
    }
  }
  const averageGoalSwitchCount = Object.values(goalSwitchesToCells).reduce( (acc, cur) => acc + cur, 0 ) / Object.values(goalSwitchesToCells).length;
  const averageContextSwitchCount = Object.values(contextSwitchesToCells).reduce( (acc, cur) => acc + cur, 0 ) / Object.values(contextSwitchesToCells).length;
  const averageContextDwellCount = Object.values(contextDwellsToCells).reduce( (acc, cur) => acc + cur, 0 ) / Object.values(contextDwellsToCells).length;
  let contextSwitchDwellRatio;
  if( averageContextDwellCount > 0 ) {
    contextSwitchDwellRatio = averageContextSwitchCount / averageContextDwellCount;
  } else {
    contextSwitchDwellRatio = averageContextSwitchCount;
  }
  // goalSwitchCount from goalSwitchesToCells, and score, from scoresToCells, into separate arrays
  const goalSwitches = [];
  const scores = [];
  for( const oneCellKey of Object.keys(goalSwitchesToCells) ) {
    goalSwitches.push( goalSwitchesToCells[oneCellKey] );
    scores.push( scoresToCells[oneCellKey] );
  }
  const goalSwitchScoreCorrelation = pearsonCorrelation( goalSwitches, scores );
  return {
    goalSwitchesToCells,
    averageGoalSwitchCount,
    scoresToCells,
    goalSwitchScoreCorrelation,

    contextSwitchesToCells,
    averageContextSwitchCount,
    contextDwellsToCells,
    averageContextDwellCount,
    contextSwitchDwellRatio
  };
}

// Function to calculate Pearson correlation coefficient
function pearsonCorrelation(x, y) {
  if (x.length !== y.length) {
      throw new Error("Input arrays must have the same length");
  }

  const n = x.length;
  const meanX = mean(x);
  const meanY = mean(y);

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;

      numerator += dx * dy;
      denominatorX += dx * dx;
      denominatorY += dy * dy;
  }

  const denominator = Math.sqrt(denominatorX * denominatorY);
  if (denominator === 0) {
      return 0;
  }

  return numerator / denominator;
}

///// lineages

export async function getLineageGraphData( evoRunConfig, evoRunId, stepSize = 1 ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const lineageGraphDataObj = {};
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) { // stepSize > 1 might be misleading here
      log( `Collecting lineage graph data for iteration ${iterationIndex}` );
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
      const cellKeys = Object.keys(eliteMap.cells);
      for( const oneCellKey of cellKeys ) {
        const cell = eliteMap.cells[oneCellKey];
        if( cell.elts.length ) {
          const genomeId = cell.elts[0].g;
          const score = cell.elts[0].s;
          const generation = cell.elts[0].gN;
          if( lineageGraphDataObj[genomeId] === undefined ) {
            const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
            const genome = await getGenomeFromGenomeString(genomeString);
            let parentGenomes;
            if( genome.parentGenomes ) {
              parentGenomes = genome.parentGenomes;
            } else {
              parentGenomes = [];
            }
            lineageGraphDataObj[genomeId] = { parentGenomes };
            lineageGraphDataObj[genomeId]["eliteClass"] = oneCellKey;
            lineageGraphDataObj[genomeId]["s"] = score;
            lineageGraphDataObj[genomeId]["gN"] = generation;
          }
        }
      }
    }
  }
  // convert lineageGraphDataObj to array with objects with the attributes id and parents
  const lineageGraphData = [];
  for( const genomeId of Object.keys(lineageGraphDataObj) ) {
    lineageGraphData.push({
      id: genomeId,
      eliteClass: lineageGraphDataObj[genomeId].eliteClass,
      s: lineageGraphDataObj[genomeId].s,
      gN: lineageGraphDataObj[genomeId].gN,
      parents: lineageGraphDataObj[genomeId].parentGenomes
    });
  }
  return lineageGraphData;
}

///// duration, delta, pitch combinations

export async function getDurationPitchDeltaVelocityCombinations( evoRunConfig, evoRunId, stepSize = 1, uniqueGenomes ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const durationPitchDeltaVelocityCombinations = [];
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) { // stepSize > 1 might be misleading here
      log( `Collecting duration, delta, pitch combinations for iteration ${iterationIndex}` );
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
      const cellKeys = Object.keys(eliteMap.cells);
      const genomeSet = new Set();
      const eliteMapDurationPitchDeltaVelocityCombinationCounts = {};
      const eliteMapDurationPitchDeltaVelocityCounts = {};
      for( const oneCellKey of cellKeys ) {
        const cell = eliteMap.cells[oneCellKey];
        if( cell.elts.length ) {
          const genomeId = cell.elts[0].g;
          const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
          const genome = await getGenomeFromGenomeString(genomeString);
          genome.tags.forEach(oneTag => {
            if( oneTag.tag === oneCellKey && ( !uniqueGenomes || !genomeSet.has(genomeId) ) ) {
              const durationKey = `duration_${oneTag.duration}`;
              const noteDeltaKey = `noteDelta_${oneTag.noteDelta}`;
              const velocityKey = `velocity_${oneTag.velocity}`;
              const durationPitchDeltaVelocityKey = `${durationKey}_${noteDeltaKey}_${velocityKey}`;
              if( eliteMapDurationPitchDeltaVelocityCombinationCounts[durationPitchDeltaVelocityKey] === undefined ) {
                eliteMapDurationPitchDeltaVelocityCombinationCounts[durationPitchDeltaVelocityKey] = 1;
              } else {
                eliteMapDurationPitchDeltaVelocityCombinationCounts[durationPitchDeltaVelocityKey]++;
              }
              if( eliteMapDurationPitchDeltaVelocityCounts[durationKey] === undefined ) {
                eliteMapDurationPitchDeltaVelocityCounts[durationKey] = 1;
              } else {
                eliteMapDurationPitchDeltaVelocityCounts[durationKey]++;
              }
              if( eliteMapDurationPitchDeltaVelocityCounts[noteDeltaKey] === undefined ) {
                eliteMapDurationPitchDeltaVelocityCounts[noteDeltaKey] = 1;
              } else {
                eliteMapDurationPitchDeltaVelocityCounts[noteDeltaKey]++;
              }
              if( eliteMapDurationPitchDeltaVelocityCounts[velocityKey] === undefined ) {
                eliteMapDurationPitchDeltaVelocityCounts[velocityKey] = 1;
              } else {
                eliteMapDurationPitchDeltaVelocityCounts[velocityKey]++;
              }

            }
          });
          genomeSet.add(genomeId);
        }
      }
      const averageEliteMapDurationPitchDeltaVelocityCombinations = {};
      for( const oneKey of Object.keys(eliteMapDurationPitchDeltaVelocityCombinationCounts) ) {
        if( uniqueGenomes ) {
          averageEliteMapDurationPitchDeltaVelocityCombinations[oneKey] = eliteMapDurationPitchDeltaVelocityCombinationCounts[oneKey] / genomeSet.size;
        } else {
          averageEliteMapDurationPitchDeltaVelocityCombinations[oneKey] = eliteMapDurationPitchDeltaVelocityCombinationCounts[oneKey] / Object.keys(eliteMap.cells).length;
        }
      }
      const averageEliteMapDurationPitchDeltaVelocity = {};
      for( const oneKey of Object.keys(eliteMapDurationPitchDeltaVelocityCounts) ) {
        if( uniqueGenomes ) {
          averageEliteMapDurationPitchDeltaVelocity[oneKey] = eliteMapDurationPitchDeltaVelocityCounts[oneKey] / genomeSet.size;
        } else {
          averageEliteMapDurationPitchDeltaVelocity[oneKey] = eliteMapDurationPitchDeltaVelocityCounts[oneKey] / Object.keys(eliteMap.cells).length;
        }
      }
      durationPitchDeltaVelocityCombinations.push( {
        eliteMapDurationPitchDeltaVelocityCombinationCounts,
        eliteMapDurationPitchDeltaVelocityCounts,
        averageEliteMapDurationPitchDeltaVelocityCombinations,
        averageEliteMapDurationPitchDeltaVelocity
      } );
    }
  }
  return durationPitchDeltaVelocityCombinations;
}

function getCellKeys( eliteMap, excludeEmptyCells = false, classRestriction ) {
  // // get count of cells where the elts value contains a non empty array
  // const cellKeys = Object.keys(eliteMap.cells).filter( 
  //   oneCellKey => eliteMap.cells[oneCellKey].elts.length && null !== eliteMap.cells[oneCellKey].elts[0].s
  // );
  let cellKeys;
  if( classRestriction && classRestriction.length ) {
    // only cell keys that are in the class restriction array
    if( excludeEmptyCells ) {
      cellKeys = Object.keys(eliteMap.cells)
      .filter( 
        oneCellKey => eliteMap.cells[oneCellKey].elts.length && null !== eliteMap.cells[oneCellKey].elts[0].s
      )
      .filter( oneCellKey => classRestriction.includes(oneCellKey) );
    } else {
      // only cell keys that are in the class restriction array
      // e.g. when aligning analysis of a QD run with classes from several single class runs
      cellKeys = Object.keys(eliteMap.cells).filter( oneCellKey => classRestriction.includes(oneCellKey) );
    }
  } else if( excludeEmptyCells ) {
    cellKeys = Object.keys(eliteMap.cells).filter( 
      oneCellKey => eliteMap.cells[oneCellKey].elts.length && null !== eliteMap.cells[oneCellKey].elts[0].s
    );
  } else if( eliteMap.evolutionRunConfig.classRestriction && eliteMap.evolutionRunConfig.classRestriction.length ) {
    // e.g. single class restriction
    cellKeys = eliteMap.evolutionRunConfig.classRestriction;
  } else {
    cellKeys = Object.keys(eliteMap.cells);
  }
  return cellKeys;
}

function getCellCount( eliteMap, excludeEmptyCells = false, classRestriction ) {
  let cellKeys = getCellKeys( eliteMap, excludeEmptyCells, classRestriction );
  // const cellCount = cellKeys.reduce( (acc, cur) => {
  //   if( eliteMap.cells[cur].elts.length && null !== eliteMap.cells[cur].elts[0].s ) {
  //     return acc + 1;
  //   } else {
  //     return acc;
  //   }
  // }, 0 );
  const cellCount = cellKeys.length;
  return cellCount;
}

function bindNavKeys() { // https://itecnote.com/tecnote/node-js-how-to-capture-the-arrow-keys-in-node-js/
  var stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  stdin.on('data', function(key){
      if( key === '\u001b[A' && 0 < cellKeyIndex) {
        cellKeyIndex--;
      }
      if (key === '\u001b[B') {
        cellKeyIndex++;
      }
      if (key == 'p') {
        paused = !paused;
      }
      if (key == 'f') {
        console.log("Favourite added:", favoritesDirPath);
        const lastPlayedGenomeAndMetaStringified = JSON.stringify(lastPlayedGenomeAndMeta);
        const favoritesDir = favoritesDirPath.substring(0, favoritesDirPath.lastIndexOf("/"));
        if( !fs.existsSync(favoritesDir) ) fs.mkdirSync(favoritesDir);
        fs.writeFileSync( favoritesDirPath, lastPlayedGenomeAndMetaStringified );
      }
      if (key == '\u0003') { process.exit(); }    // ctrl-c
  });
}
let cellKeyIndex = 0;
let paused = false;
let lastPlayedGenomeAndMeta;
let favoritesDirPath;

function updateKeyboardNavigationGlobals(
  genomeAndMeta, evoRunId, evoRunConfig, genomeId, cellKey, duration, noteDelta, velocity, updated
) {
  lastPlayedGenomeAndMeta = genomeAndMeta;
  lastPlayedGenomeAndMeta.genome.evoRun = {
    evoRunId,
    cellKey,
    duration, noteDelta, velocity, updated
  };
  const monthDir = new Date(updated).toISOString().substring(0, 7);
  favoritesDirPath = `${evoRunConfig.favoritesDirPath}/${monthDir}/genome_${genomeId}.json`;
}

export async function playAllClassesInEliteMap(
    evoRunConfig, evoRunId, iterationIndex, scoreThreshold,
    startCellKey, startCellKeyIndex,
    toTermination
) {
  bindNavKeys();
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex, true );
  const cellKeys = Object.keys(eliteMap.cells);
  if( startCellKey ) {
    cellKeyIndex = cellKeys.indexOf(startCellKey);
  } else if ( startCellKeyIndex ) {
    cellKeyIndex = startCellKeyIndex;
  }
  do {
    while( cellKeyIndex < cellKeys.length ) {
      const oneCellKey = cellKeys[cellKeyIndex];
      if( eliteMap.cells[oneCellKey].elts.length ) {
        const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
        const score = eliteMap.cells[oneCellKey].elts[0].s;
        if( undefined === scoreThreshold || scoreThreshold <= score ) {
          const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
          const genomeAndMeta = JSON.parse( genomeString );
          const tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === oneCellKey);
          const { duration, noteDelta, velocity, updated } = tagForCell;
          const audioBuffer = await getAudioBufferFromGenomeAndMeta(
            genomeAndMeta,
            duration, noteDelta, velocity,
            false, // reverse,
            false, // asDataArray
            getNewOfflineAudioContext( duration ),
            getAudioContext(),
            true, // useOvertoneInharmonicityFactors
          );

          updateKeyboardNavigationGlobals(
            genomeAndMeta,
            evoRunId, evoRunConfig,
            genomeId, oneCellKey,
            duration, noteDelta, velocity, updated
          );
          const precentScoreString = `${Math.round(100*score)}%`;
          figlet(oneCellKey+" @ "+precentScoreString, function(err, data) {
              if (err) {
                  console.log('Something went wrong...');
                  console.dir(err);
                  return;
              }
              console.log(data);
          });
          console.log("Playing class", oneCellKey, "#", cellKeyIndex, "for", (iterationIndex === undefined ? "last iteration ("+eliteMap.generationNumber+")": "iteration "+iterationIndex), "in evo run", evoRunId, "; duration", duration, ", note delta", noteDelta, ", velocity", velocity + " and score: " + score );
          playAudio( audioBuffer );
          await new Promise(resolve => setTimeout(resolve, duration*1000));
        }
      }
      if( ! paused ) {
        cellKeyIndex++;
      } else if( scoreThreshold ) { // otherwise we may get stuck in an infinite loop, not able to capture keyboard input
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    cellKeyIndex = 0;
  } while (toTermination && ! eliteMap.terminated);
  process.exit();
}

export async function playOneClassAcrossEvoRun(cellKey, evoRunConfig, evoRunId, stepSize = 1, ascending = true) {
  bindNavKeys();
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  let lastPlayedGenomeId;
  let iterationIndex = ascending ? 0 : commitCount-1;
  while( ascending ? iterationIndex < commitCount : 0 <= iterationIndex ) {
    if( iterationIndex % stepSize === 0 ) {
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
      if( eliteMap.cells[cellKey] && eliteMap.cells[cellKey].elts.length ) {
        const genomeId = eliteMap.cells[cellKey].elts[0].g;
        const score = eliteMap.cells[cellKey].elts[0].s;
        if( lastPlayedGenomeId !== genomeId || paused ) {
          const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
          const genomeAndMeta = JSON.parse( genomeString );
          const tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === cellKey);
          const { duration, noteDelta, velocity, updated } = tagForCell;
          const audioBuffer = await getAudioBufferFromGenomeAndMeta(
            genomeAndMeta,
            duration, noteDelta, velocity,
            false, // reverse,
            false, // asDataArray
            getNewOfflineAudioContext( duration ),
            getAudioContext(),
            true, // useOvertoneInharmonicityFactors
          );

          updateKeyboardNavigationGlobals(
            genomeAndMeta,
            evoRunId, evoRunConfig,
            genomeId, cellKey,
            duration, noteDelta, velocity, updated
          );

          console.log( "Playing class", cellKey, "for iteration", iterationIndex, "in evo run", evoRunId, "; duration", duration, ", note delta", noteDelta, ", velocity", velocity + " and score: " + score );
          playAudio( audioBuffer );
          await new Promise(resolve => setTimeout(resolve, duration*1000));

          lastPlayedGenomeId = genomeId;
        } else {
          console.log("Sound unchanged for iteration", iterationIndex);
        }
      } else {
        console.log("Can't find elites for class", cellKey);
        break;
      }
    }
    if( ! paused ) {
      ascending ? iterationIndex++ : iterationIndex--;
    }
  }
  process.exit();
}

async function getEliteMap( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList, terrainName ) {
  const commitId = await getCommitID( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList );
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const terrainSuffix = terrainName ? `_${terrainName}` : '';
  let eliteMapFileName = `elites_${evoRunId}${terrainSuffix}.json`;
  // check if eliteMapFileName exists
  if( ! fs.existsSync(`${evoRunDirPath}/${eliteMapFileName}`) ) {
    // let's try to find the first elite map file starting with 'elites_'
    const eliteMapFiles = fs.readdirSync(evoRunDirPath).filter( file => file.startsWith('elites_') );
    if( eliteMapFiles.length ) {
      eliteMapFileName = eliteMapFiles[0];
    } else {
      throw new Error(`Elite map file not found in ${evoRunDirPath}`);
    }
  }
  const eliteMapString = await spawnCmd(`git -C ${evoRunDirPath} show ${commitId}:${eliteMapFileName}`, {}, true);
  const eliteMap = JSON.parse(eliteMapString);
  return eliteMap;
}

async function getCommitID( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, forceCreateCommitIdsList );
  let commitId;
  if( iterationIndex === undefined ) {
    // get last index
    const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
    console.log('commitCount:', commitCount);
    const lastCommitIndex = commitCount - 1;
    commitId = await nthline(lastCommitIndex, commitIdsFilePath);
  } else {
    commitId = await nthline(iterationIndex, commitIdsFilePath);
  }
  return commitId;
}

function getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath ) {
  const commitCount = parseInt(runCmd(`wc -l < ${commitIdsFilePath}`));
  return commitCount;
}

function getCommitIdsFilePath( evoRunConfig, evoRunId, forceCreateCommitIdsList ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFileName = "commit-ids.txt";
  const commitIdsFilePath = `${evoRunDirPath}${commitIdsFileName}`;
  if( forceCreateCommitIdsList || ! fs.existsSync(`${evoRunDirPath}/commit-ids.txt`) ) {
    runCmd(`git -C ${evoRunDirPath} rev-list HEAD --first-parent --reverse > ${commitIdsFilePath}`);
  }
  return commitIdsFilePath;
}
