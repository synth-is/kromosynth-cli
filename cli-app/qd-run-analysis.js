import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import async from 'async';
import { fork } from 'child_process';
import {
  runCmd, spawnCmd,
  getEvoRunDirPath,
  calcVariance, calcStandardDeviation, calcMeanDeviation,
  averageAttributes, standardDeviationAttributes,
  getEliteMap
} from './util/qd-common.js';
import { readGenomeAndMetaFromDisk, readCompressedOrPlainJSON } from './util/qd-common-elite-map-persistence.js';
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, 0 );
  const cellKeys = Object.keys(eliteMap.cells);
  return cellKeys;
}

// checks if the evoRunConfig contains classConfigurations, each with a "refSetName" defining a "terrain" for one eliteMap
// - if so, returns the terrain names, indicating that there are multiple eliteMaps
export function getTerrainNames( evoRunConfig ) {
  const classConfigurations = evoRunConfig.classifiers[evoRunConfig.classifierIndex].classConfigurations;
  if( classConfigurations ) {
    return classConfigurations.map( classConfiguration => classConfiguration.refSetName );
  }
  return [];
}


///// elite diversity, from cellFeatures files

// Calculate average pairwise Euclidean distance without storing full matrix
function calculateAveragePairwiseDistanceEuclidean(embeddings) {
  let sumDistances = 0;
  let pairCount = 0;
  
  // Calculate pairwise distances on the fly
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const distance = calculateEuclideanDistance(embeddings[i], embeddings[j]);
      sumDistances += distance;
      pairCount++;
      
      // Periodically free up memory
      if (pairCount % 10000 === 0) {
        global.gc && global.gc();
      }
    }
  }
  
  return sumDistances / pairCount;
}

function calculateCosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

function calculateEuclideanDistance(vectorA, vectorB) {
  let distance = 0;
  for (let i = 0; i < vectorA.length; i++) {
    distance += Math.pow(vectorA[i] - vectorB[i], 2);
  }
  return Math.sqrt(distance);
}

function calculateAveragePairwiseDistanceCosine(embeddings) {
  let sumDistances = 0;
  let pairCount = 0;
  
  // Calculate pairwise distances on the fly
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const similarity = calculateCosineSimilarity(embeddings[i], embeddings[j]);
      const distance = 1 - similarity;
      sumDistances += distance;
      pairCount++;
    }
  }
  
  return pairCount > 0 ? sumDistances / pairCount : 0;
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

export async function getEliteMapDiversityAtLastIteration(evoRunConfig, evoRunId) {
  const eliteMap = await getEliteMapFromRunConfig(evoRunConfig, evoRunId, undefined, false);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const cellFeaturesPath = `${evoRunDirPath}cellFeatures`;
  let featureExtractionType;

  if (!eliteMap.classConfigurations?.length || 
      !eliteMap.classConfigurations[0].featureExtractionType) {
    throw new Error("No classConfigurations found in eliteMap");
  }

  featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
  
  // Get genome IDs and collect features
  const featureVectors = [];
  for (const oneCellKey of Object.keys(eliteMap.cells)) {
    if (eliteMap.cells[oneCellKey].elts.length) {
      const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
      const gzipPath = `${cellFeaturesPath}/features_${evoRunId}_${genomeId}.json.gz`;
      const plainPath = `${cellFeaturesPath}/features_${evoRunId}_${genomeId}.json`;
      
      const cellFeatures = readCompressedOrPlainJSON(gzipPath, plainPath);
      if (cellFeatures && cellFeatures[featureExtractionType]?.features) {
        featureVectors.push(cellFeatures[featureExtractionType].features);
      } else {
        console.error("cellFeatures file not found for genomeId", genomeId);
      }
    }
  }

  return calculateAveragePairwiseDistanceCosine(featureVectors);
}

export async function getEliteMapDiversityForAllIterations(evoRunConfig, evoRunId, stepSize = 1) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
  const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
  const terrainNames = getTerrainNames(evoRunConfig);
  let diversityMeasures;

  // Helper function to calculate Gini index from distances
  function calculateGiniIndex(distances) {
    if (distances.length === 0) return 0;
    console.log("Start calculateGiniIndex");
    // Sort distances in ascending order - O(n log n)
    const sortedDistances = distances.slice().sort((a, b) => a - b);
    const n = sortedDistances.length;
    
    // Calculate Gini coefficient using the sorted array formula
    let numerator = 0;
    const mean = sortedDistances.reduce((a, b) => a + b, 0) / n;
    
    // Single loop - O(n)
    for (let i = 0; i < n; i++) {
        numerator += (2 * i - n + 1) * sortedDistances[i];
    }
    console.log("End calculateGiniIndex");
    return numerator / (n * n * mean);
}

  const processIteration = async (eliteMap, featureExtractionType) => {
    const featureVectors = [];
    const cellFeaturesPath = `${getEvoRunDirPath(evoRunConfig, evoRunId)}cellFeatures`;

    // Collect feature vectors as before
    for (const oneCellKey of Object.keys(eliteMap.cells)) {
      if (eliteMap.cells[oneCellKey].elts.length) {
        const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
        const gzipPath = `${cellFeaturesPath}/features_${evoRunId}_${genomeId}.json.gz`;
        const plainPath = `${cellFeaturesPath}/features_${evoRunId}_${genomeId}.json`;
        
        const cellFeatures = readCompressedOrPlainJSON(gzipPath, plainPath);
        if (cellFeatures && cellFeatures[featureExtractionType]?.features) {
          featureVectors.push(cellFeatures[featureExtractionType].features);
        }
      }
    }

    // Calculate all pairwise distances
    const pairwiseDistances = [];
    for (let i = 0; i < featureVectors.length; i++) {
      for (let j = i + 1; j < featureVectors.length; j++) {
        const distance = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
        pairwiseDistances.push(1 - distance); // Convert similarity to distance
      }
    }

    // TODO: postponing Gini index calculation for now; doesn't seem too interesting and requires further updates to the handling of the modifide structure in the callee
    // return {
    //   averagePairwiseDistance: calculateAveragePairwiseDistanceCosine(featureVectors),
    //   giniIndex: calculateGiniIndex(pairwiseDistances)
    // };
    return calculateAveragePairwiseDistanceCosine(featureVectors);
  };

  // Rest of your function with modifications to handle both metrics
  if (terrainNames.length) {
    diversityMeasures = {};
    for (const oneTerrainName of terrainNames) {
      diversityMeasures[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
    }

    for (let iterationIndex = 0, diversityIndex = 0; 
         iterationIndex < commitCount; 
         iterationIndex += stepSize, diversityIndex++) {
      
      if (iterationIndex % stepSize === 0) {
        console.log(`Calculating diversity for iteration ${iterationIndex}...`);
        for (const oneTerrainName of terrainNames) {
          const eliteMap = await getEliteMapFromRunConfig(evoRunConfig, evoRunId, iterationIndex, false, oneTerrainName);
          if (eliteMap.classConfigurations?.length && 
              (eliteMap.classConfigurations[0].featureExtractionType || eliteMap.classConfigurations[0].projectionFeatureType)
            ) {
            const featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType || eliteMap.classConfigurations[0].projectionFeatureType;
            diversityMeasures[oneTerrainName][diversityIndex] = await processIteration(eliteMap, featureExtractionType);
          }
        }
      }
    }
  } else {
    // Handle single terrain case
    diversityMeasures = new Array(Math.ceil(commitCount / stepSize));
    
    for (let iterationIndex = 0, diversityIndex = 0; 
         iterationIndex < commitCount; 
         iterationIndex += stepSize, diversityIndex++) {
      
      if (iterationIndex % stepSize === 0) {
        console.log(`Calculating diversity for iteration ${iterationIndex}...`);
        const eliteMap = await getEliteMapFromRunConfig(evoRunConfig, evoRunId, iterationIndex);
        if (eliteMap.classConfigurations?.length && 
            (eliteMap.classConfigurations[0].featureExtractionType || eliteMap.classConfigurations[0].projectionFeatureType)
        ) {
          const featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType || eliteMap.classConfigurations[0].projectionFeatureType;
          diversityMeasures[diversityIndex] = await processIteration(eliteMap, featureExtractionType);
        }
      }
    }
  }

  // Save results
  const diversityStringified = JSON.stringify(diversityMeasures);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const diversityFilePath = `${evoRunDirPath}diversity-measures_step-${stepSize}.json`;
  fs.writeFileSync(diversityFilePath, diversityStringified);

  return diversityMeasures;
}

export async function getDiversityFromAllDiscoveredElites(evoRunConfig, evoRunId, useDirectFeatureReading = false) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const cellFeaturesPath = `${evoRunDirPath}cellFeatures`;
  let featureExtractionType;
  const featureVectors = [];
  
  if (useDirectFeatureReading) {
    console.log('Reading features directly from cellFeatures directory...');
    
    if (!fs.existsSync(cellFeaturesPath)) {
      throw new Error(`cellFeatures directory not found at ${cellFeaturesPath}`);
    }

    const featureFiles = fs.readdirSync(cellFeaturesPath)
      .filter(filename => filename.startsWith('features_'));

    console.log(`Found ${featureFiles.length} feature files`);

    for (let i = 0; i < featureFiles.length; i++) {
      try {
        const filename = featureFiles[i];
        const filePath = `${cellFeaturesPath}/${filename}`;
        const content = fs.readFileSync(filePath, 'utf8');
        const features = JSON.parse(content);

        // Get feature extraction type from first valid file if not yet set
        if (!featureExtractionType && Object.keys(features).length > 0) {
          featureExtractionType = Object.keys(features)[0];
        }

        if (features[featureExtractionType]?.features) {
          featureVectors.push(features[featureExtractionType].features);
        }
      } catch (error) {
        console.warn(`Warning: Could not read features from file ${i + 1}:`, error.message);
      }

      // Print progress every 100 files
      if ((i + 1) % 100 === 0) {
        console.log(`Processed ${i + 1} out of ${featureFiles.length} feature files...`);
      }
    }

  } else {
    console.log('Collecting genome IDs from elite maps...');
    
    const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
    const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
    const discoveredGenomeIds = new Set();

    // First pass: collect all unique genome IDs
    for (let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++) {
      console.log(`Collecting genome IDs from iteration ${iterationIndex}...`);
      
      const eliteMap = await getEliteMapFromRunConfig(evoRunConfig, evoRunId, iterationIndex);
      
      if (!eliteMap.classConfigurations?.length || 
          !eliteMap.classConfigurations[0].featureExtractionType) {
        throw new Error("No classConfigurations found in eliteMap");
      }

      featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
      
      for (const oneCellKey of Object.keys(eliteMap.cells)) {
        if (eliteMap.cells[oneCellKey].elts.length) {
          discoveredGenomeIds.add(eliteMap.cells[oneCellKey].elts[0].g);
        }
      }
    }

    console.log(`Total unique elite genomes discovered: ${discoveredGenomeIds.size}`);

    // Second pass: collect features
    let processedCount = 0;
    for (const oneGenomeId of discoveredGenomeIds) {
      const cellFeatureFilePath = `${cellFeaturesPath}/features_${evoRunId}_${oneGenomeId}.json`;
      if (fs.existsSync(cellFeatureFilePath)) {
        try {
          const cellFeaturesString = fs.readFileSync(cellFeatureFilePath, 'utf8');
          const features = JSON.parse(cellFeaturesString);
          if (features[featureExtractionType]?.features) {
            featureVectors.push(features[featureExtractionType].features);
          }
        } catch (error) {
          console.warn(`Warning: Could not read features for genome ${oneGenomeId}:`, error.message);
        }
      }

      processedCount++;
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount} out of ${discoveredGenomeIds.size} genomes...`);
      }
    }
  }

  console.log(`Successfully extracted features from ${featureVectors.length} sources`);

  if (featureVectors.length === 0) {
    throw new Error("No valid feature vectors found");
  }

  // Calculate diversity using our memory-efficient function
  const averagePairwiseDistance = calculateAveragePairwiseDistanceCosine(featureVectors);

  // Save results with metadata
  const results = {
    averagePairwiseDistance,
    totalFeaturesProcessed: featureVectors.length,
    featureExtractionType,
    method: useDirectFeatureReading ? 'direct_feature_reading' : 'elite_map_traversal'
  };

  const resultsStringified = JSON.stringify(results);
  const resultsFilePath = `${evoRunDirPath}all-discovered-elites-diversity.json`;
  fs.writeFileSync(resultsFilePath, resultsStringified);

  return averagePairwiseDistance;
}

///// QD score

export async function calculateQDScoresForAllIterations( evoRunConfig, evoRunId, stepSize = 1, excludeEmptyCells, classRestriction, maxIterationIndex ) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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
  const eliteMap = await getEliteMapFromRunConfig( 
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



///// Grid Mean Fitness

export async function calculateGridMeanFitnessForAllIterations(
  evoRunConfig,
  evoRunId,
  stepSize = 1,
  excludeEmptyCells,
  classRestriction,
  maxIterationIndex
) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
  const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
  let gridMeanScores;
  const terrainNames = getTerrainNames(evoRunConfig);

  if (terrainNames.length) {
    gridMeanScores = {};
    for (const oneTerrainName of terrainNames) {
      gridMeanScores[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
    }
    for (let iterationIndex = 0, scoreIndex = 0; iterationIndex < commitCount; iterationIndex += stepSize, scoreIndex++) {
      if (iterationIndex % stepSize === 0) {
        console.log(`Calculating grid mean fitness for iteration ${iterationIndex}...`);
        for (const oneTerrainName of terrainNames) {
          gridMeanScores[oneTerrainName][scoreIndex] = await calculateGridMeanFitnessForOneIteration(
            evoRunConfig,
            evoRunId,
            iterationIndex,
            excludeEmptyCells,
            classRestriction,
            oneTerrainName
          );
        }
      }
      if (maxIterationIndex && maxIterationIndex < iterationIndex) break;
    }
  } else {
    gridMeanScores = new Array(Math.ceil((maxIterationIndex || commitCount) / stepSize));
    for (let iterationIndex = 0, scoreIndex = 0; iterationIndex < commitCount; iterationIndex += stepSize, scoreIndex++) {
      if (iterationIndex % stepSize === 0) {
        console.log(`Calculating grid mean fitness for iteration ${iterationIndex}...`);
        gridMeanScores[scoreIndex] = await calculateGridMeanFitnessForOneIteration(
          evoRunConfig,
          evoRunId,
          iterationIndex,
          excludeEmptyCells,
          classRestriction
        );
      }
      if (maxIterationIndex && maxIterationIndex < iterationIndex) break;
    }
  }

  const gridMeanScoresStringified = JSON.stringify(gridMeanScores);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const scoresFilePath = `${evoRunDirPath}grid-mean-scores_step-${stepSize}.json`;
  fs.writeFileSync(scoresFilePath, gridMeanScoresStringified);
  return gridMeanScores;
}

export async function calculateGridMeanFitnessForOneIteration(
  evoRunConfig,
  evoRunId,
  iterationIndex,
  excludeEmptyCells,
  classRestriction,
  terrainName
) {
  const eliteMap = await getEliteMapFromRunConfig(
    evoRunConfig,
    evoRunId,
    iterationIndex,
    false,
    terrainName
  );
  return calculateGridMeanFitnessForEliteMap(eliteMap, excludeEmptyCells, classRestriction);
}

export function calculateGridMeanFitnessForEliteMap(
  eliteMap,
  excludeEmptyCells,
  classRestriction
) {
  const cellKeys = getCellKeys(eliteMap, excludeEmptyCells, classRestriction);
  let totalFitness = 0;
  let totalIndividuals = 0;

  for (const oneCellKey of cellKeys) {
    const cell = eliteMap.cells[oneCellKey];
    if (cell.elts && cell.elts.length) {
      // Sum up all individual fitnesses in this cell
      for (const individual of cell.elts) {
        totalFitness += parseFloat(individual.s);
        totalIndividuals++;
      }
    }
  }

  // Return the mean fitness across all individuals
  // If no individuals were found, return 0 or null depending on your preference
  return totalIndividuals > 0 ? totalFitness / totalIndividuals : 0;
}


///// cell scores

export async function getCellScoresForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
    if( eliteMap.cells[oneCellKey].elts && eliteMap.cells[oneCellKey].elts.length ) {
      if( parseFloat(eliteMap.cells[oneCellKey].elts[0].s) >= scoreThreshold ) {
        coveredCellCount++;
      }
    } else if( ! eliteMap.cells[oneCellKey].elts) {
      console.error("No elts for cell", oneCellKey);
    }
  }
  const coverage = coveredCellCount / cellCount;
  return coverage;
}

export async function getCoverageForOneIteration( evoRunConfig, evoRunId, iterationIndex, scoreThreshold = 0, terrainName ) {
  const eliteMap = await getEliteMapFromRunConfig( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
  );
  return getCoverageForEliteMap( eliteMap, scoreThreshold );
}

export async function getCoverageForAllIterations( evoRunConfig, evoRunId, stepSize = 1, scoreThreshold = 0 ) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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

export async function getScoreMatricesForAllIterations( evoRunConfig, evoRunId, stepSize = 1, terrainName, includeGenomeId ) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  let terrainNames;
  if( "ALL" === terrainName ) {
    // terrainNames as the difference between files at evoRunConfig.evoRunsDirPath starting with "elites_" and ending with ".json"
    const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
    const evoRunDirFiles = fs.readdirSync(evoRunDirPath);
    terrainNames = evoRunDirFiles.filter( 
      fileName => fileName.startsWith("elites_"+evoRunId) && fileName.endsWith(".json")
    ).map( fileName => fileName.match(new RegExp(`elites_${evoRunId}_(.*)\\.json`))[1] );
  } else {
    terrainNames = getTerrainNames( evoRunConfig );
  }
  console.log("--- terrainNames:", terrainNames);
  let scoreMatrices;
  let coveragePercentage;
  if( terrainNames.length && (! terrainName || "ALL"===terrainName) ) {
    scoreMatrices = {};
    coveragePercentage = {};
    for( const oneTerrainName of terrainNames ) {
      scoreMatrices[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
      coveragePercentage[oneTerrainName] = new Array(Math.ceil(commitCount / stepSize));
    }
    for( let iterationIndex = 0, scoreMatrixIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, scoreMatrixIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating score matrix for iteration ${iterationIndex}...`);
        for( const oneTerrainName of terrainNames ) {
          scoreMatrices[oneTerrainName][scoreMatrixIndex] = await getScoreMatrixForOneIteration(
            evoRunConfig, evoRunId, iterationIndex, oneTerrainName, includeGenomeId
          );
          coveragePercentage[oneTerrainName][scoreMatrixIndex] = await getCoveragePercentageForOneTerrain( evoRunConfig, evoRunId, oneTerrainName, iterationIndex );
        }
      }
    }
  } else {
    scoreMatrices = new Array(Math.ceil(commitCount / stepSize));
    coveragePercentage = new Array(Math.ceil(commitCount / stepSize));
    for( let iterationIndex = 0, scoreMatrixIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, scoreMatrixIndex++ ) {
      if( iterationIndex % stepSize === 0 ) {
        console.log(`Calculating score matrix for iteration ${iterationIndex}...`);
        scoreMatrices[scoreMatrixIndex] = await getScoreMatrixForOneIteration(
          evoRunConfig, evoRunId, iterationIndex, terrainName, includeGenomeId
        );
        coveragePercentage[scoreMatrixIndex] = await getCoveragePercentageForOneTerrain( evoRunConfig, evoRunId, terrainName, iterationIndex );
      }
    }
  }
  const scoreMatrixesStringified = JSON.stringify(scoreMatrices);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const scoreMatrixesFilePath = `${evoRunDirPath}score-matrixes_step-${stepSize}.json`;
  fs.writeFileSync( scoreMatrixesFilePath, scoreMatrixesStringified );

  // get the evolutionRunConfig from the eliteMap
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, undefined/*iteration*/, false, terrainName );
  const { evolutionRunConfig } = eliteMap;

  return { scoreMatrices, coveragePercentage, evolutionRunConfig };
}

async function getScoreMatrixForOneIteration( evoRunConfig, evoRunId, iterationIndex, terrainName, includeGenomeId ) {
  const eliteMap = await getEliteMapFromRunConfig( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
  );
  if( includeGenomeId ) {
    return getScoreAndGenomeMatrixFromEliteMap( eliteMap );
  } else {
    return getScoreMatrixFromEliteMap( eliteMap );
  }
}

export async function getScoreMatrixForLastIteration( evoRunConfig, evoRunId, terrainName, includeGenomeId ) {
  let terrainNames;
  if( "ALL" === terrainName ) {
    // terrainNames as the difference between files at evoRunConfig.evoRunsDirPath starting with "elites_" and ending with ".json"
    const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
    const evoRunDirFiles = fs.readdirSync(evoRunDirPath);
    terrainNames = evoRunDirFiles.filter( 
      fileName => fileName.startsWith("elites_"+evoRunId) && fileName.endsWith(".json")
    ).map( fileName => fileName.match(new RegExp(`elites_${evoRunId}_(.*)\\.json`))[1] );
  } else {
    terrainNames = getTerrainNames( evoRunConfig );
  }
  let scoreMatrixes = {};
  let coveragePercentage = {};
  if( terrainName && "ALL" !== terrainName ) {
    console.log(`Calculating score matrix for terrain ${terrainName}...`);  
    // scoreMatrixes = await getScoreMatrixForOneIteration( evoRunConfig, evoRunId, undefined/*iteration*/, terrainName );
    scoreMatrixes[terrainName] = await getScoreMatrixForTerrain( evoRunConfig, evoRunId, terrainName, includeGenomeId );
    coveragePercentage[terrainName] = await getCoveragePercentageForOneTerrain( evoRunConfig, evoRunId, terrainName );
  } else if( terrainNames.length ) {
    for( const oneTerrainName of terrainNames ) {
      console.log(`Calculating score matrix for terrain ${oneTerrainName}...`);
      // const eliteMap = await getEliteMap( evoRunConfig, evoRunId, undefined/*iteration*/, false, oneTerrainName );
      scoreMatrixes[oneTerrainName] = await getScoreMatrixForTerrain( evoRunConfig, evoRunId, oneTerrainName, includeGenomeId );
      // coveragePercentage[oneTerrainName] = getCoverageForEliteMap( eliteMap );
      coveragePercentage[oneTerrainName] = await getCoveragePercentageForOneTerrain( evoRunConfig, evoRunId, oneTerrainName );
    }
  } else {
    // const eliteMap = await getEliteMap( evoRunConfig, evoRunId, undefined/*iteration*/, false );
    scoreMatrixes = await getScoreMatrixForTerrain( evoRunConfig, evoRunId, undefined/*terrainName*/, includeGenomeId );
  }
  // get the evolutionRunConfig from the eliteMap
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, undefined/*iteration*/, false, terrainName );
  const { evolutionRunConfig } = eliteMap;
  return { scoreMatrix: scoreMatrixes, coveragePercentage, evolutionRunConfig };
}

export async function getScoreMatrixForTerrain( evoRunConfig, evoRunId, terrainName, includeGenomeId ) {
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, undefined/*iteration*/, false, terrainName );
  if( includeGenomeId ) {
    return getScoreAndGenomeMatrixFromEliteMap( eliteMap );
  } else {
    return getScoreMatrixFromEliteMap( eliteMap );
  }
}

async function getCoveragePercentageForOneTerrain( evoRunConfig, evoRunId, terrainName, iterationIndex ) {
  const eliteMap = await getEliteMapFromRunConfig( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
  );
  // return getCoverageForEliteMap( eliteMap, scoreThreshold );
  // TODO might want to do that calculation, but we should also have this pre-computed:
  return eliteMap.coveragePercentage;
}

export async function getScoreMatrixFromEliteMap(eliteMap) {
  let dataArray = {};
  let dimensions = new Set();
  let hasNonNumericalDimension = false;

  // First pass: analyze dimensions
  for (let key in eliteMap.cells) {
    const parts = key.split('_');
    let numericalDimensions = [];
    let nonNumericalPart = null;

    // Identify numerical dimensions and potential non-numerical part
    for (let i = 0; i < parts.length; i++) {
      const value = Number(parts[i]);
      if (!isNaN(value)) {
        numericalDimensions.push(value);
      } else {
        // If we find a non-numerical part, assume everything from here is part of it
        nonNumericalPart = parts.slice(i).join('_');
        hasNonNumericalDimension = true;
        break;
      }
    }

    dimensions.add(numericalDimensions.length + (hasNonNumericalDimension ? 1 : 0));
  }

  if (dimensions.size > 1) {
    throw new Error('Inconsistent dimension count across keys');
  }

  // Second pass: build nested structure
  for (let key in eliteMap.cells) {
    const parts = key.split('_');
    let currentLevel = dataArray;
    let numericalDimensions = [];
    let nonNumericalPart = null;

    // Split into numerical and non-numerical parts
    for (let i = 0; i < parts.length; i++) {
      const value = Number(parts[i]);
      if (!isNaN(value)) {
        numericalDimensions.push(value);
      } else {
        nonNumericalPart = parts.slice(i).join('_');
        break;
      }
    }

    // Build nested structure for numerical dimensions
    for (let i = 0; i < numericalDimensions.length - 1; i++) {
      const index = numericalDimensions[i];
      if (!currentLevel[index]) {
        currentLevel[index] = {};
      }
      currentLevel = currentLevel[index];
    }

    // Handle the last dimension (either numerical or non-numerical)
    const lastNumericalIndex = numericalDimensions[numericalDimensions.length - 1];
    if (hasNonNumericalDimension) {
      if (!currentLevel[lastNumericalIndex]) {
        currentLevel[lastNumericalIndex] = {};
      }
      currentLevel = currentLevel[lastNumericalIndex];
      const finalKey = nonNumericalPart;

      // Store the score
      if (eliteMap.cells[key].hasOwnProperty("elts") && eliteMap.cells[key].elts.length > 0) {
        currentLevel[finalKey] = eliteMap.cells[key].elts[0].s;
      } else {
        currentLevel[finalKey] = null;
      }
    } else {
      if (eliteMap.cells[key].hasOwnProperty("elts") && eliteMap.cells[key].elts.length > 0) {
        currentLevel[lastNumericalIndex] = eliteMap.cells[key].elts[0].s;
      } else {
        currentLevel[lastNumericalIndex] = null;
      }
    }
  }

  // Convert the nested object to arrays
  function convertToArrays(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    return Object.keys(obj)
      .sort((a, b) => {
        // Sort numerically for number keys, lexicographically for strings
        if (!isNaN(a) && !isNaN(b)) return Number(a) - Number(b);
        return a.localeCompare(b);
      })
      .map(key => convertToArrays(obj[key]));
  }

  return convertToArrays(dataArray);
}

export function getScoreAndGenomeMatrixFromEliteMap(eliteMap) {
  let dataArray = {};
  let dimensions = new Set();
  let hasNonNumericalDimension = false;

  // First pass: analyze dimensions
  for (let key in eliteMap.cells) {
    const parts = key.split('_');
    let numericalDimensions = [];
    let nonNumericalPart = null;

    // Identify numerical dimensions and potential non-numerical part
    for (let i = 0; i < parts.length; i++) {
      const value = Number(parts[i]);
      if (!isNaN(value)) {
        numericalDimensions.push(value);
      } else {
        // If we find a non-numerical part, assume everything from here is part of it
        nonNumericalPart = parts.slice(i).join('_');
        hasNonNumericalDimension = true;
        break;
      }
    }

    dimensions.add(numericalDimensions.length + (hasNonNumericalDimension ? 1 : 0));
  }

  if (dimensions.size > 1) {
    throw new Error('Inconsistent dimension count across keys');
  }

  // Second pass: build nested structure
  for (let key in eliteMap.cells) {
    const parts = key.split('_');
    let currentLevel = dataArray;
    let numericalDimensions = [];
    let nonNumericalPart = null;

    // Split into numerical and non-numerical parts
    for (let i = 0; i < parts.length; i++) {
      const value = Number(parts[i]);
      if (!isNaN(value)) {
        numericalDimensions.push(value);
      } else {
        nonNumericalPart = parts.slice(i).join('_');
        break;
      }
    }

    // Build nested structure for numerical dimensions
    for (let i = 0; i < numericalDimensions.length - 1; i++) {
      const index = numericalDimensions[i];
      if (!currentLevel[index]) {
        currentLevel[index] = {};
      }
      currentLevel = currentLevel[index];
    }

    // Handle the last dimension (either numerical or non-numerical)
    const lastNumericalIndex = numericalDimensions[numericalDimensions.length - 1];
    if (hasNonNumericalDimension) {
      if (!currentLevel[lastNumericalIndex]) {
        currentLevel[lastNumericalIndex] = {};
      }
      currentLevel = currentLevel[lastNumericalIndex];
      const finalKey = nonNumericalPart;

      // Store the data
      if (eliteMap.cells[key].hasOwnProperty("elts") && eliteMap.cells[key].elts.length > 0) {
        currentLevel[finalKey] = {
          score: eliteMap.cells[key].elts[0].s,
          genomeId: eliteMap.cells[key].elts[0].g
        };
      } else {
        currentLevel[finalKey] = { score: null, genomeId: null };
      }
    } else {
      if (eliteMap.cells[key].hasOwnProperty("elts") && eliteMap.cells[key].elts.length > 0) {
        currentLevel[lastNumericalIndex] = {
          score: eliteMap.cells[key].elts[0].s,
          genomeId: eliteMap.cells[key].elts[0].g
        };
      } else {
        currentLevel[lastNumericalIndex] = { score: null, genomeId: null };
      }
    }
  }

  // Convert the nested object to arrays
  function convertToArrays(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.score !== undefined && obj.genomeId !== undefined) return obj;
    
    return Object.keys(obj)
      .sort((a, b) => {
        // Sort numerically for number keys, lexicographically for strings
        if (!isNaN(a) && !isNaN(b)) return Number(a) - Number(b);
        return a.localeCompare(b);
      })
      .map(key => convertToArrays(obj[key]));
  }

  return convertToArrays(dataArray);
}



///// (heat) map renders

export async function renderEliteMapsTimeline(
  evoRunDirPath, evoRunId, writeToFolder, overwriteExistingFiles,
  stepSize, terrainName,
  antiAliasing, useOvertoneInharmonicityFactors, frequencyUpdatesApplyToAllPathcNetworkOutputs,
  useGpu, sampleRate
) {
  const oneEvorunPath = evoRunDirPath + "/" + evoRunId;
  // Get commit info
  const commitIdsFilePath = getCommitIdsFilePath(oneEvorunPath+"/", true);
  const commitCount = getCommitCount({}, evoRunId, commitIdsFilePath);

  // Setup worker queue for parallel rendering
  const workerPath = path.join(__dirname, 'workers', 'renderAncestorToWavFile.js');
  const concurrencyLimit = 16;

  const queue = async.queue((task, done) => {
    const child = fork(workerPath);
    const { fileName, subFolder, ancestorData } = task;

    child.send({ 
      evoRunId, 
      oneEvorunPath,
      fileName, 
      subFolder, 
      ancestorData,
      overwriteExistingFiles,
      useOvertoneInharmonicityFactors, useGpu, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs, sampleRate
    });

    child.on('message', (message) => {
      console.log("Message from child:", message);
      done();
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Child process for ${fileName} exited with code ${code}`);
        done(new Error(`Child process exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      console.error(`Error from child process for ${fileName}:`, err);  
      done(err);
    });
  }, concurrencyLimit);

  // Process each iteration based on step size
  for (let iterationIndex = 0; iterationIndex < commitCount; iterationIndex += stepSize) {
    console.log(`Processing iteration ${iterationIndex}...`);

    try {
      // Get elite map for current iteration
      const eliteMap = await getEliteMap(
        oneEvorunPath,
        iterationIndex,
        false,
        terrainName
      );

      // Create output subfolder for this iteration
      const subFolder = path.join(writeToFolder, evoRunId );
      if (!fs.existsSync(subFolder)) {
        fs.mkdirSync(subFolder, { recursive: true });
      }

      // Get all cell keys
      const cellKeys = getCellKeys(eliteMap);

      // Process each elite in the map
      for (const cellKey of cellKeys) {
        const cell = eliteMap.cells[cellKey];
        
        if (cell.elts && cell.elts.length) {
          const elite = cell.elts[0];
          const genomeId = elite.g;
          const score = elite.s;

          // Format filename
          // let scorePrefix = '';
          // if (scoreInFileName) {
          //   const scorePercentRoundedAndPadded = Math.round(score * 100).toString().padStart(3, '0');
          //   scorePrefix = `${scorePercentRoundedAndPadded}_`;
          // }

          // Read genome data
          const genomeString = await readGenomeAndMetaFromDisk(evoRunId, genomeId, oneEvorunPath);
          const genomeAndMeta = JSON.parse(genomeString);
          let tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === cellKey);
          if( !tagForCell && genomeAndMeta.genome.tags.length ) {
            console.log("No tag found for cell key", cellKey, "in genome", genomeId, ", using first tag");
            tagForCell = genomeAndMeta.genome.tags[0];
          }
          let duration, noteDelta, velocity;
          if( tagForCell && tagForCell.duration ) {
            duration = tagForCell.duration;
            noteDelta = tagForCell.noteDelta;
            velocity = tagForCell.velocity;
          } else {
            throw new Error(`No tag found for cell key ${cellKey} in genome ${genomeId}`);
          }
          let parents = null;
          if( genomeAndMeta.genome.parentGenomes && genomeAndMeta.genome.parentGenomes.length ) {
            parents = genomeAndMeta.genome.parentGenomes;
          }
          // const cellKeyFileNameFriendly = cellKey.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          // const fileName = `${scorePrefix}${cellKeyFileNameFriendly}_${genomeId}_iter${iterationIndex}.wav`;
          const fileName = `${genomeId}-${duration}_${noteDelta}_${velocity}.wav`;
          const fullFilePath = path.join(subFolder, fileName);

          // Skip if file exists and we're not overwriting
          if (fs.existsSync(fullFilePath) && !overwriteExistingFiles) {
            console.log("File exists, skipping:", fullFilePath);
            continue;
          }

          // Queue rendering task
          queue.push({
            fileName,
            subFolder,
            ancestorData: {
              genomeId, cellKey, duration, noteDelta, velocity, parents
            }
          });
        }
      }
    } catch (error) {
      console.error(`Error processing iteration ${iterationIndex}:`, error);
      const errorFileName = `iteration_${iterationIndex}_ERROR.txt`;
      const errorFilePath = path.join(writeToFolder, 'errors', errorFileName);
      fs.mkdirSync(path.dirname(errorFilePath), { recursive: true });
      fs.writeFileSync(errorFilePath, error.message);
    }
  }

  // Wait for queue to complete
  return new Promise((resolve, reject) => {
    queue.drain(() => {
      console.log("All rendering complete");
      resolve();
    });
  });
}



///// elite count
export function getNewEliteCountForEliteMap( eliteMap ) {
  return eliteMap.eliteCountAtGeneration;
}
export async function getNewEliteCountForOneIteration( evoRunConfig, evoRunId, iterationIndex, terrainName ) {
  const eliteMap = await getEliteMapFromRunConfig( 
    evoRunConfig, evoRunId, iterationIndex,
    false, // forceCreateCommitIdsList
    terrainName
  );
  return getNewEliteCountForEliteMap( eliteMap );
}
export async function getNewEliteCountForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  // NB: stepSize larger than 1 doesn't really make sense for new elite count
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const iterationIndex = commitCount - 1;
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const eliteEnergies = {};
  const eliteIterationEnergies = [];
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const classChampionAndGoalSwitchCount = {};
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) { // stepSize > 1 might be misleading here
      log( `Calculating goal switches and goal switches for iteration ${iterationIndex}` );
      const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const iterationIndex = commitCount - 1;
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  let goalSwitchScoreCorrelation;
  try {
    goalSwitchScoreCorrelation = pearsonCorrelation(goalSwitches, scores);
  } catch (error) {
    goalSwitchScoreCorrelation = "N/A";
  }
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

export async function getLineageGraphData(evoRunConfig, evoRunId, stepSize = 1, processSingleMap = false) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
  const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
  const lineageGraphDataObj = {};
  
  // Get all terrain names by finding all elite map files
  let terrainNames = [];
  if (!processSingleMap) {
    const fileNames = fs.readdirSync(evoRunDirPath);
    const eliteMapFiles = fileNames.filter(file => file.startsWith(`elites_${evoRunId}`));
    
    terrainNames = eliteMapFiles.map(fileName => {
      const match = fileName.match(new RegExp(`elites_${evoRunId}_?(.*)\\.json`));
      return match && match[1] ? match[1] : '';
    }).filter(name => name !== ''); // Filter out empty terrain names (default map)
    
    // If no terrain-specific maps were found, add an empty string to process the default map
    if (terrainNames.length === 0) {
      terrainNames.push('');
    }
  } else {
    // Process only the default map or use the terrain name from classifiers if available
    terrainNames = getTerrainNames(evoRunConfig);
    if (terrainNames.length === 0) {
      terrainNames.push('');  // Default map (no terrain suffix)
    }
  }
  
  // First pass: collect terrain appearance information for each genome
  const genomeTerrainInfo = {};
  
  for (const terrainName of terrainNames) {
    log(`Processing lineage data for terrain: ${terrainName || 'default'}`);
    
    for (let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++) {
      if (iterationIndex % stepSize === 0) {
        log(`Collecting lineage graph data for iteration ${iterationIndex}, terrain: ${terrainName || 'default'}`);
        
        const eliteMap = await getEliteMapFromRunConfig(
          evoRunConfig, evoRunId, iterationIndex, false, terrainName
        );
        
        const cellKeys = Object.keys(eliteMap.cells);
        for (const oneCellKey of cellKeys) {
          const cell = eliteMap.cells[oneCellKey];
          if (cell.elts.length) {
            const genomeId = cell.elts[0].g;
            const score = cell.elts[0].s;
            const generation = cell.elts[0].gN;
            const unproductivityBiasCounter = cell.uBC;
            
            // Store terrain and cell info for this genome
            if (!genomeTerrainInfo[genomeId]) {
              genomeTerrainInfo[genomeId] = {
                terrainAppearances: []
              };
            }
            
            // Add this terrain and cell appearance if not already present
            const terrainInfo = genomeTerrainInfo[genomeId].terrainAppearances.find(
              t => t.terrain === (terrainName || 'default') && t.eliteClass === oneCellKey
            );
            
            if (!terrainInfo) {
              genomeTerrainInfo[genomeId].terrainAppearances.push({
                terrain: terrainName || 'default',
                eliteClass: oneCellKey,
                score,
                generation,
                unproductivityBiasCounter
              });
            }
          }
        }
      }
    }
  }
  
  // Second pass: gather detailed genome information but only once per genome
  for (const genomeId of Object.keys(genomeTerrainInfo)) {
    if (lineageGraphDataObj[genomeId] === undefined) {
      // Sort appearances by generation to find the earliest one
      genomeTerrainInfo[genomeId].terrainAppearances.sort((a, b) => a.generation - b.generation);
      
      // Use the earliest appearance (with lowest generation number) as the primary data
      const earliestAppearance = genomeTerrainInfo[genomeId].terrainAppearances[0];
      
      // Read the genome just once
      const genomeString = await readGenomeAndMetaFromDisk(evoRunId, genomeId, evoRunDirPath);
      const genome = await getGenomeFromGenomeString(genomeString);
      
      // Get parent info
      let parentGenomes;
      if (genome.parentGenomes) {
        parentGenomes = genome.parentGenomes;
      } else {
        parentGenomes = [];
      }
      
      // Find the tag for the earliest elite class we found
      let duration, noteDelta, velocity;
      if (genome.tags) {
        let tag = genome.tags.find(tag => tag.tag === earliestAppearance.eliteClass);
        if (!tag && genome.tags.length === 1) tag = genome.tags[0]; // fallback to first tag
        
        if (tag && tag.duration) {
          duration = tag.duration;
          noteDelta = tag.noteDelta;
          velocity = tag.velocity;
        } else {
          console.warn(`Tag not found for genome ${genomeId} in cell ${earliestAppearance.eliteClass}`);
        }
      }
      
      // Store the complete genome info using the earliest appearance as primary info
      lineageGraphDataObj[genomeId] = {
        id: genomeId,
        terrainAppearances: genomeTerrainInfo[genomeId].terrainAppearances,
        eliteClass: earliestAppearance.eliteClass, 
        terrain: earliestAppearance.terrain,
        s: earliestAppearance.score,
        gN: earliestAppearance.generation,
        uBC: earliestAppearance.unproductivityBiasCounter,
        duration,
        noteDelta,
        velocity,
        parentGenomes
      };
    }
  }
  
  // Convert lineageGraphDataObj to array format
  const lineageGraphData = Object.values(lineageGraphDataObj).map(genomeData => ({
    id: genomeData.id,
    eliteClass: genomeData.eliteClass,
    terrain: genomeData.terrain,
    terrainAppearances: genomeData.terrainAppearances,
    s: genomeData.s,
    gN: genomeData.gN,
    uBC: genomeData.uBC,
    duration: genomeData.duration,
    noteDelta: genomeData.noteDelta,
    velocity: genomeData.velocity,
    parents: genomeData.parentGenomes
  }));
  
  return lineageGraphData;
}

///// duration, delta, pitch combinations

export async function getDurationPitchDeltaVelocityCombinations( evoRunConfig, evoRunId, stepSize = 1, uniqueGenomes ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const durationPitchDeltaVelocityCombinations = [];
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) { // stepSize > 1 might be misleading here
      log( `Collecting duration, delta, pitch combinations for iteration ${iterationIndex}` );
      const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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
  const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex, true );
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
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  let lastPlayedGenomeId;
  let iterationIndex = ascending ? 0 : commitCount-1;
  while( ascending ? iterationIndex < commitCount : 0 <= iterationIndex ) {
    if( iterationIndex % stepSize === 0 ) {
      const eliteMap = await getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex );
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

async function getEliteMapFromRunConfig( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList, terrainName ) {
  const commitId = await getCommitID( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList );
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const terrainSuffix = terrainName ? `_${terrainName}` : '';
  let eliteMapFileName = `elites_${evoRunId}${terrainSuffix}.json`;
  const eliteMapFilePath = `${evoRunDirPath}/${eliteMapFileName}`;

  // Check if eliteMapFileName exists
  if (!fs.existsSync(eliteMapFilePath)) {
    // Try to find the first elite map file ending with '_customRef1.json'
    const eliteMapFiles = fs.readdirSync(evoRunDirPath).filter(file => file.startsWith('elites_'));
    const customRefFile = eliteMapFiles.find(file => file.endsWith('_customRef1.json'));
    if (customRefFile) {
      eliteMapFileName = customRefFile;
    } else if (eliteMapFiles.length) {
      eliteMapFileName = eliteMapFiles[0];
    } else {
      throw new Error(`Elite map file not found in ${evoRunDirPath}`);
    }
  }

  // Check if the elite file is tracked by git
  let isTracked = false;
  try {
    runCmd(`git -C ${evoRunDirPath} ls-files --error-unmatch ${eliteMapFileName}`, true);
    isTracked = true;
  } catch (error) {
    if (error.message.includes("did not match any file(s) known to git")) {
      isTracked = false;
    } else {
      throw error;
    }
  }

  let eliteMapString;
  if (isTracked) {
    eliteMapString = await spawnCmd(`git -C ${evoRunDirPath} show ${commitId}:${eliteMapFileName}`, {}, true);
  } else {
    eliteMapString = fs.readFileSync(eliteMapFilePath, 'utf8');
  }

  const eliteMap = JSON.parse(eliteMapString);
  return eliteMap;
}

async function getCommitID( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList ) {
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, forceCreateCommitIdsList );
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

function getCommitIdsFilePathFromRunConfig( evoRunConfig, evoRunId, forceCreateCommitIdsList ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  return getCommitIdsFilePath( evoRunDirPath, forceCreateCommitIdsList );
}

function getCommitIdsFilePath( evoRunDirPath, forceCreateCommitIdsList ) {
  const commitIdsFileName = "commit-ids.txt";
  const commitIdsFilePath = `${evoRunDirPath}${commitIdsFileName}`;
  if( forceCreateCommitIdsList || ! fs.existsSync(`${evoRunDirPath}/commit-ids.txt`) ) {
    runCmd(`git -C ${evoRunDirPath} rev-list HEAD --first-parent --reverse > ${commitIdsFilePath}`);
  }
  return commitIdsFilePath;
}



///// phylogenetic tree metrics

/**
 * Functions to integrate phylogenetic tree metrics 
 * into the qd-run-analysis.js file
 */

import {
  calculateAllPhylogeneticMetrics,
  calculateExtantLineages,
  calculateTotalSamples,
  calculateUniqueLineages,
  calculateEvolutionaryEvents,
  calculateTreeShapeMetrics,
  calculateTerrainTransitionMetrics,
  calculateDensityDependence
} from './phylogenetic-tree-metrics.js';

/**
 * Analyze phylogenetic tree metrics for a given evolutionary run
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @param {boolean} saveToFile - Whether to save results to a file
 * @returns {Object} Metrics calculations
 */
export async function analyzePhylogeneticTreeMetrics(evoRunConfig, evoRunId, lineage, saveToFile = true) {
  console.log(`Analyzing phylogenetic tree metrics for run ${evoRunId}...`);
  
  const lineageData = lineage || await getLineageGraphData(evoRunConfig, evoRunId);
  
  // Calculate all metrics
  const metrics = calculateAllPhylogeneticMetrics(lineageData);
  
  if (saveToFile) {
    // Save to file
    const metricsStringified = JSON.stringify(metrics, null, 2);
    const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
    const metricsFilePath = `${evoRunDirPath}phylogenetic-metrics.json`;
    fs.writeFileSync(metricsFilePath, metricsStringified);
    console.log(`Saved phylogenetic metrics to ${metricsFilePath}`);
  }
  
  return metrics;
}

/**
 * Track phylogenetic tree metrics over iterations
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @param {number} stepSize - Number of iterations to skip between calculations
 * @returns {Object} Metrics over time
 */
export async function trackPhylogeneticMetricsOverTime(evoRunConfig, evoRunId, stepSize = 10) {
  console.log(`Tracking phylogenetic metrics over time for run ${evoRunId}...`);
  
  // Get lineage data chronologically by fetching at each step
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
  const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
  
  const metricsOverTime = {
    extantLineages: [],
    totalSamples: [],
    uniqueLineages: [],
    births: [],
    deaths: [],
    extinctions: [],
    sackinIndex: [],
    collessIndex: [],
    terrainAdaptability: [],
    isDensityDependent: []
  };
  
  // Sample at regular intervals
  for (let iterationIndex = 0; iterationIndex < commitCount; iterationIndex += stepSize) {
    console.log(`Calculating metrics for iteration ${iterationIndex}...`);
    
    // Get lineage data up to this iteration
    const lineageData = await getLineageGraphData(evoRunConfig, evoRunId, stepSize, true, iterationIndex);
    
    // Calculate core metrics
    const metrics = calculateAllPhylogeneticMetrics(lineageData);
    
    // Record metrics
    metricsOverTime.extantLineages.push({
      iteration: iterationIndex,
      value: metrics.extantLineages
    });
    
    metricsOverTime.totalSamples.push({
      iteration: iterationIndex,
      value: metrics.totalSamples
    });
    
    metricsOverTime.uniqueLineages.push({
      iteration: iterationIndex,
      value: metrics.uniqueLineages
    });
    
    metricsOverTime.births.push({
      iteration: iterationIndex,
      value: metrics.events.birthCount
    });
    
    metricsOverTime.deaths.push({
      iteration: iterationIndex,
      value: metrics.events.deathCount
    });
    
    metricsOverTime.extinctions.push({
      iteration: iterationIndex,
      value: metrics.events.extinctionCount
    });
    
    metricsOverTime.sackinIndex.push({
      iteration: iterationIndex,
      value: metrics.shape.sackinIndex
    });
    
    metricsOverTime.collessIndex.push({
      iteration: iterationIndex,
      value: metrics.shape.collessIndex
    });
    
    metricsOverTime.terrainAdaptability.push({
      iteration: iterationIndex,
      value: metrics.terrainTransitions.terrainAdaptability
    });
    
    metricsOverTime.isDensityDependent.push({
      iteration: iterationIndex,
      value: metrics.densityDependence.isDensityDependent,
      correlation: metrics.densityDependence.densityDependenceCorrelation
    });
  }
  
  // Save metrics over time
  const metricsOverTimeStringified = JSON.stringify(metricsOverTime, null, 2);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const metricsFilePath = `${evoRunDirPath}phylogenetic-metrics-over-time_step-${stepSize}.json`;
  fs.writeFileSync(metricsFilePath, metricsOverTimeStringified);
  
  return metricsOverTime;
}

/**
 * Compare terrain adaptability metrics
 * Specifically focuses on transitions between different terrains
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @returns {Object} Terrain transition metrics
 */
export async function analyzeTerrainTransitions(evoRunConfig, evoRunId, lineage) {
  console.log(`Analyzing terrain transitions for run ${evoRunId}...`);
  
  // Get lineage data
  const lineageData = lineage || await getLineageGraphData(evoRunConfig, evoRunId);
  
  // Calculate terrain transition metrics
  const terrainMetrics = calculateTerrainTransitionMetrics(lineageData);
  
  // Create a transition graph for visualization
  const transitionGraph = {
    nodes: [],
    links: []
  };
  
  // Add nodes (terrains)
  Object.entries(terrainMetrics.terrainOccurrences).forEach(([terrain, count]) => {
    transitionGraph.nodes.push({
      id: terrain,
      count: count
    });
  });
  
  // Add links (transitions)
  Object.entries(terrainMetrics.terrainTransitions).forEach(([transition, count]) => {
    const [source, target] = transition.split('->');
    transitionGraph.links.push({
      source,
      target,
      value: count
    });
  });
  
  // Save terrain transition graph
  const transitionGraphStringified = JSON.stringify(transitionGraph, null, 2);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const graphFilePath = `${evoRunDirPath}terrain-transition-graph.json`;
  fs.writeFileSync(graphFilePath, transitionGraphStringified);
  
  return {
    terrainMetrics,
    transitionGraph
  };
}

/**
 * Analyze density dependence of diversification
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @returns {Object} Density dependence analysis
 */
export async function analyzeDensityDependence(evoRunConfig, evoRunId, lineage) {
  console.log(`Analyzing density dependence for run ${evoRunId}...`);
  
  // Get lineage data
  const lineageData = lineage || await getLineageGraphData(evoRunConfig, evoRunId);
  
  // Calculate density dependence metrics
  const densityMetrics = calculateDensityDependence(lineageData);
  
  // Create data for density vs growth rate plot
  const densityGrowthData = densityMetrics.growthRates.map(rate => ({
    generation: rate.toGeneration,
    diversity: rate.prevDiversity,
    growthRate: rate.growthRate
  }));
  
  // Save density dependence analysis
  const densityMetricsStringified = JSON.stringify({
    ...densityMetrics,
    densityGrowthData
  }, null, 2);
  
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const densityFilePath = `${evoRunDirPath}density-dependence-analysis.json`;
  fs.writeFileSync(densityFilePath, densityMetricsStringified);
  
  return {
    ...densityMetrics,
    densityGrowthData
  };
}

/**
 * Generate an extended phylogenetic tree report
 * This creates a more comprehensive analysis combining multiple metrics
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @returns {Object} Complete phylogenetic analysis
 */
export async function generatePhylogeneticReport(evoRunConfig, evoRunId, lineage) {
  console.log(`Generating comprehensive phylogenetic report for run ${evoRunId}...`);
  
  // Get all metrics
  const metrics = await analyzePhylogeneticTreeMetrics(evoRunConfig, evoRunId, lineage, false);
  const terrainAnalysis = await analyzeTerrainTransitions(evoRunConfig, evoRunId, lineage);
  const densityAnalysis = await analyzeDensityDependence(evoRunConfig, evoRunId, lineage);
  
  // Additional QD-specific analysis
  const { genomeCounts } = await getGenomeCountsForAllIterations(evoRunConfig, evoRunId);
  const coverageData = await getCoverageForAllIterations(evoRunConfig, evoRunId);
  const qdScores = await calculateQDScoresForAllIterations(evoRunConfig, evoRunId);
  
  // Combine into comprehensive report
  const report = {
    summary: {
      runId: evoRunId,
      totalGenomes: metrics.totalSamples,
      uniqueLineages: metrics.uniqueLineages,
      extantLineages: metrics.extantLineages,
      births: metrics.events.birthCount,
      deaths: metrics.events.deathCount,
      extinctions: metrics.events.extinctionCount,
      isDensityDependent: metrics.densityDependence.isDensityDependent,
      terrainAdaptability: metrics.terrainTransitions.terrainAdaptability
    },
    treeMetrics: {
      size: {
        extantLineages: metrics.extantLineages,
        totalSamples: metrics.totalSamples,
        uniqueLineages: metrics.uniqueLineages
      },
      shape: metrics.shape,
      events: metrics.events
    },
    qdMetrics: {
      finalCoverage: Array.isArray(coverageData) ? coverageData[coverageData.length - 1] : null,
      finalQDScore: Array.isArray(qdScores) ? qdScores[qdScores.length - 1] : null,
      genomeCount: Array.isArray(genomeCounts) ? genomeCounts[genomeCounts.length - 1] : null
    },
    terrainAnalysis: {
      transitions: terrainAnalysis.terrainMetrics.terrainTransitions,
      occurrences: terrainAnalysis.terrainMetrics.terrainOccurrences,
      adaptability: terrainAnalysis.terrainMetrics.terrainAdaptability,
      multiTerrainGenomeCount: terrainAnalysis.terrainMetrics.multiTerrainGenomeCount
    },
    densityDependence: {
      correlation: densityAnalysis.densityDependenceCorrelation,
      isDensityDependent: densityAnalysis.isDensityDependent,
      diversityByGeneration: densityAnalysis.diversityByGeneration
    }
  };
  
  // Save comprehensive report
  const reportStringified = JSON.stringify(report, null, 2);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const reportFilePath = `${evoRunDirPath}phylogenetic-report.json`;
  fs.writeFileSync(reportFilePath, reportStringified);
  
  console.log(`Saved comprehensive phylogenetic report to ${reportFilePath}`);
  
  return report;
}