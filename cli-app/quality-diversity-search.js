import fs from 'fs';
import path from 'path';
import {glob} from 'glob';
import {ulid} from 'ulid';
import Chance from 'chance';
import sample from "lodash-es/sample.js";
import toWav from 'audiobuffer-to-wav';
import { getAudioGraphMutationParams } from "./kromosynth.js";
import { 
  yamnetTags, 
  nsynthTags,
  mtgJamendoInstrumentTags,
  musicLoopInstrumentRoleClassLabels,
  moodAcousticClassLabels, moodElectronicClassLabels, voiceInstrumentalClassLabels, voiceGenderClassLabels,
  timbreClassLabels, nsynthAcousticElectronicClassLabels, nsynthBrightDarkClassLabels, nsynthReverbClassLabels,
} from './util/classificationTags.js';
import {
  getGenomeFromGenomeString, getNewAudioSynthesisGenomeByMutation,
  getAudioBufferFromGenomeAndMeta
} from 'kromosynth';
import {
  callGeneEvaluationService,
  clearServiceConnectionList
} from './service/gRPC/gene_client.js';
// in Environment:
// import {
//   callRandomGeneService,
//   callGeneVariationService,
// } from './service/websocket/ws-genome-variation.js';
// in Environment:
// import { 
//   renderAndEvaluateGenomesViaWebsockets,
//   getAudioBufferChannelDataForGenomeAndMetaFromWebsocet,
//   getFeaturesFromWebsocket, getDiversityFromWebsocket, 
//   getQualityFromWebsocket, getQualityFromWebsocketForEmbedding, addToQualityQueryEmbeddigs,
//   getAudioClassPredictionsFromWebsocket,
//   isServerAvailable
// } from './service/websocket/ws-gene-evaluation.js';
import {
  runCmd, calcStandardDeviation,
  invertedLogarithmicRamp,
  deleteAllGenomesNotInEliteMap, deleteAllGenomeRendersNotInEliteMap,
  getGradient,
  getFeaturesForGenomeString,
  getDurationNoteDeltaVelocityFromGenomeString,
  getFeatureIndicesFromEliteMapMeta,
  getClassificationDimensionsFromEliteMapConfig
} from './util/qd-common.js';
// in Environment:
// import {
//   createEvoRunDir,
//   readGenomeAndMetaFromDisk,
//   saveEliteMapToDisk, readEliteMapFromDisk, saveEliteMapMetaToDisk, readEliteMapMetaFromDisk,
//   saveCellFeaturesToDisk, readCellFeaturesFromDiskForEliteMap, readFeaturesForGenomeIdsFromDisk, 
//   getEliteGenomeIdsFromEliteMaps, 
//   saveGenomeToDisk, getEliteMapKey,
//   saveLostFeaturesToDisk, readAllLostFeaturesFromDisk,
//   saveCellFeaturesAtGenerationToDisk
// } from './util/qd-common-elite-map-persistence.js';
import { callGeneEvaluationWorker, callRandomGeneWorker, callGeneVariationWorker } from './service/workers/gene-child-process-forker.js';
import { getAudioContext, getNewOfflineAudioContext } from './util/rendering-common.js';
import { calculateQDScoreForEliteMap, getCoverageForEliteMap } from './qd-run-analysis.js';
import DiversityTracker from './util/diversity-tracker.js';
import NoveltyArchive from './util/novelty-archive.js';
import DimensionalityReductionModel from './util/dimensionality-reduction-model.js';
import { logGenerationNumberAsAsciiArt } from './util/qd-common.js';

import { runGridSearch } from './grid-search.js'; // New import

import { Environment } from './environment.js';
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  await Environment.initialize('node');
} else {
  await Environment.initialize('browser');
}

const chance = new Chance();

const MAP_SELECTOR_BIAS = Object.freeze({ // enum !
  UNIFORM: 'uniform',
  PRODUCTIVITY: 'productivity',
  NOVELTY: 'novelty',
  SURPRISE: 'surprise'
});

const ELITE_REMAPPING_COMPETITION_CRITERIA = Object.freeze({ // enum !
  SCORE: 'score',
  NOVELTY: 'novelty',
  SURPRISE: 'surprise'
  // TODO: mixture of the above?
});



export async function qdSearch(
  evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters,
  exitWhenDone = true
) {
  // Check if this is a grid search run
  if (evolutionRunConfig.gridSearch) {
    // Delegate to the grid search module
    await runGridSearch(evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters, exitWhenDone);
    return;
  }

  // Standard run - call the core evolution logic without grid search monitoring
  await runCoreEvolution(
    evolutionRunId, 
    evolutionRunConfig, 
    evolutionaryHyperparameters, 
    {
      exitConditions: standardExitConditions,
      collectMetrics: false
    }
  );
  
  if (exitWhenDone) process.exit();
}

// Function for grid-search.js to use
export async function runEvolution(evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters) {
  // Run with additional exit conditions and metric collection
  return await runCoreEvolution(
    evolutionRunId, 
    evolutionRunConfig, 
    evolutionaryHyperparameters, 
    {
      exitConditions: gridSearchExitConditions,
      collectMetrics: true
    }
  );
}

// The standard exit conditions checker
function standardExitConditions(eliteMap, terminationCondition, gradientWindowSize, classificationGraphModel, evolutionRunId, evoRunDirPath, dummyRun, batchDurationMs, startTimeMs) {
  return shouldTerminate(terminationCondition, gradientWindowSize, eliteMap, classificationGraphModel, evolutionRunId, evoRunDirPath, dummyRun) 
    || (batchDurationMs && batchDurationMs < Date.now() - startTimeMs);
}

// Exit conditions for grid search runs
function gridSearchExitConditions(eliteMap, terminationCondition, gradientWindowSize, classificationGraphModel, evolutionRunId, evoRunDirPath, dummyRun, batchDurationMs, startTimeMs, auroraModeConfig, startTime, timeLimit) {
  return standardExitConditions(eliteMap, terminationCondition, gradientWindowSize, classificationGraphModel, evolutionRunId, evoRunDirPath, dummyRun, batchDurationMs, startTimeMs)
    || (auroraModeConfig?.gridSearchEvaluation && 
        (eliteMap.qdScoreWithoutIncreaseCount > auroraModeConfig.stagnationThreshold ||
         eliteMap.coverageWithoutIncreaseCount > auroraModeConfig.stagnationThreshold))
    || (Date.now() - startTime > timeLimit);
}





/**
 *
 * @param {string} evolutionRunId Identifier for the evolution run
 * @param {object} evolutionRunConfig Configuration JSON for this evolution run, such as:
 * {
 *  "seedEvals": 100,
 *  "terminationCondition": {
 *   "numberOfEvals": x
 *   or
 *   "averageFitnessInMap": x
 *   or
 *   "medianFitnessInMap": x
 *   or
 *   {"percentageOfMapFilledWithFitnessThreshold": {"percentage": x, "minimumCellFitness": x}}
 *  },
 *  "evoRunsDirPath": "evoruns/",
 *  "probabilityMutatingWaveNetwork": 0.5,
 *  "probabilityMutatingPatch": 0.5,
 *  "classScoringDurations": [0.5, 1, 2, 5],
 *  "classScoringNoteDeltas": [-36, -24, -12, 0, 12, 24, 36],
 *  "classScoringVelocities": [0.25, 0.5, 0.75, 1],
 *  "classifiers": ["yamnet"],
 *  "useGpuForTensorflow": true
 * }
 * @param {object} evolutionaryHyperparameters
 */
export async function runCoreEvolution(
  evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters,
  {
    exitConditions,
    collectMetrics = false
  }
) {
  const {
    algorithm: algorithmKey,
    evoRunsGroup,
    seedEvals, 
    eliteWinsOnlyOneCell, classRestriction,
    maxNumberOfParents,
    terminationCondition, gradientWindowSize, scoreProportionalToNumberOfEvalsTerminationCondition,
    evoRunsDirPath, evoRendersDirPath,
    populationSize, gridDepth,
    geneEvaluationProtocol, childProcessBatchSize, 
    batchSize, batchMultiplicationFactor,
    evaluationCandidateWavFilesDirPath,
    probabilityMutatingWaveNetwork, probabilityMutatingPatch, oneCPPNPerFrequency,
    classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    classScoringVariationsAsContainerDimensions,
    classifiers, classifierIndex, ckptDir, yamnetModelUrl, measureCollectivePerformance,
    classesAsMaps, mapSwitchingCondition,
    useGpuForTensorflow,
    renderSampleRateForClassifier,
    commitEliteMapToGitEveryNIterations, 
    addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
    renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
    processingUtilisation,
    batchDurationMs,
    gRpcHostFilePathPrefix, gRpcServerCount,
    renderingSocketHostFilePathPrefix, renderingSocketServerCount,
    evaluationSocketHostFilePathPrefix, evaluationSocketServerCount,
    evaluationFeatureSocketHostFilePathPrefix, evaluationFeatureSocketServerCount, evaluationQualitySocketHostFilePathPrefix, evaluationQualitySocketServerCount, evaluationProjectionSocketHostFilePathPrefix, evaluationProjectionSocketServerCount,
    geneVariationServerPaths, geneRenderingServerPaths, geneEvaluationServerPaths,
    geneVariationServers, geneRenderingServers, 
    geneEvaluationServers,
    evaluationFeatureServers, evaluationQualityServers, evaluationProjectionServers,
    dummyRun,
    auroraModeConfig
  } = evolutionRunConfig;

  const classificationGraphModel = classifiers[classifierIndex];

  const startTimeMs = Date.now();

  let _geneVariationServers;
  if( gRpcHostFilePathPrefix && gRpcServerCount ) {
    _geneVariationServers = [];
    for( let i=1; i <= gRpcServerCount; i++ ) {
      const hostFilePath = `${gRpcHostFilePathPrefix}${i}`;
      const variationHost = "ws://" + await readFromFileWhenItExists(hostFilePath, 0);
      if( variationHost ) _geneVariationServers.push(variationHost);
    }
  } else if( geneVariationServerPaths && geneVariationServerPaths.length ) {
    _geneVariationServers = [];
    geneVariationServerPaths.forEach( oneServerPath => _geneVariationServers.push(fs.readFileSync(oneServerPath, 'utf8')) );
  } else {
    _geneVariationServers = geneVariationServers;
  }

  let _geneRenderingServers;
  if( renderingSocketHostFilePathPrefix && renderingSocketServerCount ) {
    _geneRenderingServers = [];
    for( let i=1; i <= renderingSocketServerCount; i++ ) {
      const hostFilePath = `${renderingSocketHostFilePathPrefix}${i}`;
      const renderingHost = "ws://" + await readFromFileWhenItExists(hostFilePath, 0);
      if( renderingHost ) _geneRenderingServers.push(renderingHost);
    }
  } else if( geneRenderingServerPaths && geneRenderingServerPaths.length ) {
    _geneRenderingServers = [];
    geneRenderingServerPaths.forEach( oneServerPath => _geneRenderingServers.push(fs.readFileSync(oneServerPath, 'utf8')) );
  } else {
    _geneRenderingServers = geneRenderingServers;
  }

  // this:
  let _geneEvaluationServers;
  if( evaluationSocketHostFilePathPrefix && evaluationSocketServerCount ) {
    _geneEvaluationServers = [];
    for( let i=1; i <= evaluationSocketServerCount; i++ ) {
      const hostFilePath = `${evaluationSocketHostFilePathPrefix}${i}`;
      const evaluationHost = "ws://" + await readFromFileWhenItExists(hostFilePath, 0);
      if( evaluationHost ) _geneEvaluationServers.push(evaluationHost);
    }
  } else if( geneEvaluationServerPaths && geneEvaluationServerPaths.length ) {
    _geneEvaluationServers = [];
    geneEvaluationServerPaths.forEach( oneServerPath => _geneEvaluationServers.push(fs.readFileSync(oneServerPath, 'utf-8')) );
  } else {
    _geneEvaluationServers = geneEvaluationServers;
  }
  // or that:
  let _evaluationFeatureServers;
  let _evaluationQualityServers;
  let _evaluationProjectionServers;
  if( evaluationFeatureSocketHostFilePathPrefix && evaluationFeatureSocketServerCount ) {
    _evaluationFeatureServers = [];
    for( let i=1; i <= evaluationFeatureSocketServerCount; i++ ) {
      const hostFilePath = `${evaluationFeatureSocketHostFilePathPrefix}${i}`;
      console.log("evaluation hostFilePath:",hostFilePath);
      const evaluationHost = "ws://" + await readFromFileWhenItExists(hostFilePath, 0);
      if( evaluationHost ) _evaluationFeatureServers.push(evaluationHost);
    }
  } else {
    _evaluationFeatureServers = evaluationFeatureServers;
  }
  if( evaluationQualitySocketHostFilePathPrefix && evaluationQualitySocketServerCount ) {
    _evaluationQualityServers = [];
    for( let i=1; i <= evaluationQualitySocketServerCount; i++ ) {
      const hostFilePath = `${evaluationQualitySocketHostFilePathPrefix}${i}`;
      console.log("quality hostFilePath:",hostFilePath);
      const evaluationHost = "ws://" + await readFromFileWhenItExists(hostFilePath, 0);
      if( evaluationHost ) _evaluationQualityServers.push(evaluationHost);
    }
  } else {
    _evaluationQualityServers = evaluationQualityServers;
  }
  if( evaluationProjectionSocketHostFilePathPrefix && evaluationProjectionSocketServerCount ) {
    _evaluationProjectionServers = [];
    for( let i=1; i <= evaluationProjectionSocketServerCount; i++ ) {
      const hostFilePath = `${evaluationProjectionSocketHostFilePathPrefix}${i}`;
      console.log("projection hostFilePath:",hostFilePath);
      const evaluationHost = "ws://" + await readFromFileWhenItExists(hostFilePath, 0);
      if( evaluationHost ) _evaluationProjectionServers.push(evaluationHost);
    }
  } else {
    _evaluationProjectionServers = evaluationProjectionServers;
  }

  // check for servers to become available
  
  // if( _geneVariationServers && _geneVariationServers.length ) {
  //   await Promise.all( _geneVariationServers.map( async oneVariationServer => {
  //     while( ! await isServerAvailable(oneVariationServer) ) {
  //       console.log("waiting for gene variation server to become available:",oneVariationServer);
  //       await new Promise( resolve => setTimeout(resolve, 1000) );
  //     }
  //   }) );
  // }
  if( _geneRenderingServers && _geneRenderingServers.length ) {
    await Promise.all( _geneRenderingServers.map( async oneRenderingServer => {
      while( ! await Environment.evaluation.isServerAvailable(oneRenderingServer) ) {
        console.log("waiting for gene rendering server to become available:",oneRenderingServer);
        await new Promise( resolve => setTimeout(resolve, 1000) );
      }
    }) );
  }
  if( _geneEvaluationServers && _geneEvaluationServers.length ) {
    await Promise.all( _geneEvaluationServers.map( async oneEvaluationServer => {
      while( ! await Environment.evaluation.isServerAvailable(oneEvaluationServer) ) {
        console.log("waiting for gene evaluation server to become available:",oneEvaluationServer);
        await new Promise( resolve => setTimeout(resolve, 1000) );
      }
    }) );
  }
  if( _evaluationFeatureServers && _evaluationFeatureServers.length ) {
    await Promise.all( _evaluationFeatureServers.map( async oneEvaluationFeatureServer => {
      while( ! await Environment.evaluation.isServerAvailable(oneEvaluationFeatureServer) ) {
        console.log("waiting for evaluation feature server to become available:",oneEvaluationFeatureServer);
        await new Promise( resolve => setTimeout(resolve, 1000) );
      }
    }) );
  }
  if( _evaluationQualityServers && _evaluationQualityServers.length ) {
    await Promise.all( _evaluationQualityServers.map( async oneEvaluationQualityServer => {
      while( ! await Environment.evaluation.isServerAvailable(oneEvaluationQualityServer) ) {
        console.log("waiting for evaluation quality server to become available:",oneEvaluationQualityServer);
        await new Promise( resolve => setTimeout(resolve, 1000) );
      }
    }) );
  }
  if( _evaluationProjectionServers && _evaluationProjectionServers.length ) {
    await Promise.all( _evaluationProjectionServers.map( async oneEvaluationProjectionServer => {
      while( ! await Environment.evaluation.isServerAvailable(oneEvaluationProjectionServer) ) {
        console.log("waiting for evaluation projection server to become available:",oneEvaluationProjectionServer);
        await new Promise( resolve => setTimeout(resolve, 1000) );
      }
    }) );
  }

  // initialise git
  const evoRunDirPath = `${evoRunsDirPath}${evolutionRunId}/`;
  const evoRenderDirPath = `${evoRendersDirPath}${evolutionRunId}/`;
  const evoRunFailedGenesDirPath = `${evoRunsDirPath}${evolutionRunId}_failed-genes/`;

  let eliteMap;
  let eliteMapMeta;
  let eliteMapIndex;
  let terrainName = undefined;
  let sampleRate;
  let cellFeatures;

  eliteMapMeta = Environment.persistence.readEliteMapMetaFromDisk( evolutionRunId, evoRunDirPath );
  if( ! eliteMapMeta ) {
    eliteMapIndex = 0
    eliteMapMeta = {
      eliteMapIndex
    };
    Environment.persistence.createEvoRunDir( evoRunDirPath );
    Environment.persistence.createEvoRunDir( evoRunFailedGenesDirPath );
    Environment.persistence.saveEliteMapMetaToDisk( eliteMapMeta, evoRunDirPath, evolutionRunId );
  } else {
    eliteMapIndex = eliteMapMeta.eliteMapIndex;
  }

  if( typeof classificationGraphModel === "object" && classificationGraphModel.hasOwnProperty("classConfigurations") ) {
    terrainName = classificationGraphModel.classConfigurations[eliteMapIndex].refSetName;
    sampleRate = classificationGraphModel.classConfigurations[eliteMapIndex].sampleRate;
  } else {
    sampleRate = renderSampleRateForClassifier;
  }

  eliteMap = Environment.persistence.readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName );
  if( ! eliteMap ) {
    let eliteMapContainer = await initializeGrid( 
      evolutionRunId, algorithmKey, evolutionRunConfig, evolutionaryHyperparameters
    );

    runCmd(`git init ${evoRunDirPath}`);

    Environment.persistence.saveEliteMapToDisk( eliteMapContainer, evoRunDirPath, evolutionRunId, undefined /* terrainName */, true /* addToGit */);

    // add file to git
    // TODO: now again done in saveEliteMapToDisk
    // const eliteMapFileName = `${getEliteMapKey(evolutionRunId)}.json`;
    // runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);

    if( Array.isArray(eliteMapContainer) ) {
      // we have multiple maps
      // eliteMapIndex = Math.floor(Math.random() * eliteMapContainer.length);
      // eliteMap = eliteMapContainer[eliteMapIndex];
      // let's for now start with the first one:
      eliteMap = eliteMapContainer[0];
    } else {
      // we have one object with a single map
      eliteMap = eliteMapContainer;
    }


  } else {
    // delete all git lock files at evoRunDirPath if they exist
    const gitLockFilePaths = [...glob.sync(`${evoRunDirPath}.git/objects/pack/*.lock`), ...glob.sync(`${evoRunDirPath}.git/*.lock`), ...glob.sync(`${evoRunDirPath}.git/refs/heads/*.lock`)];
    gitLockFilePaths.forEach( oneGitLockFilePath => {
      if( fs.existsSync(oneGitLockFilePath) ) {
        fs.unlinkSync(oneGitLockFilePath);
      }
    });
  }
  cellFeatures = Environment.persistence.readCellFeaturesFromDiskForEliteMap( evoRunDirPath, evolutionRunId, eliteMap );


  let noveltyArchive;

  let classConfiguration = classificationGraphModel.classConfigurations && classificationGraphModel.classConfigurations.length ? classificationGraphModel.classConfigurations[eliteMapIndex] : undefined;
  if( classConfiguration && classConfiguration.useNoveltyArchive ) {
    noveltyArchive = await NoveltyArchive.loadFromFile(evoRunDirPath);
    if( ! noveltyArchive ) {
      const { noveltyArchiveSizePercentage } = classConfiguration;
      const archiveSize = Object.keys(eliteMap.cells).length * noveltyArchiveSizePercentage;
      const noveltyThreshold = 0.5; // TODO: hardcoded for now
      const dimensionality = classificationGraphModel.classificationDimensions.length;
      noveltyArchive = new NoveltyArchive( archiveSize, noveltyThreshold, dimensionality, classificationGraphModel.classificationDimensions );
      noveltyArchive.saveToFile(evoRunDirPath);
    }
  }

  const audioGraphMutationParams = getAudioGraphMutationParams( evolutionaryHyperparameters );
  const patchFitnessTestDuration = 0.1;

  let searchBatchSize;
  if( dummyRun ) {
    searchBatchSize = dummyRun.searchBatchSize;
  } else if( batchSize ) {
    searchBatchSize = batchSize;
  } else if( classRestriction && classRestriction.length ) {
    searchBatchSize = classRestriction.length * batchMultiplicationFactor;
  } else if( geneEvaluationProtocol === "worker" ) {
    searchBatchSize = childProcessBatchSize;
  } else {
    if( _geneEvaluationServers && _geneEvaluationServers.length ) {
      searchBatchSize = _geneEvaluationServers.length * (batchMultiplicationFactor || 1);
    } else if( _evaluationFeatureServers && _evaluationFeatureServers.length ) {
      searchBatchSize = _evaluationFeatureServers.length * (batchMultiplicationFactor || 1);
    }
  }

  // turn of automatic garbage collection,
  // as automatic background runs seem to affect performance when performing rapid successive commits
  // - gc will be triggered manually at regular intervals below
// TODO temporarily commenting out:  runCmd('git config --global gc.auto 0');
// ... turn on
// runCmd('git config --global gc.auto 1');


  let seedFeaturesAndScores = [];

  let zScoreNormalisationTrainFeaturesPathObj = { zScoreNormalisationTrainFeaturesPath: undefined }; // object to pass by reference, to be able to mutate from within mapElitesBatch

  // Initialize time tracking
  const hourInMs = 60 * 60 * 1000;
  const timeLimit = Infinity; // Originally: hourInMs * 0.95
  const startTime = Date.now();
  
  // Performance metrics tracking
  let maxQDScoreWithoutIncrease = 0;
  let maxCoverageWithoutIncrease = 0;

  // while( 
  //     ! shouldTerminate(terminationCondition, gradientWindowSize, eliteMap, classificationGraphModel, evolutionRunId, evoRunDirPath, dummyRun)
  //     &&
  //     ! ( batchDurationMs && batchDurationMs < Date.now() - startTimeMs )
  // ) {
  while (!exitConditions(
    eliteMap, terminationCondition, gradientWindowSize, 
    classificationGraphModel, evolutionRunId, evoRunDirPath, 
    dummyRun, batchDurationMs, startTimeMs,
    evolutionRunConfig.auroraModeConfig, startTime, timeLimit
  )) {

    logGenerationNumberAsAsciiArt(eliteMap.generationNumber)

    // optionally ramping up the fitness values, to avoid premature convergence
    let scoreProportion;
    if( scoreProportionalToNumberOfEvalsTerminationCondition && terminationCondition.numberOfEvals ) {
      scoreProportion = invertedLogarithmicRamp(eliteMap.generationNumber*searchBatchSize, terminationCondition.numberOfEvals);
    } else {
      scoreProportion = 1.0;
    }

    // check if we should switch maps
    if( classesAsMaps && 
      (eliteMap.generationNumber*searchBatchSize) > (seedEvals+searchBatchSize) &&
      shouldSwitchMap(eliteMap, mapSwitchingCondition) 
    ) {

      // reset map switching conditions in map and save it
      eliteMap.coverageWithoutIncreaseGenerations = 0;
      eliteMap.qdScoreWithoutIncreaseGenerations = 0;
      Environment.persistence.saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName );

      // randomly select next elite map index, which is not the current one
      const eliteMapCount = classificationGraphModel.classConfigurations ? classificationGraphModel.classConfigurations.length : 1;
      if( eliteMapCount > 1 ) {
        let nextEliteMapIndex;
        // do {
        //   nextEliteMapIndex = Math.floor(Math.random() * eliteMapCount);
        // } while( nextEliteMapIndex === eliteMapIndex );

        // if( nextEliteMapIndex === eliteMapIndex ) {
        //   console.error("nextEliteMapIndex === eliteMapIndex");
        // }

        nextEliteMapIndex = (eliteMapIndex + 1) % eliteMapCount;

        const currentMapGeneration = eliteMap.generationNumber - 1; // -1 as the generation number was incremented at the end of the last batch
        const currentMapId = eliteMap._id;

        eliteMapIndex = nextEliteMapIndex;

        eliteMapMeta.eliteMapIndex = eliteMapIndex;
        Environment.persistence.saveEliteMapMetaToDisk( eliteMapMeta, evoRunDirPath, evolutionRunId );


        // TODO: if the map being switched to as an associated configuration specifying a different feature extraction approach,
        // - eg. wav2vec vs a pair of low level features, then we need to populate --cellFeatures-- with the new features
        
        // - - we populate cellFeaturesFromCurrentAndNextEliteMaps, instead of cellFeatures, with features from both maps;
        // - - the one we are switching from and the one we are switching to, so elite features from both have an opportunity to influence the training of the projection, which happens in mapElitesBatch() ... if( shouldPopulateCellFeatures ) ... 

        // TODO: outdated?:
        // let's get the features and scores from the current map, before switching
        // - using nextElite's refSetEmbedsPath to get the quality / fitness according to that one, before projecting individuals to the new map

        // first get the genome ids from the current map ...
        const genomeIdsFromCurrentAndNextEliteMaps = new Set( Environment.persistence.getEliteGenomeIdsFromEliteMaps( eliteMap ) );

        classConfiguration = classificationGraphModel.classConfigurations[eliteMapIndex];


        // TODO update novelty archive according to new classConfiguration


        // TODO: can populateAndSaveCellFeatures be of use here? ... call with a parameter specifying the projection to use
        // const { 
        //   featureExtractionEndpoint, 
        // } = getWsServiceEndpointsFromClassConfiguration( classConfiguration );
        // await populateAndSaveCellFeatures( 
        //   eliteMap, cellFeatures, 
        //   classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
        //   _geneRenderingServers, renderSampleRateForClassifier,
        //   _evaluationFeatureServers,
        //   evoRunDirPath, evolutionRunId,
        //   ckptDir,
        //   featureExtractionEndpoint, classConfiguration.featureExtractionType
        // );


        // TODO should we get the features (and scores) from all maps, 
        // - or the current one and the one we are switching to? 
        // - or just the one we are switching from?
        // - - the coverage can at least go sharply down when projection features from the current map to the new one
        // - - - potentially triggering an immediate switch back to the previous map

        // For now, 
        
        const refSetEmbedsPath = classConfiguration.refSetEmbedsPath;
        const refSetName = classConfiguration.refSetName;
        // seedFeaturesAndScores = await getFeaturesAndScoresFromEliteMap( 
        //   eliteMap, cellFeatures,
        //   _evaluationQualityServers, classConfiguration, // classConfiguration dictates the feature extraction approach
        //   evolutionRunId, evoRunDirPath,
        //   scoreProportion,
        //   ckptDir, measureCollectivePerformance,
        //   refSetEmbedsPath, refSetName
        // );

        // eliteMap = eliteMapContainer[eliteMapIndex];
        terrainName = classConfiguration.refSetName;
        sampleRate = classConfiguration.sampleRate;
        eliteMap = Environment.persistence.readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName );

        // ... then add the genome ids from the next map
        Environment.persistence.getEliteGenomeIdsFromEliteMaps( eliteMap ).forEach( genomeId => {
          genomeIdsFromCurrentAndNextEliteMaps.add(genomeId);
        });

        const cellFeaturesFromCurrentAndNextEliteMaps = Environment.persistence.readFeaturesForGenomeIdsFromDisk( 
          evoRunDirPath, evolutionRunId, genomeIdsFromCurrentAndNextEliteMaps 
        );

        seedFeaturesAndScores = await getFeaturesAndScoresForGenomeIds(
          cellFeaturesFromCurrentAndNextEliteMaps,
          _evaluationQualityServers, classConfiguration,
          evolutionRunId, evoRunDirPath,
          scoreProportion,
          ckptDir, measureCollectivePerformance,
          refSetEmbedsPath, refSetName,
          useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
          _geneRenderingServers[0], 
          _evaluationFeatureServers[0], classConfiguration.featureExtractionEndpoint,
          sampleRate,
          // TODO?
          undefined, //zScoreNormalisationReferenceFeaturesPaths, 
          undefined, // zScoreNormalisationTrainFeaturesPath,
          undefined, // dynamicComponents,
          undefined //featureIndices
        );

        // TODO: is this necessary?
        // cellFeatures = readCellFeaturesFromDiskForEliteMap( evoRunDirPath, evolutionRunId, eliteMap );
        
        // eliteMap.generationNumber++; // increment the generation number, as the increment at the end of last batch iteration happened after last save
        eliteMap.mapSwitchLog.push({
          previousMapGeneration: currentMapGeneration,
          previousMapId: currentMapId,
          nextMapGeneration: eliteMap.generationNumber,
          nextMapId: eliteMap._id
        });
        eliteMap.isBeingSwitchedToFromAnotherMap = true;

        cellFeatures = {}; // clear cell features, as we are switching to a new map
        
      } else {
        console.log("only one map, not switching");
      }
    } else if( 
      eliteMap.isBeingSwitchedToFromAnotherMap 
      ||
      eliteMap.shouldFit
    ) {
      const classConfiguration = classificationGraphModel.classConfigurations[eliteMapIndex];
      const refSetEmbedsPath = classConfiguration.refSetEmbedsPath;
      const refSetName = classConfiguration.refSetName;
      seedFeaturesAndScores = await getFeaturesAndScoresFromEliteMap( 
        eliteMap, cellFeatures,
        _evaluationQualityServers, classConfiguration,
        evolutionRunId, evoRunDirPath,
        scoreProportion,
        ckptDir, measureCollectivePerformance,
        refSetEmbedsPath, refSetName,
        useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
        _geneRenderingServers[0], 
        _evaluationFeatureServers[0],
        classConfiguration.featureExtractionEndpoint,
        sampleRate,
        // TODO?:
        undefined, // zScoreNormalisationReferenceFeaturesPaths, 
        undefined, // zScoreNormalisationTrainFeaturesPath,
        undefined, // dynamicComponents,
        undefined //featureIndices
      );
    }

    const batchStartTimeMs = performance.now();

    console.log("algorithmKey",algorithmKey);
    if( algorithmKey === "mapElites_with_uBC" ) {
      await mapElitesBatch(
        eliteMap, eliteMapMeta, cellFeatures, seedFeaturesAndScores, terrainName, zScoreNormalisationTrainFeaturesPathObj,
        noveltyArchive,
        algorithmKey, evolutionRunId,
        commitEliteMapToGitEveryNIterations, addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
        renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
        searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
        maxNumberOfParents,
        auroraModeConfig,
        probabilityMutatingWaveNetwork, probabilityMutatingPatch, oneCPPNPerFrequency,
        audioGraphMutationParams, evolutionaryHyperparameters,
        classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
        classScoringVariationsAsContainerDimensions,
        classificationGraphModel, yamnetModelUrl, ckptDir, measureCollectivePerformance,
        sampleRate,
        geneEvaluationProtocol,
        _geneVariationServers, _geneRenderingServers, _geneEvaluationServers,
        _evaluationFeatureServers, _evaluationQualityServers, _evaluationProjectionServers,
        useGpuForTensorflow,
        antiAliasing,
        frequencyUpdatesApplyToAllPathcNetworkOutputs,
        evoRunDirPath, evoRunFailedGenesDirPath, evoRenderDirPath,
        evaluationCandidateWavFilesDirPath, classifiers,
        patchFitnessTestDuration,
        scoreProportion,
        dummyRun
      );
    }
    /* TODO: not in use for now (see file quality-diversity-search_deep-grid.js)
    else if( algorithmKey === "Deep-Grid-MAP-Elites" ) {
      await deepGridMapElitesBatch(
        eliteMap, algorithmKey, evolutionRunId,
        populationSize, gridDepth,
        probabilityMutatingWaveNetwork, probabilityMutatingPatch,
        audioGraphMutationParams, evolutionaryHyperparameters,
        classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
        classificationGraphModel,
        _geneVariationServers, _geneEvaluationServers,
        useGpuForTensorflow,
        evoRunDirPath, evoRunFailedGenesDirPath,
        patchFitnessTestDuration
      );
    }
    */
    else {
      throw new Error(`algorithmKey ${algorithmKey} not recognised`);
    }

    const batchEndTimeMs = performance.now();
    const batchDurationMs = batchEndTimeMs - batchStartTimeMs;
    console.log("batchDurationMs", batchDurationMs, terminationCondition.numberOfEvals ? `, % completed: ${(eliteMap.generationNumber*searchBatchSize)/terminationCondition.numberOfEvals*100}` : "");
    eliteMap.batchDurationMs = batchDurationMs;
    if( processingUtilisation ) {
      console.log("waiting for", processingUtilisation * batchDurationMs, "ms, to utilise", processingUtilisation, "of the available processing time");
      await new Promise( resolve => setTimeout(resolve, processingUtilisation * batchDurationMs) );
    }

    if( (eliteMap.generationNumber*searchBatchSize) > (seedEvals+searchBatchSize) && seedFeaturesAndScores !== undefined ) {
      seedFeaturesAndScores = undefined; // free up memory
    }

    if( eliteMap.isBeingSwitchedToFromAnotherMap ) eliteMap.isBeingSwitchedToFromAnotherMap = false;

    if( eliteMap.generationNumber % 100 === 0 ) {
      if (global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // changes to eliteMapMeta which should have been passed down by reference, don't propagate up here for some reason, so we'll read those changes from disk:
    eliteMapMeta = Environment.persistence.readEliteMapMetaFromDisk( evolutionRunId, evoRunDirPath );


    if (collectMetrics) {
      if (eliteMap.qdScoreWithoutIncreaseCount > maxQDScoreWithoutIncrease)
        maxQDScoreWithoutIncrease = eliteMap.qdScoreWithoutIncreaseCount;
      
      if (eliteMap.coverageWithoutIncreaseCount > maxCoverageWithoutIncrease)
        maxCoverageWithoutIncrease = eliteMap.coverageWithoutIncreaseCount;
    }


  } // while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
  if( ! (batchDurationMs && batchDurationMs < Date.now() - startTimeMs) ) {
    // process not stopped due to time limit, but should now have reached a general termination condition
    eliteMap.terminated = true;
    Environment.persistence.saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName );
    console.log("eliteMap",eliteMap);
    // collect git garbage - UPDATE: this should be run separately, as part of one of the qd-run-analysis routines:
    // runCmdAsync(`git -C ${evoRunDirPath} gc`);
  }

  if (collectMetrics) {
    return {
      generationsReached: eliteMap.generationNumber,
      finalQDScore: eliteMap.qdScore,
      finalCoverage: eliteMap.coverage,
      maxQDScoreWithoutIncrease,
      maxCoverageWithoutIncrease
    };
  }

  // if( exitWhenDone ) process.exit();
}

async function mapElitesBatch(
  eliteMap, eliteMapMeta, cellFeatures, seedFeaturesAndScores, terrainName, zScoreNormalisationTrainFeaturesPathObj,
  noveltyArchive,
  algorithmKey, evolutionRunId,
  commitEliteMapToGitEveryNIterations, addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
  renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
  searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
  maxNumberOfParents,
  auroraModeConfig,
  probabilityMutatingWaveNetwork, probabilityMutatingPatch, oneCPPNPerFrequency,
  audioGraphMutationParams, evolutionaryHyperparameters,
  classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
  classScoringVariationsAsContainerDimensions,
  classificationGraphModel, yamnetModelUrl, ckptDir, measureCollectivePerformance,
  renderSampleRateForClassifier,
  geneEvaluationProtocol,
  _geneVariationServers, _geneRenderingServers, _geneEvaluationServers,
  _evaluationFeatureServers, _evaluationQualityServers, _evaluationProjectionServers,
  useGpuForTensorflow,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  evoRunDirPath, evoRunFailedGenesDirPath, evoRenderDirPath,
  evaluationCandidateWavFilesDirPath, classifiers,
  patchFitnessTestDuration,
  scoreProportion,
  dummyRun
) {
  const eliteMapIndex = eliteMapMeta.eliteMapIndex;
  const zScoreNormalisationTrainFeaturesPath = zScoreNormalisationTrainFeaturesPathObj["zScoreNormalisationTrainFeaturesPath"];

  const useExtinctionEvents = auroraModeConfig?.useExtinctionEvents || false;
  const extinctionPeriod = auroraModeConfig?.extinctionPeriod || 50;
  const extinctionProportion = auroraModeConfig?.extinctionProportion || 0.05;

  let searchPromises;
  const isUnsupervisedDiversityEvaluation = (_evaluationFeatureServers && _evaluationFeatureServers.length > 0) &&
    (_evaluationProjectionServers && _evaluationProjectionServers.length > 0) &&
    (_evaluationQualityServers && _evaluationQualityServers.length > 0);

  const isSeedRound = (eliteMap.generationNumber*searchBatchSize) < seedEvals 
    && ! eliteMapIndex > 0; // only seed the first map
  
  //( ! isSeedRound && isUnsupervisedDiversityEvaluation && Object.keys(cellFeatures).length === 0 )
  const isNotSeedRoundDuringUnsupervisedDiversityEvaluationAndCellFeaturesEmpty = ! isSeedRound && isUnsupervisedDiversityEvaluation && Object.keys(cellFeatures).length === 0;
  const isBeingSwitchedToFromAnotherMap = eliteMap.isBeingSwitchedToFromAnotherMap === true;
  const eliteMapShouldFit = eliteMap.shouldFit === true;
  const cellFeaturesPopulationConditionmet = isBeingSwitchedToFromAnotherMap || eliteMapShouldFit || isNotSeedRoundDuringUnsupervisedDiversityEvaluationAndCellFeaturesEmpty;
  const shouldPopulateCellFeatures = cellFeaturesPopulationConditionmet && seedFeaturesAndScores && seedFeaturesAndScores.length > 0;

  const classConfiguration = classificationGraphModel.classConfigurations && classificationGraphModel.classConfigurations.length ? classificationGraphModel.classConfigurations[eliteMapIndex] : undefined;
  const { 
    // featureExtractionEndpoint, 
    // qualityEvaluationEndpoint, 
    // projectionEndpoint,
    zScoreNormalisationReferenceFeaturesPaths,
    shouldRetrainProjection,
    projectionRetrainingLinearGapIncrement,
    shouldCalculateNovelty, // TODO: currently not using this, as we let the diversity tracker handle that calculation: if shouldTrackDiversity
    shouldCalculateSurprise, shouldUseAutoEncoderForSurprise,
    shouldTrackDiversity,
    inspirationRate, // in case of a novelty archive
    mapSelectorBias,
    eliteRemappingCompetitionCriteria,
    retrainWithAllDiscoveredFeatures,
    dynamicComponents,
  } = getWsServiceEndpointsFromClassConfiguration( classConfiguration );
  let featureIndices;
  if( dynamicComponents ) {
    featureIndices = getFeatureIndicesFromEliteMapMeta( eliteMapMeta );
  }

  if( shouldPopulateCellFeatures ) {
    // seed rounds are over, we're doing unsupervised diversity evaluation, but we haven't yet projected the features:
    // - so far they have been collected: let's project the whole collection
    searchPromises = new Array( seedFeaturesAndScores.length );
    const seedFeatureClassKeys = await getClassKeysFromSeedFeatures( // this call trains the projection
      seedFeaturesAndScores, _evaluationProjectionServers[0], evoRunDirPath, evolutionRunId, classScoringVariationsAsContainerDimensions, 
      eliteMap, eliteMapMeta, dynamicComponents, featureIndices,
      auroraModeConfig
    );
    // eliteMapMeta was changed by getClassKeysFromSeedFeatures and persisted to disk, so let's reload it
    eliteMapMeta = Environment.persistence.readEliteMapMetaFromDisk( evolutionRunId, evoRunDirPath );
    if( dynamicComponents ) {
      featureIndices = getFeatureIndicesFromEliteMapMeta( eliteMapMeta );
    }
    for( let i=0; i < seedFeaturesAndScores.length; i++ ) {
      searchPromises[i] = new Promise( async (resolve, reject) => {
        const seedFeatureAndScore = seedFeaturesAndScores[i];
        const { 
          genomeId, genomeString,
          fitness, duration, noteDelta, velocity
        } = seedFeatureAndScore;
        let score;
        let scoreClass;
        if( getIsTopScoreFitnessWithAssociatedClass(fitness) ) {
          score = fitness.top_score;
          scoreClass = fitness.top_score_class;
          const seedFeatureClassKeyParts = seedFeatureClassKeys[i].split("-");
          seedFeatureClassKeyParts[0] = seedFeatureClassKeyParts[0] + `_${fitness.top_score_class}`;
          seedFeatureClassKeys[i] = seedFeatureClassKeyParts.join("-");
        } else {
          score = fitness;
        }
        const classKey = seedFeatureClassKeys[i];
        if( ! seedFeatureAndScore.featuresType ) {
          console.error("seedFeatureAndScore.featuresType not defined");
        }
        const newGenomeClassScores = { [classKey]: {
          score, scoreClass,
          duration, noteDelta, velocity,
          features: seedFeatureAndScore.features, featuresType: seedFeatureAndScore.featuresType,
          embedding: seedFeatureAndScore.embedding
        } };
        resolve({
          genomeId, 
          randomClassKey: classKey,
          newGenomeString: genomeString,
          newGenomeClassScores,
          parentGenomes: []
        });
      });
    }
    // getClassKeysFromSeedFeatures trains the projection: let's set the projection fit index according to the number of seed features, from the current generation number
    if( isSeedRound ) {
      eliteMap.lastProjectionFitIndex = getNextFitGenerationIndex( 
        (eliteMap.generationNumber*searchBatchSize) + seedFeaturesAndScores.length,
        projectionRetrainingLinearGapIncrement
      );
    }
  } else {

    searchPromises = new Array(searchBatchSize);

    if( isUnsupervisedDiversityEvaluation && _evaluationFeatureServers && _evaluationFeatureServers.length ) {
      await populateAndSaveCellFeatures( 
        eliteMap, cellFeatures, 
        classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
        _geneRenderingServers, renderSampleRateForClassifier,
        _evaluationFeatureServers,
        evoRunDirPath, evolutionRunId,
        ckptDir,
        // featureExtractionEndpoint, classConfiguration.featureExtractionType
        classConfiguration
      );
    }



    // Handle extinction events if enabled
    if (useExtinctionEvents && extinctionPeriod && 
      eliteMap.generationNumber > 0 && 
      eliteMap.generationNumber % extinctionPeriod === 0
    ) {
      console.log(`Extinction event at generation ${eliteMap.generationNumber}`);
      
      // Find the highest fitness individual for elitism
      let highestFitnessGenomeId = null;
      let highestFitness = -Infinity;
      let highestFitnessClass = null;
      
      for (const cellKey in eliteMap.cells) {
        if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
          const elite = eliteMap.cells[cellKey].elts[0];
          if (elite.s > highestFitness) {
            highestFitness = elite.s;
            highestFitnessGenomeId = elite.g;
            highestFitnessClass = cellKey;
          }
        }
      }
      
      // Get populated cells
      const populatedCells = Object.keys(eliteMap.cells).filter(key => 
        eliteMap.cells[key].elts && eliteMap.cells[key].elts.length > 0
      );

      const populatedCellCount = populatedCells.length;
  
      // Skip extinction if population is already small
      const MINIMUM_POPULATION = 10; // Adjust as needed
      if (populatedCellCount <= MINIMUM_POPULATION) {
        console.log(`Skipping extinction event: population (${populatedCellCount}) already below minimum threshold`);
      } else {
        // Proceed with extinction but ensure we preserve at least MINIMUM_POPULATION individuals
        const cellsToPreserveCount = Math.max(
          MINIMUM_POPULATION,
          Math.floor(populatedCells.length * extinctionProportion)
        );
        
        // Randomly select cells to preserve
        const cellsToKeep = new Set();
        
        // Always keep the elite
        if (highestFitnessClass) {
          cellsToKeep.add(highestFitnessClass);
        }
        
        // Randomly select the rest
        const remainingCellsToPreserve = cellsToPreserveCount - cellsToKeep.size;
        if (remainingCellsToPreserve > 0) {
          const eligibleCells = populatedCells.filter(cell => !cellsToKeep.has(cell));
          const randomCellsToKeep = chance.pickset(eligibleCells, remainingCellsToPreserve);
          randomCellsToKeep.forEach(cell => cellsToKeep.add(cell));
        }
        
        // Clear all cells except those to keep
        console.log(`Preserving ${cellsToKeep.size} cells out of ${populatedCells.length} populated cells`);
        for (const cellKey in eliteMap.cells) {
          if (!cellsToKeep.has(cellKey)) {
            eliteMap.cells[cellKey].elts = [];
            delete cellFeatures[cellKey];
          }
        }
        
        // Record extinction event in eliteMap
        eliteMap.extinctionEvents = eliteMap.extinctionEvents || [];
        eliteMap.extinctionEvents.push({
          generation: eliteMap.generationNumber,
          preservedCellCount: cellsToKeep.size,
          totalPopulatedCells: populatedCells.length
        });
      }
    }



    for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

      console.log("batchIteration", batchIteration);
      let geneVariationServerHost;
      let geneRenderingServerHost;
      let geneEvaluationServerHost;
      let featureExtractionHost;
      if( dummyRun ) {
        geneVariationServerHost = _geneVariationServers[0];
        geneRenderingServerHost = _geneRenderingServers[0];
        geneEvaluationServerHost = _geneEvaluationServers[0];
      } else {
        geneVariationServerHost = _geneVariationServers[ batchIteration % _geneVariationServers.length ];
        geneRenderingServerHost = _geneRenderingServers[ batchIteration % _geneRenderingServers.length ];
        if( _geneEvaluationServers && _geneEvaluationServers.length ) {
          // we're using a pre-trained classification for the diversity projection and quality evaluation
          geneEvaluationServerHost = _geneEvaluationServers[ batchIteration % _geneEvaluationServers.length ];
          // TODO: the following server configuration was initially only intended for unsupervised measurement definitions, 
          // but when using a vector database (hnsw) for classification, we do need to extract features, so bit of inconsistency / reduncancy here:
          if( _evaluationFeatureServers && _evaluationFeatureServers.length ) {
            featureExtractionHost = _evaluationFeatureServers[ batchIteration % _evaluationFeatureServers.length ];
          }
        } else if( isUnsupervisedDiversityEvaluation ) {
          // using feature extraction and dimensionality reduction for diversity projection and a separate quality evaluation service
          geneEvaluationServerHost = {
            feature: _evaluationFeatureServers[ batchIteration % _evaluationFeatureServers.length ], // + featureExtractionEndpoint,
            projection: _evaluationProjectionServers[ batchIteration % _evaluationProjectionServers.length ], // + projectionEndpoint,
            quality: _evaluationQualityServers[ batchIteration % _evaluationQualityServers.length ], // + qualityEvaluationEndpoint
          };
        }
      }

      searchPromises[batchIteration] = new Promise( async (resolve, reject) => {
  
        let randomClassKey;
        let parentGenomes = [];
  
        ///// gene initialisation
  
        let newGenomeString;
        if( isSeedRound ) {
  
          if( geneEvaluationProtocol === "grpc" || geneEvaluationProtocol === "websocket" ) {
            try {
              newGenomeString = await Environment.variation.callRandomGeneService(
                evolutionRunId, eliteMap.generationNumber, 
                evolutionaryHyperparameters,
                geneVariationServerHost,
                oneCPPNPerFrequency
              );
            } catch (error) {
              console.error("Error calling gene seed service: " + error);
              clearServiceConnectionList(geneVariationServerHost);
            }
          } else if( geneEvaluationProtocol === "worker" ) {
             const randomGeneWorkerResponse = await callRandomGeneWorker(
              searchBatchSize, batchIteration,
              evolutionRunId, eliteMap.generationNumber, evolutionaryHyperparameters
            );
            newGenomeString = randomGeneWorkerResponse.genomeString;
          }
  
        } else {
          ///// selection
          const classEliteGenomeStrings = [];
          if( noveltyArchive && Math.random() < inspirationRate && noveltyArchive.archive.length > 0 ) {
            // get individual from the novelty archive
            const dimensionalityReductionModel = new DimensionalityReductionModel(
              geneEvaluationServerHost.projection + classConfiguration.projectionEndpoint,
              evoRunDirPath,
              false, //shouldFit,
              classConfiguration.pcaComponents,
              shouldCalculateSurprise,
              shouldUseAutoEncoderForSurprise
            );
            const archiveIndividual = await noveltyArchive.getInspiration(eliteMap, dimensionalityReductionModel);
            const {
              g,
              s,
              gN
            } = archiveIndividual;
            const classKey = noveltyArchive.getCellKey( archiveIndividual.behaviorDescriptor );
            classEliteGenomeStrings.push( await Environment.persistence.readGenomeAndMetaFromDisk( evolutionRunId, g, evoRunDirPath ) );
            parentGenomes.push( {
              genomeId: g,
              eliteClass: classKey,
              // score, generationNumber,
              s, gN,
            } );

          } else {
            // select from the elite map

            let classKeys;
            if( classRestriction && classRestriction.length ) {
              console.log("classRestriction:", classRestriction);
              classKeys = classRestriction;
            } else 
              // if( eliteWinsOnlyOneCell || isUnsupervisedDiversityEvaluation ) 
            {
              // select only cell keys where the elts attribute referes to a non-empty array
              classKeys = Object.keys(eliteMap.cells).filter( ck => eliteMap.cells[ck].elts.length > 0 );
            } 
            // else {
            //   classKeys = Object.keys(eliteMap.cells);
            // }
            let classBiases;
            if( mapSelectorBias === MAP_SELECTOR_BIAS.UNIFORM ) {
              classBiases = classKeys.map( ck => 1 );
            } else if( mapSelectorBias === MAP_SELECTOR_BIAS.PRODUCTIVITY || ! mapSelectorBias /* for compatibility with older configurations */ ) {
              classBiases = classKeys.map( ck => /* "==" checking for either undefined or null */
                null == eliteMap.cells[ck].uBC ? 10 : eliteMap.cells[ck].uBC
              );
            } else if( mapSelectorBias === MAP_SELECTOR_BIAS.NOVELTY ) {
              classBiases = classKeys.map( ck => 
                null == eliteMap.cells[ck].elts[0].ns ? 0 : eliteMap.cells[ck].elts[0].ns
              );
            } else if( mapSelectorBias === MAP_SELECTOR_BIAS.SURPRISE ) {
              classBiases = classKeys.map( ck => 
                null == eliteMap.cells[ck].elts[0].ss ? 0 : eliteMap.cells[ck].elts[0].ss
              );
            }
            
            const nonzeroClassBiasCount = classBiases.filter(b => b > 0).length;
            
            let numberOfParentGenomes = Math.floor(Math.random() * (maxNumberOfParents - 1 +1)) + 1; // https://stackoverflow.com/a/1527820/169858
            console.log("numberOfParentGenomes", numberOfParentGenomes);
            const randomClassKeys = [];
            // TODO: match diverse parents together, rather than just picking randomly
            // - maybe by picking most distant elites in an unsupervised feature space
            // - possibly something like this: https://dl.acm.org/doi/10.1145/3449726.3459431
            for( let i=0; i < numberOfParentGenomes; i++ ) {
              if( nonzeroClassBiasCount > 0 ) {
                try {
                  randomClassKey = chance.weighted(classKeys, classBiases);
                } catch (error) {
                  console.error("Error in weighted selection: " + error);
                  throw error;
                }
              } else { // if all are zero or below, .weighted complains
                randomClassKey = chance.pickone(classKeys);
              }
              randomClassKeys.push(randomClassKey);
            }
  
            for( const randomClassKey of randomClassKeys ) {
              const {
                // genome: classEliteGenomeId,
                // score,
                // generationNumber
                g: classEliteGenomeId,
                s,
                gN
              } = getCurrentClassElite(randomClassKey, eliteMap);
              classEliteGenomeStrings.push( await Environment.persistence.readGenomeAndMetaFromDisk( evolutionRunId, classEliteGenomeId, evoRunDirPath ) );
              parentGenomes.push( {
                genomeId: classEliteGenomeId,
                eliteClass: randomClassKey,
                // score, generationNumber,
                s, gN,
              } );
            }

          } // end - // select from the elite map

          if( dummyRun ) {
            newGenomeString = classEliteGenomeStrings[0];
          } else {

          try {
            ///// variation
            if( geneEvaluationProtocol === "grpc" || geneEvaluationProtocol === "websocket" ) {
              try {
                newGenomeString = await Environment.variation.callGeneVariationService(
                  classEliteGenomeStrings,
                  evolutionRunId, eliteMap.generationNumber, algorithmKey,
                  probabilityMutatingWaveNetwork,
                  probabilityMutatingPatch,
                  audioGraphMutationParams,
                  evolutionaryHyperparameters,
                  patchFitnessTestDuration,
                  geneVariationServerHost,
                  useGpuForTensorflow
                );
              } catch (e) {
                console.error("Error from callGeneVariationService, at:", geneVariationServerHost, e);
                clearServiceConnectionList(geneVariationServerHost);
                reject(e);
              }
              if( ! newGenomeString ) {
                console.error("newGenomeString is undefined");
              }
            } else if( geneEvaluationProtocol === "worker" ) {
                const geneVariationWorkerResponse = await callGeneVariationWorker(
                searchBatchSize, batchIteration,
                classEliteGenomeStrings,
                evolutionRunId, eliteMap.generationNumber, algorithmKey,
                probabilityMutatingWaveNetwork,
                probabilityMutatingPatch,
                audioGraphMutationParams,
                evolutionaryHyperparameters,
                patchFitnessTestDuration
              );
              newGenomeString = geneVariationWorkerResponse.newGenomeString;
            }
            else {
              const classEliteGenomes = await Promise.all( classEliteGenomeStrings.map( async classEliteGenomeString => await getGenomeFromGenomeString(classEliteGenomeString, evolutionaryHyperparameters) ) );
              const newGenome = getNewAudioSynthesisGenomeByMutation(
                classEliteGenomes,
                evolutionRunId, eliteMap.generationNumber, -1, algorithmKey,
                getAudioContext(),
                probabilityMutatingWaveNetwork,
                probabilityMutatingPatch,
                audioGraphMutationParams,
                evolutionaryHyperparameters,
                patchFitnessTestDuration
              );
              newGenomeString = JSON.stringify(newGenome);
            }
          } catch (error) {
            console.error("Error calling gene variation service: " + error);
            clearServiceConnectionList(geneVariationServerHost);
            reject(error);
          }
        }
      } // if( isSeedRound ) {  } else { 
  
        const genomeId = ulid();

        if( ! newGenomeString ) {
          console.error("newGenomeString is undefined");
        }
  
        let newGenomeClassScores;
        let evaluationCandidatesJsonFilePath;
        if( dummyRun && dummyRun.iterations ) {
          newGenomeClassScores = getDummyClassScoresForGenome( Object.keys(eliteMap.cells), eliteMap.generationNumber, dummyRun.iterations );
        } else if( newGenomeString ) {
  
          ///// evaluate
  
          // check if geneEvaluationServerHost is an object with feature, projection and quality properties
          // - if so, we're using feature extraction and dimensionality reduction for diversity projection and a separate quality evaluation service
          // - otherwise, we're using a pre-trained classification for the diversity projection and quality evaluation
          if( isUnsupervisedDiversityEvaluation ) {
            if( isSeedRound ) {
  
              // call getGenomeScoreAndFeatures and populate seedFeaturesAndScores
              // - then use seedFeaturesAndScores to populate cellFeatures later on
              for( const oneDuration of classScoringDurations ) {
                for( const oneNoteDelta of classScoringNoteDeltas ) {
                  for( const oneVelocity of classScoringVelocities ) {
                    const seedGenomeScoreAndFeatures = await getGenomeScoreAndFeatures(
                      genomeId,
                      newGenomeString,
                      oneDuration,
                      oneNoteDelta,
                      oneVelocity,
                      useGpuForTensorflow,
                      antiAliasing,
                      frequencyUpdatesApplyToAllPathcNetworkOutputs,
                      geneRenderingServerHost, renderSampleRateForClassifier,
                      geneEvaluationServerHost.feature,
                      geneEvaluationServerHost.quality,
                      scoreProportion,
                      eliteMap.classConfigurations, eliteMapIndex,
                      measureCollectivePerformance, ckptDir, evoRunDirPath,
                      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
                      dynamicComponents, featureIndices
                    );
                    seedFeaturesAndScores.push(seedGenomeScoreAndFeatures);
                  }
                  Environment.persistence.saveGenomeToDisk( await getGenomeFromGenomeString(newGenomeString), evolutionRunId, genomeId, evoRunDirPath, addGenomesToGit );
                }
              }
              resolve({
                genomeId, newGenomeString
              }); // really just used to increment eliteMap.genertionNumber in the Promise.all iterations below

            } else {

              const generationIncrement = eliteMap.generationNumber + batchIteration; // TODO: remove
              // const shouldFit = getShouldFit(eliteMap.lastProjectionFitIndex, generationIncrement);
              // TODO fitting in a batch iteration is not ideal, at least when waiting time me result in in a Promise timeout?
              const shouldFit = false; // TOODO: need to refactor getGenomeClassScoresByDiversityProjectionWithNewGenomes
              
              if( classScoringVariationsAsContainerDimensions ) {
                // newGenomeClassScores = {};
                newGenomeClassScores = [];
                let iterationIncrement = 0;
                for( const oneDuration of classScoringDurations ) {
                  for( const oneNoteDelta of classScoringNoteDeltas ) {
                    for( const oneVelocity of classScoringVelocities ) {
                      geneEvaluationServerHost = {
                        feature: _evaluationFeatureServers[ (batchIteration + iterationIncrement) % _evaluationFeatureServers.length ],
                        projection: _evaluationProjectionServers[ (batchIteration + iterationIncrement) % _evaluationProjectionServers.length ],
                        quality: _evaluationQualityServers[ (batchIteration + iterationIncrement) % _evaluationQualityServers.length ]
                      };
                      const oneClassKeySuffix = `-${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
                      const oneCombinationClassScores = await getGenomeClassScoresByDiversityProjectionWithNewGenomes(
                        [newGenomeString],
                        oneDuration,
                        oneNoteDelta,
                        oneVelocity,
                        useGpuForTensorflow,
                        antiAliasing,
                        frequencyUpdatesApplyToAllPathcNetworkOutputs,
                        geneRenderingServerHost, renderSampleRateForClassifier,
                        geneEvaluationServerHost.feature,
                        geneEvaluationServerHost.quality,
                        eliteMap, eliteMapIndex,
                        evolutionRunId, evoRunDirPath,
                        scoreProportion,
                        measureCollectivePerformance, ckptDir,
                        zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
                        dynamicComponents, featureIndices
                      ).catch( e => {
                        console.error("Error getting genome class scores by diversity projection with new genomes", e);
                        reject(e);
                      });
                      oneCombinationClassScores.oneClassKeySuffix = oneClassKeySuffix;
                      newGenomeClassScores.push( oneCombinationClassScores );
                      iterationIncrement++;
                    }
                  }
                }
              } else {
                newGenomeClassScores = [];
                newGenomeClassScores.push( 
                  await getGenomeClassScoresByDiversityProjectionWithNewGenomes(
                    [newGenomeString],
                    classScoringDurations,
                    classScoringNoteDeltas,
                    classScoringVelocities,
                    useGpuForTensorflow,
                    antiAliasing,
                    frequencyUpdatesApplyToAllPathcNetworkOutputs,
                    geneRenderingServerHost, renderSampleRateForClassifier,
                    geneEvaluationServerHost.feature,
                    geneEvaluationServerHost.quality,
                    eliteMap, eliteMapIndex,
                    evolutionRunId, evoRunDirPath,
                    scoreProportion,
                    measureCollectivePerformance, ckptDir,
                    zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
                    dynamicComponents, featureIndices
                  ).catch( e => {
                    console.error("Error getting genome class scores by diversity projection with new genomes", e);
                    reject(e);
                  })
                );
                if( ! newGenomeClassScores || Object.keys(newGenomeClassScores).length === 0 ) {
                  console.log("newGenomeClassScores is undefined");
                }
              }
            }
          } else if( geneEvaluationServerHost ) {
            // we're using a pre-trained classification for the diversity projection and quality evaluation
            // - so we'll render the genome to wav files for all combinations under consideration
            if( classScoringVariationsAsContainerDimensions ) {
              newGenomeClassScores = {};
              let iterationIncrement = 0;
              for( const oneDuration of classScoringDurations ) {
                for( const oneNoteDelta of classScoringNoteDeltas ) {
                  for( const oneVelocity of classScoringVelocities ) {
                    geneEvaluationServerHost = _geneEvaluationServers[ (batchIteration + iterationIncrement) % _geneEvaluationServers.length ];
                    // const oneClassRestriction = [`${oneDuration},${oneNoteDelta},${oneVelocity}`];
                    const oneClassKeySuffix = `-${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
                    const oneCombinationClassScores = await getGenomeClassScores(
                      newGenomeString,
                      [oneDuration],
                      [oneNoteDelta],
                      [oneVelocity],
                      useGpuForTensorflow,
                      antiAliasing,
                      frequencyUpdatesApplyToAllPathcNetworkOutputs,
                      classificationGraphModel,
                      yamnetModelUrl,
                      geneEvaluationProtocol,
                      geneRenderingServerHost, renderSampleRateForClassifier,
                      geneEvaluationServerHost, featureExtractionHost, ckptDir,
                      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
                      dynamicComponents, featureIndices
                    );
                    for( const oneClassKey in oneCombinationClassScores ) {
                      const oneClassScores = oneCombinationClassScores[oneClassKey];
                      const oneClassKeyWithSuffix = oneClassKey + oneClassKeySuffix;
                      newGenomeClassScores[ oneClassKeyWithSuffix ] = oneClassScores;
                    }
                    iterationIncrement++;
                  }
                }
              }
            } else {
              newGenomeClassScores = await getGenomeClassScores(
                newGenomeString,
                classScoringDurations,
                classScoringNoteDeltas,
                classScoringVelocities,
                useGpuForTensorflow,
                antiAliasing,
                classificationGraphModel,
                yamnetModelUrl,
                geneEvaluationProtocol,
                geneRenderingServerHost, renderSampleRateForClassifier,
                geneEvaluationServerHost, featureExtractionHost, ckptDir,
                zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
                dynamicComponents, featureIndices
              );
            }
          }
  
        }
        console.log( // welcome to the world of ternary operators 😅
          "Resolution for genome ID" + genomeId + ", class scores defined: " + (newGenomeClassScores!==undefined), 
          (geneEvaluationProtocol === "worker" ? ", thread #"+batchIteration : ", evaluation host: "+ typeof geneEvaluationServerHost === 'object' ? `feature:{geneEvaluationServerHost.feature}, projection:{geneEvaluationServerHost.projection}, quality:{geneEvaluationServerHost.quality}` : geneEvaluationServerHost), 
          classRestriction && classRestriction.length ? classRestriction[0]+" score:" : newGenomeClassScores && Object.keys(newGenomeClassScores).length ? /* one feature mapping for the new genome */ Object.keys(newGenomeClassScores)[0] : " - Music score:", 
          classRestriction && classRestriction.length ?
              newGenomeClassScores && newGenomeClassScores[ classRestriction[0] ] ? newGenomeClassScores[ classRestriction[0] ].score : "N/A"
            :
            newGenomeClassScores && newGenomeClassScores.length === 1 && newGenomeClassScores[0] !== undefined ? /* one feature mapping for the new genome */
              newGenomeClassScores[0].newGenomeFitnessValue
            :
            newGenomeClassScores && newGenomeClassScores["Music"] ? newGenomeClassScores["Music"].score : newGenomeClassScores && Object.keys(newGenomeClassScores)[0] && newGenomeClassScores[Object.keys(newGenomeClassScores)[0]] ? newGenomeClassScores[Object.keys(newGenomeClassScores)[0]].score : "N/A"
        );
  
        resolve({
          genomeId,
          randomClassKey,
          newGenomeString,
          newGenomeClassScores,
          evaluationCandidatesJsonFilePath, // TODO remove
          parentGenomes
        });
  
      }); // new Promise( async (resolve) => {
    } // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

  } // if( ! isSeedRound && isUnsupervisedDiversityEvaluation && ! Object.keys(cellFeatures).length && seedFeaturesAndScores.length ) { } else {


  let shouldRenderWaveFiles = false;
  let shouldIncreaseGenrationNumber = true;
  await Promise.all( searchPromises ).then( async (batchIterationResults) => {

    let batchIterationFeatures;
    let batchIterationFitnessValues;
    if( batchIterationResults && batchIterationResults.length ) {

      // take all features and fitness values from the batch iteration results obtained from getGenomeClassScoresByDiversityProjectionWithNewGenomes and project them

      shouldIncreaseGenrationNumber = true;

      if( 
        isUnsupervisedDiversityEvaluation 
        && ! isSeedRound // only after seed rounds
        && ! shouldPopulateCellFeatures // otherwise we have already projected the features
      ) {

        // remove newGenomeClassScores array elements from any batchIterationResults array element, where newGenomeClassScores does not have the property "features" set
        batchIterationResults = batchIterationResults.filter(r => 
          r.newGenomeClassScores && r.newGenomeClassScores.every(score => score.features)
        );

        batchIterationFeatures = batchIterationResults.flatMap( r => r.newGenomeClassScores.map( s => s.features ) );
        batchIterationFitnessValues = batchIterationResults.flatMap( r => r.newGenomeClassScores.map( s => s.newGenomeFitnessValue ) );

        const diversityProjections = await getDiverstyProjectionsFromFeatures(
          batchIterationFeatures,
          batchIterationFitnessValues,
          _evaluationProjectionServers[0],
          eliteMap,
          evoRunDirPath,
          evolutionRunId,
          shouldCalculateSurprise,
          shouldUseAutoEncoderForSurprise,
          dynamicComponents, featureIndices,
          auroraModeConfig
        );
        for( let i=0; i < batchIterationResults.length; i++ ) {
          let newGenomeClassScores = {}; // for compatibility with the API below
          for( let j=0; j < batchIterationResults[i].newGenomeClassScores.length; j++ ) {
            const k = i + j;
            // const { genomeId, newGenomeClassScores } = batchIterationResults[i];
            const { score, scoreClass, surprise } = diversityProjections[k];
            let {  diversityMapKey } = diversityProjections[k];
            if( batchIterationResults[i].newGenomeClassScores[j].oneClassKeySuffix ) diversityMapKey += batchIterationResults[i].newGenomeClassScores[j].oneClassKeySuffix; // when classScoringVariationsAsContainerDimensions
            let newGenomeClassScoresValue = batchIterationResults[i].newGenomeClassScores[j];
            newGenomeClassScoresValue.score = score;
            newGenomeClassScoresValue.scoreClass = scoreClass;
            newGenomeClassScoresValue.surprise = surprise;
            // massage newGenomeClassScores into something compatible with the API below
            newGenomeClassScores[diversityMapKey] = newGenomeClassScoresValue;
          }
          batchIterationResults[i].newGenomeClassScores = newGenomeClassScores;
        }
        
      }
    }

    // TODO if evaluationCandidateWavFiles, call getClassScoresForCandidateWavFiles
    // - using an array of classifiers, referencing different python commands to execute
    // - TODO: abandon this approach?
    /*
    if( evaluationCandidateWavFilesDirPath ) {
      // so we can assume that evaluationCandidateWavFileDirPaths are populated;
      // call external classification scripts to evaluate the wav files
      // and populate newGenomeClassScores


      // call to external scripts to evaluate the wav files (with this ridiculous function name :P)
      batchIterationResults = populateNewGenomeClassScoresInBatchIterationResultFromEvaluationCandidateWavFiles(
        batchIterationResults,
        classifiers,
        evaluationCandidateWavFilesDirPath
      );
    }
    */

    // use this to ensure we're only handling and saving one copy of the same genome
    // let genomeIdToGenome = {};
    let savedGenomeIds = {};

    let classToBatchEliteCandidates = {};
    let cellKeyToExistingEliteGenomeId = {};
    // let eliteCountAtGeneration = 0;
    for( let batchResultIdx = 0; batchResultIdx < batchIterationResults.length; batchResultIdx++ ) {

      const {
        genomeId, randomClassKey, newGenomeClassScores, parentGenomes
      } = batchIterationResults[batchResultIdx];
      let { newGenomeString } = batchIterationResults[batchResultIdx];
      if( ! newGenomeString ) {
        // when coming from a seed round, or population from getFeaturesAndScoresForGenomeIds, newGenomeString is undefined
        newGenomeString = Environment.persistence.readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath );
      }

      ///// add to archive

      // newGenomeClassScores !== undefined will be undefined during seed rounds
      if( newGenomeClassScores !== undefined && Object.keys(newGenomeClassScores).length ) {
        const getClassKeysWhereScoresAreEliteStartTime = performance.now();
        let eliteClassKeys;
        if( dummyRun && dummyRun.iterations ) {
          eliteClassKeys = getDummyClassKeysWhereScoresAreElite( Object.keys(eliteMap.cells), eliteMap.generationNumber, dummyRun.iterations );
        } else {
          eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap, eliteWinsOnlyOneCell, classRestriction );
          // eliteClassKeys = Object.keys(newGenomeClassScores);
        }

        // TODO temporary:
        // pick random 50 elements from eliteClassKeys
        // eliteClassKeys = chance.pickset(eliteClassKeys, 1);

        const getClassKeysWhereScoresAreEliteEndTime = performance.now();
        console.log("getClassKeysWhereScoresAreElite duration", getClassKeysWhereScoresAreEliteEndTime - getClassKeysWhereScoresAreEliteStartTime);
        if( eliteClassKeys.length > 0 ) {
          if( eliteClassKeys.length > 1 ) {
            console.log("eliteClassKeys", eliteClassKeys);
          }
          // const classScoresSD = getClassScoresStandardDeviation( newGenomeClassScores );
          // console.log("classScoresSD", classScoresSD);
          eliteMap.newEliteCount = eliteClassKeys.length;

          let newGenome = await getGenomeFromGenomeString( newGenomeString );

          if( ! newGenome.tags ) newGenome.tags = [];
          newGenome.parentGenomes = parentGenomes.length ? parentGenomes : undefined;
          newGenome.generationNumber = eliteMap.generationNumber;
          const eliteMapUpdateStartTime = performance.now();
          let eliteClassKeysIterIdx = 0;
          for( const classKey of eliteClassKeys ) {
            if( eliteMap.cells[classKey].elts === undefined ) {
              console.error("eliteMap.cells[classKey].elts is undefined");
            }
            cellKeyToExistingEliteGenomeId[classKey] = eliteMap.cells[classKey].elts.length ? eliteMap.cells[classKey].elts[0].g : undefined;
            const {score, scoreClass, surprise, duration, noteDelta, velocity} = newGenomeClassScores[classKey];
            const updated = Date.now();

            eliteMap.cells[classKey].elts = [{
              g: genomeId,
              s: score, // score: score.toFixed(4),
              sC: scoreClass,
              ss: surprise,
              // ns: novelty is populated during retraining
              gN: eliteMap.generationNumber, // generationNumber: eliteMap.generationNumber,
            }];

            newGenome.tags.push({
              tag: classKey,
              score, duration, noteDelta, velocity,
              updated,
              mapId: eliteMap._id,
              generationNumber: eliteMap.generationNumber,
            });

            eliteMap.cells[classKey].uBC = 10;

            eliteMap.cells[classKey].eltAddCnt = eliteMap.cells[classKey].eltAddCnt ? eliteMap.cells[classKey].eltAddCnt + 1 : 1;

            const { features, featuresType, embedding } = newGenomeClassScores[classKey];
            if( ! featuresType && isUnsupervisedDiversityEvaluation ) {
              console.error("featuresType is undefined");
            }
            if( ! cellFeatures[classKey] ) {
              cellFeatures[classKey] = {};
            }
            cellFeatures[classKey][featuresType] = { features, embedding };

            classToBatchEliteCandidates[classKey] = {
              genomeId,
              // genome: newGenome
            };
            // eliteCountAtGeneration++;

            if( renderElitesToWavFiles ) {
              const oneClassScore = newGenomeClassScores[eliteClassKeys[0]].score;
              await renderEliteGenomeToWavFile( // TODO: spawn a worker for this?
                newGenome, genomeId, classKey, eliteMap.generationNumber, oneClassScore, evoRenderDirPath,
                duration, noteDelta, velocity, useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs
              );
            }

            if( noveltyArchive && ! isSeedRound ) {
              const projectionHost = _evaluationProjectionServers[ eliteClassKeysIterIdx % _evaluationProjectionServers.length ]
              const dimensionalityReductionModel = new DimensionalityReductionModel(
                projectionHost + classConfiguration.projectionEndpoint,
                evoRunDirPath,
                false, //shouldFit,
                classConfiguration.pcaComponents,
                shouldCalculateSurprise,
                shouldUseAutoEncoderForSurprise
              );
              const individual = { // structure specialissed for the novelty archive
                g: genomeId,
                s: score,
                gN: eliteMap.generationNumber,
                features,
                behaviorDescriptor: noveltyArchive.getBehaviorDescriptorFromCellKey( classKey )
              };
              const didAddToArchive = await noveltyArchive.addIfNovel( 
                individual, eliteMap, dimensionalityReductionModel 
              );
              if( didAddToArchive ) {
                console.log("Added to archive, genomeId", genomeId, ", classKey", classKey, ", score", score, " - archive size: ", noveltyArchive.archive.length);
              }
              if( ! eliteMap.noveltyArchiveSizes ) eliteMap.noveltyArchiveSizes = {};
              eliteMap.noveltyArchiveSizes[eliteMap.generationNumber] = noveltyArchive.archive.length;
            }
            eliteClassKeysIterIdx++;
          }
          const eliteMapUpdateEndTime = performance.now();
          console.log("eliteMapUpdate duration", eliteMapUpdateEndTime - eliteMapUpdateStartTime);
          
          if( randomClassKey ) {
            eliteMap.cells[randomClassKey].uBC = 10;
          }
          if( ! savedGenomeIds[genomeId] ) {
            await Environment.persistence.saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath, addGenomesToGit );
            savedGenomeIds[genomeId] = true;
          }
          // if( renderElitesToWavFiles ) {
          //   const oneClassScore = newGenomeClassScores[eliteClassKeys[0]].score;
          //   // class keys string, maximum 100 characters
          //   const classKeysString = eliteClassKeys.join("__").substring(0, 100);
          //   renderEliteGenomeToWavFile(
          //     newGenome, genomeId, classKeysString, eliteMap.generationNumber, oneClassScore, evoRenderDirPath,
          //     classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs
          //   );
          // }
        } else if( randomClassKey && ! shouldPopulateCellFeatures /* defined way up there ^ 🤣 */ ) { // if( eliteClassKeys.length > 0 ) {

          // bias search away from exploring niches that produce fewer innovations
          if( eliteMap.cells[randomClassKey].uBC ) eliteMap.cells[randomClassKey].uBC -= 1; // TODO should stop at zero? ... it does now
        }

      } 

    } // for( let oneBatchIterationResult of batchIterationResults ) {

    savedGenomeIds = undefined; // attempt to free up memory

    let batchEliteIndex = 0;
    for( let oneNewEliteClass in classToBatchEliteCandidates ) {
      let { 
        // genome, 
        genomeId 
      } = classToBatchEliteCandidates[oneNewEliteClass];
      // add this genome's features to the quality query embeddings, if using classConfigurations, by calling /add-to-query-embeddings websocket endpoint
      if( eliteMap.classConfigurations && eliteMap.classConfigurations.length && eliteMap.classConfigurations[0].usingQueryEmbeddings/* e.g. FAD */ ) {
        const refSetName = eliteMap.classConfigurations[0].refSetName;
        const existingGenomeIdAtClass = cellKeyToExistingEliteGenomeId[oneNewEliteClass];
        const querySetEmbedsPath = getQuerySetEmbedsPath( evoRunDirPath, refSetName );
        const evaluationQualityHost = _evaluationQualityServers[ batchEliteIndex % _evaluationQualityServers.length ];
        const featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
        const embeddingToAdd = cellFeatures[oneNewEliteClass][featureExtractionType].embedding;
        Environment.evaluation.addToQualityQueryEmbeddigs(
          embeddingToAdd, // added to cellFeatures in the iteration above
          genomeId, existingGenomeIdAtClass,
          querySetEmbedsPath,
          evaluationQualityHost
        );
      }
      batchEliteIndex++;
    }
    eliteMap.eliteCountAtGeneration = Object.keys(classToBatchEliteCandidates).length;
    eliteMap.eliteCounts.push( eliteMap.eliteCountAtGeneration );
    classToBatchEliteCandidates = undefined; // attempt to free up memory

  }).catch( e => {
    console.error("Error in Promise.all searchPromises", e);
  }); // await Promise.all( searchPromises ).then( async (batchIterationResult) => {

  // clear all entries in searchPromises
  for( let i=0; i < searchPromises.length; i++ ) {
    searchPromises[i] = undefined;
  }
  searchPromises = undefined; // attempt to free up memory


  // let's save and commit the eliteMap

  eliteMap.coverageSize = Object.keys(cellFeatures).length;
  eliteMap.coveragePercentage = (eliteMap.coverageSize / Object.keys(eliteMap.cells).length) * 100;

  // coverageSize is dependent on cellFeatures being maintained - let's also do the calculation on the map:
  const coverage = getCoverageForEliteMap( eliteMap );
  if( coverage === eliteMap.coverage ) { // coverage hasn't increased (it should never decrease)
    eliteMap.coverageWithoutIncreaseCount++;
  }
  eliteMap.coverage = coverage;
  // and the qd score:
  const qdScore = calculateQDScoreForEliteMap( eliteMap );
  if( qdScore === eliteMap.qdScore ) { // qdScore hasn't increased (it should never decrease)
    eliteMap.qdScoreWithoutIncreaseCount++;
  }
  eliteMap.qdScore = qdScore;
  eliteMap.qdScores.push( qdScore );

  console.log(
    "generation", eliteMap.generationNumber,
    "eliteCountAtGeneration:", eliteMap.eliteCountAtGeneration,
    "coverageSize", eliteMap.coverageSize, "coveragePercentage", eliteMap.coveragePercentage, 
    "evo run ID:", evolutionRunId
  );

  const prunePastElitesStartTime = performance.now();
  if( prunePastEliteGenomesEveryNGenerations && eliteMap.generationNumber % prunePastEliteGenomesEveryNGenerations === 0 ) {
    deleteAllGenomesNotInEliteMap( eliteMap, evoRunDirPath );
    if( renderElitesToWavFiles ) {
      deleteAllGenomeRendersNotInEliteMap( eliteMap, evoRenderDirPath );
    }
  }
  const prunePastElitesEndTime = performance.now();
  console.log("prunePastElites duration", prunePastElitesEndTime - prunePastElitesStartTime);

  if( renderEliteMapToWavFilesEveryNGenerations && eliteMap.generationNumber % renderEliteMapToWavFilesEveryNGenerations === 0 ) {
    shouldRenderWaveFiles = true;
  }

  if( shouldIncreaseGenrationNumber ) {

    eliteMap.generationNumber++;

    if( 
      isUnsupervisedDiversityEvaluation && ! isSeedRound 
    ) {
      const populatedCellCount = Object.keys(eliteMap.cells).filter(key => 
        eliteMap.cells[key].elts && eliteMap.cells[key].elts.length > 0
      ).length;

      const shouldFit = shouldRetrainProjection 
        && getShouldFit(
          eliteMap.lastProjectionFitIndex, eliteMap.generationNumber*searchBatchSize,
          projectionRetrainingLinearGapIncrement,
          auroraModeConfig
        )
        && populatedCellCount >= 3 // for contrastive learning triplet loss
      if( shouldFit ) {
        // TODO: letting getClassKeysFromSeedFeatures handle the retraining
        const {generationFeaturesFilePath} = await retrainProjectionModel( 
          cellFeatures, eliteMap, evolutionRunId,
          _evaluationProjectionServers, evoRunDirPath, 
          classScoringVariationsAsContainerDimensions,
          shouldCalculateSurprise, shouldUseAutoEncoderForSurprise,
          shouldTrackDiversity,
          eliteRemappingCompetitionCriteria,
          noveltyArchive,
          retrainWithAllDiscoveredFeatures,
          dynamicComponents, featureIndices, eliteMapMeta,
          auroraModeConfig
        );
        zScoreNormalisationTrainFeaturesPathObj.zScoreNormalisationTrainFeaturesPath = generationFeaturesFilePath;
        // we've done the fitting, so we can set shouldFit to false
        // eliteMap.shouldFit = true;
      } else if( populatedCellCount < 3 ) {
        console.log("Not enough populated cells to retrain projection model");
      }
      if( shouldTrackDiversity === true && shouldRetrainProjection === false ) {
        trackDiversity( 
          eliteMap, cellFeatures, _evaluationProjectionServers[0], evoRunDirPath
        );
      }
    }
  
    const countNonEmptyCells = Object.values(eliteMap.cells).filter( cell => cell.elts.length > 0 ).length;
    eliteMap.coverages.push( countNonEmptyCells );
  
    if( shouldRenderWaveFiles ) {
      // TODO this seems to get stuck in a loop
      // await renderEliteMapToWavFiles(
      //   eliteMap, evolutionRunId, evoRunDirPath, evoRenderDirPath, eliteMap.generationNumber,
      //   classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
      //   _geneRenderingServers, renderSampleRateForClassifier
      // );
    }
  
    eliteMap.searchBatchSize = searchBatchSize;
    eliteMap.timestamp = Date.now();
  
    const saveEliteMapToDiskStartTime = performance.now();
    Environment.persistence.saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName ); // the main / latest map
    const saveEliteMapToDiskEndTime = performance.now();
    console.log("saveEliteMapToDisk duration", saveEliteMapToDiskEndTime - saveEliteMapToDiskStartTime);
  
    if( classConfiguration.useNoveltyArchive && ! isSeedRound ) {
      noveltyArchive.saveToFile(evoRunDirPath);
  
      if( eliteMap.generationNumber % 100/* TODO hardcoding for now */ === 0 ) {
        noveltyArchive.saveCheckpoint(evoRunDirPath, eliteMap.generationNumber);
      }
  
      // TODO fewer DimensionalityReductionModel instantiations?
      console.log("Updating projections and scores in novelty archive");
      const projectionHost = _evaluationProjectionServers[ 0 ];
      const dimensionalityReductionModel = new DimensionalityReductionModel(
        projectionHost + classConfiguration.projectionEndpoint,
        evoRunDirPath,
        false, //shouldFit,
        classConfiguration.pcaComponents,
        shouldCalculateSurprise,
        shouldUseAutoEncoderForSurprise
      );
      await noveltyArchive.updateProjectionsAndScores( eliteMap, dimensionalityReductionModel );
      console.log("Done updating projections and scores in novelty archive");
    }
  
    const commitEliteMapToGitStartTime = performance.now();
    if( commitEliteMapToGitEveryNIterations && eliteMap.generationNumber % commitEliteMapToGitEveryNIterations === 0 ) {
      // git commit iteration
      runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);
    }
    const commitEliteMapToGitEndTime = performance.now();
    console.log("commitEliteMapToGit duration", commitEliteMapToGitEndTime - commitEliteMapToGitStartTime);

  }

} // async function mapElitesBatch( ...



// render all elites in eliteMap to wav files
async function renderEliteMapToWavFiles( 
  eliteMap, evolutionRunId, evoRunDirPath, evoRenderDirPath, iteration,
  duration, noteDelta, velocity, useGPU, 
  antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHosts, renderSampleRateForClassifier 
) {
  const soundObjectsDirPath = path.join(evoRenderDirPath, iteration.toString() );
  let cellKeyIndex = 0;
  let audioBuffer;
  let genomeString;
  // let audioChannelData;
  let genomeAndMeta;
  const cellsKeysWithChampions = Object.keys(eliteMap.cells).filter( classKey => eliteMap.cells[classKey].elts && eliteMap.cells[classKey].elts.length );
  for( let classKey of cellsKeysWithChampions ) {
    let cell = eliteMap.cells[classKey];
  // for( let classKey of eliteMap.cells ) {
  //   const cell = eliteMap.cells[classKey];
  //   if( cell.elts && cell.elts.length ) {
      let eliteGenomeId = cell.elts[0].g;
      genomeString = await Environment.persistence.readGenomeAndMetaFromDisk( evolutionRunId, eliteGenomeId, evoRunDirPath );
      if( ! genomeString ) {
        console.error("genomeString is undefined for elite genome", eliteGenomeId);
        continue;
      }
      genomeAndMeta = JSON.parse( genomeString );
      
      // let renderingServer = geneRenderingServerHosts[cellKeyIndex % geneRenderingServerHosts.length];
      // audioChannelData = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
      //   genomeString,
      //   duration,
      //   noteDelta,
      //   velocity,
      //   useGPU,
      //   antiAliasing,
      //   frequencyUpdatesApplyToAllPathcNetworkOutputs,
      //   renderingServer, renderSampleRateForClassifier
      // );
      // // create aduioBuffer from the Float32Array in audioChannelData
      // // let audioContext = getAudioContext(renderSampleRateForClassifier);
      // audioBuffer = getAudioContext(renderSampleRateForClassifier).createBuffer(1, audioChannelData.length, renderSampleRateForClassifier);
      // audioBuffer.copyToChannel(audioChannelData, 0);

      audioBuffer = await getAudioBufferFromGenomeAndMeta(
        genomeAndMeta,
        duration, noteDelta, velocity, 
        false, // reverse,
        false, // asDataArray
        getNewOfflineAudioContext( duration ),
        getAudioContext(),
        true, // useOvertoneInharmonicityFactors
        useGPU // useGPU
      );
      
      if( !fs.existsSync(soundObjectsDirPath) ) fs.mkdirSync(soundObjectsDirPath, {recursive: true});
      // replace commas in classKey with underscores (AudioStellar doesn't like commas in file names)
      let classKeySansCommas = classKey.replace(/,/g, "_");
      let filePath = path.join(soundObjectsDirPath, `${classKeySansCommas}_${eliteGenomeId}.wav`);

      console.log("writing wav file to", filePath, "for elite genome", eliteGenomeId
      // , "from rendering server at", renderingServer
      );

      let wav = toWav(audioBuffer);
      let wavBuffer = Buffer.from(new Uint8Array(wav));
      fs.writeFileSync( filePath, wavBuffer );
      cellKeyIndex++;

      audioBuffer = undefined;
      genomeString = undefined;
      // genomeAndMeta = undefined;
      // audioChannelData = undefined;
      // this seems to prevent a memory leak! - also using "let" above instead of "const", in case that matters?
      if( cellKeyIndex % 100 === 0 ) await new Promise(resolve => setTimeout(resolve, 100));
  //   }
  // }
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function renderEliteGenomeToWavFile(
  genome, eliteGenomeId, classKey, iteration, score, evoRenderDirPath,
  duration, noteDelta, velocity, useGPU,
  antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs
) {

  // TODO look into renderLineageTree() in kromosynth.js and it's use of async.queue

  let offlineAudioContext = getNewOfflineAudioContext( duration );
  const audioBuffer = await getAudioBufferFromGenomeAndMeta(
    {genome: genome, meta: {duration, noteDelta, velocity}},
    duration, noteDelta, velocity, 
    false, // reverse,
    false, // asDataArray
    offlineAudioContext,
    getAudioContext(),
    true, // useOvertoneInharmonicityFactors
    useGPU, // useGPU
    antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs
  );
  if( audioBuffer ) {
    if( !fs.existsSync(evoRenderDirPath) ) fs.mkdirSync(evoRenderDirPath, {recursive: true});
    // replace commas in classKey with underscores (AudioStellar doesn't like commas in file names)
    let classKeySansCommas = classKey.replace(/,/g, "_");
    // remove forward slashes from classKeySansCommas
    classKeySansCommas = classKeySansCommas.replace(/\//g, "_-_");

    // let filePath = path.join(evoRenderDirPath, `${Math.round(score*100)}_${iteration}_${classKeySansCommas}_${eliteGenomeId}.wav`);
    // TODO:  abandoning score and iteration info in file names for now, in favour of just genome ID and duration/noteDelta/velocity info, for consistencey with results from render-lineage-tree in kromosynth CLI
    let filePath = path.join(evoRenderDirPath, `${eliteGenomeId}-${duration}_${noteDelta}_${velocity}.wav`);
    console.log("writing wav file to", filePath, "for elite genome", eliteGenomeId);
    let wav = toWav(audioBuffer);
    let wavBuffer = Buffer.from(new Uint8Array(wav));
    fs.writeFileSync( filePath, wavBuffer ); 
  }
  offlineAudioContext = undefined;
}

async function getGenomeClassScores(
  newGenomeString,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  classificationGraphModel,
  yamnetModelUrl,
  geneEvaluationProtocol,
  geneRenderingServerHost, renderSampleRateForClassifier,
  geneEvaluationServerHost, featureExtractionHost, ckptDir,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  let newGenomeClassScores;
  // in this case we'll render and evaluate all the rendered combinations in this stack (Node.js)
  if( geneEvaluationProtocol === "grpc" ) {
    newGenomeClassScores = await callGeneEvaluationService(
      newGenomeString,
      classScoringDurations,
      classScoringNoteDeltas,
      classScoringVelocities,
      classificationGraphModel,
      useGPU,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs,
      geneEvaluationServerHost
    ).catch(
      e => {
        console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
        clearServiceConnectionList(geneEvaluationServerHost);
        getGenomeFromGenomeString( newGenomeString ).then( async failedGenome =>
          Environment.persistence.saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
        );
      }
    );
  } else if( geneEvaluationProtocol === "websocket" ) {
    newGenomeClassScores = await Environment.evaluation.renderAndEvaluateGenomesViaWebsockets(
      newGenomeString,
      classScoringDurations,
      classScoringNoteDeltas,
      classScoringVelocities,
      useGPU,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs,
      geneRenderingServerHost, renderSampleRateForClassifier,
      geneEvaluationServerHost, featureExtractionHost, ckptDir,
      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
      dynamicComponents, featureIndices
    ).catch(
      e => {
        console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
        getGenomeFromGenomeString( newGenomeString ).then( async failedGenome =>
          await Environment.persistence.saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
        );
      }
    );
  } else if( geneEvaluationProtocol === "worker" ) {
    newGenomeClassScores = await callGeneEvaluationWorker(
      searchBatchSize, batchIteration,
      newGenomeString,
      classScoringDurations,
      classScoringNoteDeltas,
      classScoringVelocities,
      classificationGraphModel,
      yamnetModelUrl,
      useGPU,
      true // supplyAudioContextInstances
    ).catch(
      e => {
        console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
      }
    );
  }
  return newGenomeClassScores;
}

  // for all cells in eliteMap, get the feature vector if there is a genome in the cell
  // - if the feature vector is not present in the cellFeatures cache map, call the feature extraction service
async function populateAndSaveCellFeatures(
  eliteMap, cellFeatures, 
  duration, noteDelta, velocity, useGPU, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHosts, renderSampleRateForClassifier,
  evaluationFeatureExtractionHosts,
  evoRunDirPath, evolutionRunId,
  ckptDir,
  // featureExtractionEndpoint, featureExtractionType
  classConfiguration
) {
  const {
    qualityFeatureExtractionEndpoint,
    projectionFeatureExtractionEndpoint,
    qualityFeatureType,
    projectionFeatureType,
    sampleRate
  } = getWsServiceEndpointsFromClassConfiguration(classConfiguration);

  const classConfigurations = eliteMap.classConfigurations;
  let cellKeyIndex = 0;
  for( const cellKey in eliteMap.cells ) {
    const cell = eliteMap.cells[cellKey];
    if( cell.elts && cell.elts.length && ! cellFeatures[cellKey] ) {
      console.error("cellFeatures[cellKey] is undefined, for cellKey", cellKey);
    }
    if( cell.elts && cell.elts.length && (!cellFeatures[cellKey] || !cellFeatures[cellKey][projectionFeatureType]) ) {
      const cellGenomeId = cell.elts[0].g;
      const cellGenomeString = await Environment.persistence.readGenomeAndMetaFromDisk( evolutionRunId, cellGenomeId, evoRunDirPath );
      const audioBuffer = await Environment.evaluation.getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
        cellGenomeString,
        duration,
        noteDelta,
        velocity,
        useGPU,
        antiAliasing,
        frequencyUpdatesApplyToAllPathcNetworkOutputs,
        geneRenderingServerHosts[cellKeyIndex % geneRenderingServerHosts.length], renderSampleRateForClassifier
      );
      const evaluationFeatureHost = evaluationFeatureExtractionHosts[cellKeyIndex % evaluationFeatureExtractionHosts.length];

      let qualityFeaturesResponse, projectionFeaturesResponse;

      if (qualityFeatureExtractionEndpoint === projectionFeatureExtractionEndpoint) {
        // If endpoints are the same, make only one call
        const featuresResponse = await Environment.evaluation.getFeaturesFromWebsocket(
          audioBuffer,
          evaluationFeatureHost + qualityFeatureExtractionEndpoint,
          ckptDir,
          sampleRate
        );
        qualityFeaturesResponse = projectionFeaturesResponse = featuresResponse;
      } else {
        // If endpoints are different, make two separate calls
        [qualityFeaturesResponse, projectionFeaturesResponse] = await Promise.all([
          Environment.evaluation.getFeaturesFromWebsocket(
            audioBuffer,
            evaluationFeatureHost + qualityFeatureExtractionEndpoint,
            ckptDir,
            sampleRate
          ),
          Environment.evaluation.getFeaturesFromWebsocket(
            audioBuffer,
            evaluationFeatureHost + projectionFeatureExtractionEndpoint,
            ckptDir,
            sampleRate
          )
        ]);
      }
    
      if (!cellFeatures[cellKey]) cellFeatures[cellKey] = {};
      
      cellFeatures[cellKey][qualityFeatureType] = {
        features: qualityFeaturesResponse.features,
        embedding: qualityFeaturesResponse.embedding
      };
    
      cellFeatures[cellKey][projectionFeatureType] = {
        features: projectionFeaturesResponse.features,
        embedding: projectionFeaturesResponse.embedding
      };

      cellKeyIndex++;
    }
  }
  const terrainName = eliteMap.classConfigurations && eliteMap.classConfigurations.length ? eliteMap.classConfigurations[0].refSetName : undefined;
  await Environment.persistence.saveCellFeaturesToDisk( cellFeatures, eliteMap, evoRunDirPath, evolutionRunId, terrainName );
}

async function getCellFitnessValues( eliteMap ) {
  const cellFitnessValues = [];
  for( const cellKey in eliteMap.cells ) {
    const cell = eliteMap.cells[cellKey];
    if( cell.elts && cell.elts.length ) {
      cellFitnessValues.push( cell.elts[0].s );
    }
  }
  return cellFitnessValues;
}

function getIsTopScoreFitnessWithAssociatedClass( genomeQuality ) {
  return genomeQuality && typeof genomeQuality === 'object';
}

async function getGenomeClassScoresByDiversityProjectionWithNewGenomes(
  genomeString,
  durations, 
  noteDeltas,
  velocities,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHost, renderSampleRateForClassifier,
  evaluationFeatureExtractionHost,
  evaluationQualityHost,
  eliteMap, eliteMapIndex,
  evolutionRunId, evoRunDirPath,
  scoreProportion,
  measureCollectivePerformance, ckptDir,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  // not supporting arrays of durations, noteDeltas and velocities for now, as is done in getGenomeClassScores
  const duration = Array.isArray(durations) ? durations[0] : durations;
  const noteDelta = Array.isArray(noteDeltas) ? noteDeltas[0] : noteDeltas;
  const velocity = Array.isArray(velocities) ? velocities[0] : velocities;

  const { classConfigurations } = eliteMap;

  let newGenomeFeatureVector;
  let newGenomeFeatureType;
  let newGenomeEmbedding;
  
  let newGenomeFitnessValue;
  let newGenomeFitnessClass;
  // get the feature vector for the new genome

  const audioBuffer = await Environment.evaluation.getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
    genomeString,
    duration,
    noteDelta,
    velocity,
    useGPU,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    geneRenderingServerHost, renderSampleRateForClassifier
  ).catch(
    e => {
      console.error(`Error rendering gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
    }
  );

  if( audioBuffer && audioBuffer.length && ! audioBuffer.some( value => isNaN(value) ) ) {
    const { 
      projectionFeatures: features, projectionFeaturesType: featuresType, projectionEmbedding: embedding, quality 
    } = await getFeaturesAndScoreForAudioBuffer(
      audioBuffer,
      evaluationFeatureExtractionHost, evaluationQualityHost,
      classConfigurations, eliteMapIndex,
      measureCollectivePerformance, ckptDir, evoRunDirPath,
      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
      dynamicComponents, featureIndices
    );
    newGenomeFeatureVector = features;
    newGenomeFeatureType = featuresType;
    newGenomeEmbedding = embedding;
    let newGenomeQuality = quality;

    const isTopScoreFitnessWithAssociatedClass = getIsTopScoreFitnessWithAssociatedClass( newGenomeQuality.fitness );
    if( isTopScoreFitnessWithAssociatedClass ) {
      newGenomeQuality.fitness.top_score = newGenomeQuality.fitness.top_score * scoreProportion;
      newGenomeFitnessValue = newGenomeQuality.fitness;
      newGenomeFitnessClass = newGenomeQuality.fitness.top_score_class;
    } else {
      newGenomeFitnessValue = newGenomeQuality.fitness * scoreProportion;
    }
  }

  let newGenomeClassScores;

  newGenomeClassScores = {
    newGenomeFitnessValue,
    newGenomeFitnessClass,
    duration,
    noteDelta,
    velocity,
    features: newGenomeFeatureVector,
    featuresType: newGenomeFeatureType,
    embedding: newGenomeEmbedding
  };

  return newGenomeClassScores;
}

async function getDiverstyProjectionsFromFeatures(
  features,
  newGenomeFitnessValues,
  evaluationDiversityHost,
  eliteMap,
  evoRunDirPath,
  evolutionRunId,
  shouldCalculateSurprise,
  shouldUseAutoEncoderForSurprise,
  dynamicComponents, featureIndices,
  auroraModeConfig
) {
  const { classConfigurations } = eliteMap;
  const {
    projectionFeatureType,
    projectionEndpoint
  } = getWsServiceEndpointsFromClassConfiguration(classConfigurations[0]);
  const pcaComponents = classConfigurations && classConfigurations.length ? classConfigurations[0].pcaComponents : undefined;

  const useContrastiveLearning = auroraModeConfig?.useContrastiveLearning || false;
  const tripletMarginMultiplier = auroraModeConfig?.tripletMarginMultiplier || 1.0;
  const useFeaturesDistance = auroraModeConfig?.useFeaturesDistance || false;
  const featuresDistanceMetric = auroraModeConfig?.featuresDistanceMetric || 'cosine';
  const randomSeed = auroraModeConfig?.randomSeed || 42;
  const { 
    learningRate, 
    trainingEpochs,
    tripletFormationStrategy 
  } = auroraModeConfig || {};

  const contrastiveProjectionEndpoint = '/contrastive'; // Default endpoint for contrastive learning
  const endpoint = useContrastiveLearning ? contrastiveProjectionEndpoint : projectionEndpoint;

  const diversityProjection = await Environment.evaluation.getDiversityFromWebsocket(
    features,
    newGenomeFitnessValues,
    evaluationDiversityHost + endpoint,
    evoRunDirPath, evolutionRunId,
    false, //shouldFit
    pcaComponents,
    shouldCalculateSurprise,
    shouldUseAutoEncoderForSurprise,
    false, // shouldCalculateNovelty (TODO currently unused; as we let the diversity tracker handle that calculation: if shouldTrackDiversity)
    dynamicComponents, featureIndices,
    tripletMarginMultiplier, useFeaturesDistance, featuresDistanceMetric, randomSeed,
    learningRate, trainingEpochs, tripletFormationStrategy,
    eliteMap.eliteMapIndex
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
  });
  // return diversityProjection;
  const diversityProjectionResults = [];
  for( let i=0; diversityProjection.feature_map && i < diversityProjection.feature_map.length; i++ ) {
    const newGenomeFitnessValue = newGenomeFitnessValues[i];
    let score;
    let scoreClass;
    if( getIsTopScoreFitnessWithAssociatedClass( newGenomeFitnessValue ) ) {
      score = newGenomeFitnessValue.top_score;
      scoreClass = newGenomeFitnessValue.top_score_class;
      // let's add the class to the diversityMapKey as another dimension
      diversityProjection.feature_map[i].push( newGenomeFitnessValue.top_score_class );
    } else {
      score = newGenomeFitnessValue;
    }
    let surprise;
    if( shouldCalculateSurprise && diversityProjection.surprise_scores && diversityProjection.surprise_scores.length && diversityProjection.surprise_scores[i] ) {
      surprise = diversityProjection.surprise_scores[i];
    }
    const diversityMapKey = diversityProjection.feature_map[i].join("_");
    diversityProjectionResults.push({
      score,
      scoreClass,
      surprise,
      diversityMapKey
    });
  }
  return diversityProjectionResults;
}


// similar to getGenomeClassScoresByDiversityProjectionWithNewGenomes, but specialised for the seed rounds
// TODO: update quality handling to be similar to getGenomeClassScoresByDiversityProjectionWithNewGenomes
async function getGenomeScoreAndFeatures(
  genomeId,
  genomeString,
  duration,
  noteDelta,
  velocity,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHost, renderSampleRateForClassifier,
  evaluationFeatureExtractionHost,
  evaluationQualityHost,
  scoreProportion,
  classConfigurations, eliteMapIndex,
  measureCollectivePerformance, ckptDir, evoRunDirPath,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  const audioBuffer = await Environment.evaluation.getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
    genomeString,
    duration,
    noteDelta,
    velocity,
    useGPU,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    geneRenderingServerHost, renderSampleRateForClassifier
  ).catch(e => {
    console.error(`Error rendering geneome ${genomeId}`, e);
  });

  let newGenomeFeatureVector;
  let newGenomeFeatureType;
  let newGenomeEmbedding;
  let newGenomeQuality;
  let fitness;
  if( audioBuffer && audioBuffer.length && ! audioBuffer.some( value => isNaN(value) ) ) {
    // get features from audio buffer
    // const featuresResponse = await getFeaturesFromWebsocket(
    //   audioBuffer,
    //   evaluationFeatureExtractionHost
    // ).catch(e => {
    //   console.error(`getGenomeScoreAndFeatures: Error getting features for genomeId ${genomeId}`, e);
    // });
    // newGenomeFeatureVector = featuresResponse.features;

    // // get quality from audio buffer
    // newGenomeQuality = await getQualityFromWebsocket(
    //   audioBuffer,
    //   evaluationQualityHost
    // ).catch(e => {
    //   console.error(`getGenomeScoreAndFeatures: Error getting quality  for genome ID ${genomeId}`, e);
    // });

    const { 
      projectionFeatures: features, projectionFeaturesType: featuresType, embedding, quality 
    } = await getFeaturesAndScoreForAudioBuffer(
      audioBuffer,
      evaluationFeatureExtractionHost, evaluationQualityHost,
      classConfigurations, eliteMapIndex,
      measureCollectivePerformance, 
      ckptDir, 
      evoRunDirPath,
      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
      dynamicComponents, featureIndices
    );
    newGenomeFeatureVector = features;
    newGenomeFeatureType = featuresType;
    newGenomeEmbedding = embedding;
    newGenomeQuality = quality;

    const isTopScoreFitnessWithAssociatedClass = getIsTopScoreFitnessWithAssociatedClass( newGenomeQuality.fitness );
    if( isTopScoreFitnessWithAssociatedClass ) {
      newGenomeQuality.fitness.top_score *= scoreProportion;
      fitness = newGenomeQuality.fitness;
    } else {
      fitness = newGenomeQuality.fitness * scoreProportion;
    }
  }

  return {
    genomeId,
    // genomeString,
    fitness,
    duration,
    noteDelta,
    velocity,
    features: newGenomeFeatureVector,
    featuresType: newGenomeFeatureType,
    embedding: newGenomeEmbedding
  };
}

function getQuerySetEmbedsPath( evoRunDirPath, refSetName ) {
  return evoRunDirPath + `${refSetName}__query_set_embeds.npy`;
}

async function getFeaturesAndScoreForAudioBuffer(
  audioBuffer,
  evaluationFeatureExtractionHost,
  evaluationQualityHost,
  classConfigurations,
  eliteMapIndex,
  measureCollectivePerformance,
  ckptDir,
  evoRunDirPath,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  let qualityFromEmbeds = false;
  let qualityFromFeatures = false;
  let refSetName, refSetEmbedsPath, querySetEmbedsPath, sampleRate;

  const {
    qualityFeatureExtractionEndpoint,
    projectionFeatureExtractionEndpoint,
    qualityFeatureType,
    projectionFeatureType,
    qualityEvaluationEndpoint,
    qualityFromFeatures: configQualityFromFeatures,
    usingQueryEmbeddings,
    sampleRate: configSampleRate
  } = getWsServiceEndpointsFromClassConfiguration(classConfigurations[0]);

  if (classConfigurations && classConfigurations.length) {
    refSetName = classConfigurations[0].refSetName;
    refSetEmbedsPath = classConfigurations[0].refSetEmbedsPath;
    querySetEmbedsPath = getQuerySetEmbedsPath(evoRunDirPath, refSetName);
    sampleRate = configSampleRate;
    if (configQualityFromFeatures) {
      qualityFromFeatures = true;
    // TODO need to configure this specifically
    // } else {
    //   qualityFromEmbeds = true;
    }
  }

  let qualityFeaturesResponse, projectionFeaturesResponse;

  if (qualityFeatureExtractionEndpoint === projectionFeatureExtractionEndpoint) {
    // If endpoints are the same, make only one call
    const featuresResponse = await Environment.evaluation.getFeaturesFromWebsocket(
      audioBuffer,
      evaluationFeatureExtractionHost + qualityFeatureExtractionEndpoint,
      ckptDir,
      sampleRate
    );
    qualityFeaturesResponse = projectionFeaturesResponse = featuresResponse;
  } else {
    // If endpoints are different, make two separate calls
    [qualityFeaturesResponse, projectionFeaturesResponse] = await Promise.all([
      Environment.evaluation.getFeaturesFromWebsocket(
        audioBuffer,
        evaluationFeatureExtractionHost + qualityFeatureExtractionEndpoint,
        ckptDir,
        sampleRate
      ),
      Environment.evaluation.getFeaturesFromWebsocket(
        audioBuffer,
        evaluationFeatureExtractionHost + projectionFeatureExtractionEndpoint,
        ckptDir,
        sampleRate
      )
    ]);
  }

  let newGenomeQuality;
  if (qualityFromFeatures || qualityFromEmbeds) {
    let vectorsToCompare;
    if (qualityFromFeatures) {
      vectorsToCompare = qualityFeaturesResponse.features;
    } else {
      vectorsToCompare = qualityFeaturesResponse.embedding;
    }
    
    if (vectorsToCompare.length === 1) {
      console.error(`Error: vectorsToCompare has length 1`);
    }
    
    newGenomeQuality = await Environment.evaluation.getQualityFromWebsocketForEmbedding(
      vectorsToCompare,
      evaluationQualityHost + qualityEvaluationEndpoint,
      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
      dynamicComponents, featureIndices
    );
  } else {
    // Fallback to using audio buffer for quality evaluation
    newGenomeQuality = await Environment.evaluation.getQualityFromWebsocket(
      audioBuffer,
      evaluationQualityHost + qualityEvaluationEndpoint
    );
  }

  return {
    qualityFeatures: qualityFeaturesResponse.features,
    qualityFeaturesType: qualityFeatureType,
    qualityEmbedding: qualityFeaturesResponse.embedding,
    projectionFeatures: projectionFeaturesResponse.features,
    projectionFeaturesType: projectionFeatureType,
    projectionEmbedding: projectionFeaturesResponse.embedding,
    quality: newGenomeQuality
  };
}

function addComponentDataToEliteMapMeta(
    eliteMapMeta, featureIndices, pcaComponents, featureContribution, componentContribution,
    generationNumber, evoRunDirPath, evolutionRunId
) {
  const eliteMapIndex = eliteMapMeta.eliteMapIndex;
  if (!eliteMapMeta[eliteMapIndex]) {
    eliteMapMeta[eliteMapIndex] = {};
  }
  if (!eliteMapMeta[eliteMapIndex][generationNumber]) {
    eliteMapMeta[eliteMapIndex][generationNumber] = {};
  }
  eliteMapMeta[eliteMapIndex][generationNumber].feature_indices = featureIndices;
  eliteMapMeta[eliteMapIndex][generationNumber].pca_components = pcaComponents;
  eliteMapMeta[eliteMapIndex][generationNumber].feature_contribution = featureContribution;
  eliteMapMeta[eliteMapIndex][generationNumber].component_contribution = componentContribution;
  Environment.persistence.saveEliteMapMetaToDisk(eliteMapMeta, evoRunDirPath, evolutionRunId);
}

async function getClassKeysFromSeedFeatures( 
    seedFeaturesAndScores, evaluationDiversityHost, evoRunDirPath, evolutionRunId, classScoringVariationsAsContainerDimensions, 
    eliteMap, eliteMapMeta, dynamicComponents, featureIndices,
    auroraModeConfig
) {
  const featuresArray = seedFeaturesAndScores.map( f => f.features );
  const fitnessValuesArray = seedFeaturesAndScores.map( f => f.fitness );
  const pcaComponents = eliteMap.classConfigurations && eliteMap.classConfigurations.length ? eliteMap.classConfigurations[0].pcaComponentsn : undefined;
  const projectionEndpoint = eliteMap.classConfigurations && eliteMap.classConfigurations.length ? eliteMap.classConfigurations[0].projectionEndpoint : undefined;

  const useContrastiveLearning = auroraModeConfig?.useContrastiveLearning || false;
  const tripletMarginMultiplier = auroraModeConfig?.tripletMarginMultiplier || 1.0;
  const useFeaturesDistance = auroraModeConfig?.useFeaturesDistance || false;
  const featuresDistanceMetric = auroraModeConfig?.featuresDistanceMetric || 'cosine';
  const randomSeed = auroraModeConfig?.randomSeed || 42;
  const { 
    learningRate, 
    trainingEpochs,
    tripletFormationStrategy 
  } = auroraModeConfig || {};

  const contrastiveProjectionEndpoint = '/contrastive'; // Default endpoint for contrastive learning
  const endpoint = useContrastiveLearning ? contrastiveProjectionEndpoint : projectionEndpoint;

  const diversityProjection = await Environment.evaluation.getDiversityFromWebsocket(
    featuresArray,
    fitnessValuesArray, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
    evaluationDiversityHost + endpoint,
    evoRunDirPath, evolutionRunId,
    true, // shouldFit
    pcaComponents,
    false, // shouldCalculateSurprise; we're not obtaining score here
    false, // shouldUseAutoEncoderForSurprise
    false, // shouldCalculateNovelty
    dynamicComponents, featureIndices,
    tripletMarginMultiplier, useFeaturesDistance, featuresDistanceMetric, randomSeed,
    learningRate, trainingEpochs, tripletFormationStrategy,
    eliteMap.eliteMapIndex
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber}`, e);
  });
  eliteMap.shouldFit = false;
  if( dynamicComponents ) {
    // add feature_indices, pca_components and featur_contribution to eliteMapMeta
    const { feature_indices, pca_components, feature_contribution, component_contribution } = diversityProjection;
    addComponentDataToEliteMapMeta(
      eliteMapMeta,
      feature_indices, pca_components, feature_contribution, component_contribution,
      eliteMap.generationNumber, evoRunDirPath, evolutionRunId
    );
  }

  // doing the same thing here as in function retrainProjectionModel
  eliteMap.lastProjectionFitIndex++;
  eliteMap.projectionModelFitGenerations.push( eliteMap.generationNumber );
  if( diversityProjection.feature_map === undefined ) {
    console.error("diversityProjection.feature_map is undefined");
  }
  eliteMap.projectionSizes.push( diversityProjection.feature_map.length );
  
  if( classScoringVariationsAsContainerDimensions ) {
    return diversityProjection.feature_map.map( (oneClassKey, i) => {
      const {duration, noteDelta, velocity} = seedFeaturesAndScores[i];
      const classScoringVariationsKey =  `-${duration}_${noteDelta}_${velocity}`;
      return oneClassKey.join('_') + classScoringVariationsKey;
    });
  } else {
    return diversityProjection.feature_map.map( (oneClassKey, i) => {
      return oneClassKey.join('_');
    });
  }
}

async function getFeaturesAndScoresForGenomeIds(
  genomeIdsToFeatures,
  _evaluationQualityServers, classConfiguration,
  evolutionRunId, evoRunDirPath,
  scoreProportion,
  ckptDir, measureCollectivePerformance, // TODO clean up unused args in this function and in all calls to it
  refSetEmbedsPath, refSetName,
  // for a call to getGenomeScoreAndFeatures:
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHost, 
  evaluationFeatureExtractionHost, featureExtractionEndpoint, 
  sampleRate,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  const seedFeaturesAndScores = [];
  let i = 0;
  const querySetEmbedsPath = getQuerySetEmbedsPath( evoRunDirPath, refSetName );

  for( let genomeId in genomeIdsToFeatures ) {
    const features = genomeIdsToFeatures[genomeId];
    const genomeString = await Environment.persistence.readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath );
    if( ! genomeString ) {
      console.error(`Error: genomeString is undefined for genomeId ${genomeId}`);
      continue;
    }
    let cellKey;
    if( ! features.cellKey && Array.isArray(features.containerProjection) ) {
      cellKey = features.containerProjection.join("_");
    } else {
      cellKey = features.cellKey;
    }
    const { duration, noteDelta, velocity } = getDurationNoteDeltaVelocityFromGenomeString( genomeString, cellKey );
    // const classConfiguration = eliteMap.classConfigurations[eliteMap.eliteMapIndex];
    const { 
      qualityEvaluationEndpoint, 
    } = getWsServiceEndpointsFromClassConfiguration( classConfiguration ); 
    const evaluationQualityHost = _evaluationQualityServers[ i % _evaluationQualityServers.length ] + qualityEvaluationEndpoint;
    // const evaluationQualityHostEncodedBase64 = Buffer.from(evaluationQualityHost).toString('base64');
    const featureExtractionType = classConfiguration.featureExtractionType;
    if( ! features[featureExtractionType] ) {
      // this can happen if the genome has not been an elite in the current classConfiguration, so let's extract the features for this featureExtractionType
      const {
        features : featuresResult, embedding: embeddingResult 
      } = await getFeaturesForGenomeString(
        genomeString,
        duration, noteDelta, velocity,
        useGPU,
        antiAliasing,
        frequencyUpdatesApplyToAllPathcNetworkOutputs,
        geneRenderingServerHost,
        evaluationFeatureExtractionHost, featureExtractionEndpoint,
        sampleRate,
        ckptDir
      );

      features[featureExtractionType] = { features: featuresResult, embedding: embeddingResult };

      console.log(`Features extracted for genomeId ${genomeId} and cellKey ${features.cellKey}`);
    }
    const vectorsToCompare = classConfiguration.qualityFromFeatures ? features[featureExtractionType].features : features[featureExtractionType].embedding
    if( vectorsToCompare.length === 1 ) {
      console.error(`Error: vectorsToCompare has length 1 for genomeId ${genomeId} and cellKey ${cellKey}`);
    }
    const genomeQuality = await Environment.evaluation.getQualityFromWebsocketForEmbedding(
      vectorsToCompare,
      evaluationQualityHost,
      zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
      dynamicComponents, featureIndices
    );
    const fitness = genomeQuality.fitness * scoreProportion;
    seedFeaturesAndScores.push({
      genomeId,
      // genomeString,
      fitness,
      duration,
      noteDelta,
      velocity,
      features: features[featureExtractionType].features,
      featuresType: featureExtractionType,
      embedding: features[featureExtractionType].embedding
    });
    i++;
  }
  return seedFeaturesAndScores;
}

async function getFeaturesAndScoresFromEliteMap(
  eliteMap, cellFeatures,
  _evaluationQualityServers, classConfiguration,
  evolutionRunId, evoRunDirPath,
  scoreProportion,
  ckptDir, measureCollectivePerformance,
  refSetEmbedsPath, refSetName,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHost, 
  evaluationFeatureExtractionHost,
  featureExtractionEndpoint,
  sampleRate,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {

  let i = 0;
  const querySetEmbedsPath = getQuerySetEmbedsPath( evoRunDirPath, refSetName );
  const genomeIdsToFeatures = {};
  for( let cellKey in cellFeatures ) {
    if( eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length ) {
      const features = cellFeatures[cellKey];
      features.cellKey = cellKey;
      const genomeId = eliteMap.cells[cellKey].elts[0].g;
      genomeIdsToFeatures[genomeId] = features;
      i++;
    }
  }
  const seedFeaturesAndScores = await getFeaturesAndScoresForGenomeIds(
    genomeIdsToFeatures,
    _evaluationQualityServers, classConfiguration,
    evolutionRunId, evoRunDirPath,
    scoreProportion,
    ckptDir, measureCollectivePerformance,
    refSetEmbedsPath, refSetName,
    useGPU,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    geneRenderingServerHost, 
    evaluationFeatureExtractionHost, featureExtractionEndpoint,
    sampleRate,
    zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
    dynamicComponents, featureIndices
  );
  return seedFeaturesAndScores;
}

function getShouldFit( 
    lastProjectionFitIndex, iterationNumber, projectionRetrainingLinearGapIncrement,
    auroraModeConfig
) {

  if (!auroraModeConfig) {
    // Default to linear if no config provided
    // T_n = n * k * (n + 1) / 2, formula for triangle numbers
    const nextProjectionFitIndex = lastProjectionFitIndex + 1;
    const nextFitIterationNumber = nextProjectionFitIndex * projectionRetrainingLinearGapIncrement * (nextProjectionFitIndex + 1) / 2;
    return iterationNumber >= nextFitIterationNumber;
  }

  const { 
    projectionRetrainingMode, 
    projectionRetrainingInterval
  } = auroraModeConfig;

  if (projectionRetrainingMode === "fixed") {
    return iterationNumber % projectionRetrainingInterval === 0;
  } else {
    // Linear schedule logic
    const nextProjectionFitIndex = lastProjectionFitIndex + 1;
    const nextFitIterationNumber = nextProjectionFitIndex * projectionRetrainingLinearGapIncrement * (nextProjectionFitIndex + 1) / 2;
    return iterationNumber >= nextFitIterationNumber;
  }
}

// only called once, after the seed rounds are over:
function getNextFitGenerationIndex( lastProjectionFitGenerationNumber, projectionRetrainingLinearGapIncrement ) {
  let nextFitGenerationIndex = 0;
  do {
    const nextFitGenerationNumber = nextFitGenerationIndex * projectionRetrainingLinearGapIncrement * (nextFitGenerationIndex + 1) / 2;
    if( nextFitGenerationNumber > lastProjectionFitGenerationNumber ) {
      return nextFitGenerationIndex;
    }
  } while( ++nextFitGenerationIndex );
}

async function retrainProjectionModel( 
  cellFeatures, eliteMap, evolutionRunId,
  evaluationDiversityHosts, evoRunDirPath, 
  classScoringVariationsAsContainerDimensions, 
  shouldCalculateSurprise, shouldUseAutoEncoderForSurprise,
  shouldTrackDiversity,
  eliteRemappingCompetitionCriteria,
  noveltyArchive,
  retrainWithAllDiscoveredFeatures,
  dynamicComponents, featureIndices, eliteMapMeta,
  auroraModeConfig
) {
  const useContrastiveLearning = auroraModeConfig?.useContrastiveLearning || false;
  const tripletMarginMultiplier = auroraModeConfig?.tripletMarginMultiplier || 1.0;
  const useFeaturesDistance = auroraModeConfig?.useFeaturesDistance || false;
  const featuresDistanceMetric = auroraModeConfig?.featuresDistanceMetric || "cosine";
  const randomSeed = auroraModeConfig?.randomSeed || 42;
  const { 
    learningRate, 
    trainingEpochs,
    tripletFormationStrategy 
  } = auroraModeConfig || {};
  
  const evaluationDiversityHost = evaluationDiversityHosts[0]; // if more than other servers, they will pick up the updated model data by checking file timestamps; see dimensionality_reduction.py in kormosynth-evaluate

  const contrastiveProjectionEndpoint = '/contrastive'; // Default endpoint for contrastive learning

  const {
    projectionFeatureType,
    projectionEndpoint,
    pcaComponents
  } = getWsServiceEndpointsFromClassConfiguration(eliteMap.classConfigurations[0]); // TODO eliteMap.eliteMapIndex ?

  let cellFeaturesMap = new Map(); // to ensure order of insertion
  let cellElitesMap = new Map();
  for (const cellKey in cellFeatures) {
    if( cellFeatures[cellKey][projectionFeatureType].features === undefined ) {
      console.error(`Error: cellFeatures[${cellKey}] is undefined`);
      continue; // TODO why this can happen is unexplained! - but it seems to only happen in map-switching configs?
    }
    cellFeaturesMap.set(cellKey, cellFeatures[cellKey]);
    if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
      cellElitesMap.set(cellKey, eliteMap.cells[cellKey].elts[0]);
    }
  }
  if (cellFeaturesMap.size !== cellElitesMap.size) {
    console.error("Error: cellFeaturesSet.size !== cellElites.size");
    throw new Error("Error: cellFeaturesSet.size !== cellElites.size");
  }

  const allFeaturesToProject = [];
  const allFitnessValues = [];
  for (const cellKeyWithFeatures of cellFeaturesMap.keys()) {
    allFeaturesToProject.push(cellFeatures[cellKeyWithFeatures][projectionFeatureType].features);
    allFitnessValues.push(cellElitesMap.get(cellKeyWithFeatures).s);
  }

  // Determine which endpoint to use based on whether contrastive learning is enabled
  const endpoint = useContrastiveLearning ? contrastiveProjectionEndpoint : projectionEndpoint;

  // Initialize the DiversityTracker
  let tracker;
  if (shouldTrackDiversity) {
    tracker = new DiversityTracker(evaluationDiversityHost, `${evoRunDirPath}/diversity`);
    tracker.loadPersistedData(); // Load any persisted data

    console.log(`Before retraining projection, obtaining ${allFeaturesToProject.length} projection feature vectors, at generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`);
    const diversityProjectionBeforeRetraining = await Environment.evaluation.getDiversityFromWebsocket(
      allFeaturesToProject,
      useContrastiveLearning ? allFitnessValues : undefined,
      evaluationDiversityHost + endpoint,
      evoRunDirPath, evolutionRunId,
      false, // important to not retrain here; will be done below
      pcaComponents,
      shouldCalculateSurprise,
      shouldUseAutoEncoderForSurprise,
      false, // shouldCalculateNovelty; we'll let the tracker handle this for now TODO
      dynamicComponents, featureIndices,
      tripletMarginMultiplier,
      useFeaturesDistance, featuresDistanceMetric, randomSeed,
      learningRate, trainingEpochs, tripletFormationStrategy,
      eliteMap.eliteMapIndex
    ).catch(e => {
      console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`, e);
      cellFeaturesMap = null;
      cellElitesMap = null;
      return `Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`;
    });

    // Prepare feature vectors before remapping
    // TODO: should it be the fitnes projection features or the projection features?
    const projectionFeatureVectorsBefore = diversityProjectionBeforeRetraining.feature_map;
    const featureVectorsBefore = [];
    const fitnessValuesBefore = [];
    for (const cellKeyWithFeatures of cellFeaturesMap.keys()) {
      featureVectorsBefore.push(cellFeatures[cellKeyWithFeatures][projectionFeatureType].features);
      fitnessValuesBefore.push(cellElitesMap.get(cellKeyWithFeatures).s);
    }

    // Send metrics request before remapping
    await tracker.sendMetricsRequest(eliteMap.generationNumber, featureVectorsBefore, 'before');
    // await tracker.sendClusterAnalysisRequest(eliteMap.generationNumber, featureVectorsBefore, 'before');
    const classificationDimensions = getClassificationDimensionsFromEliteMapConfig(eliteMap);
    await tracker.sendPerformanceSpreadRequest(
      eliteMap.generationNumber, projectionFeatureVectorsBefore, fitnessValuesBefore, 'before', classificationDimensions
    );
  }



  // Retrain projection model
  if( retrainWithAllDiscoveredFeatures ) {
    const {lostFeatures, lostScores} = Environment.persistence.readAllLostFeaturesFromDisk( evoRunDirPath, projectionFeatureType );
    if( lostFeatures && lostFeatures.length ) {
      // concatenate allFeaturesToProject with lostFeatures
      allFeaturesToProject.push( ...lostFeatures );
      allFitnessValues.push( ...lostScores );
    }
  }
  console.log(`Retraining projection with ${allFeaturesToProject.length} features, after generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`);
  const diversityProjection = await Environment.evaluation.getDiversityFromWebsocket(
    allFeaturesToProject,
    useContrastiveLearning ? allFitnessValues : undefined,
    evaluationDiversityHost + endpoint,
    evoRunDirPath, evolutionRunId,
    true,
    pcaComponents,
    shouldCalculateSurprise,
    shouldUseAutoEncoderForSurprise,
    false, // shouldCalculateNovelty; we'll let the tracker handle this for now TODO
    dynamicComponents, featureIndices,
    tripletMarginMultiplier, useFeaturesDistance, featuresDistanceMetric, randomSeed,
    learningRate, trainingEpochs, tripletFormationStrategy,
    eliteMap.eliteMapIndex
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`, e);
    cellFeaturesMap = null;
    cellElitesMap = null;
    return `Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`;
  });

  eliteMap.lastProjectionFitIndex++;
  eliteMap.projectionModelFitGenerations.push(eliteMap.generationNumber);
  eliteMap.projectionSizes.push(diversityProjection.feature_map.length);

  let countNonEmptyCells = Object.values(eliteMap.cells).filter(cell => cell.elts.length > 0).length;
  console.log(`countNonEmptyCells before repopulation: ${countNonEmptyCells}`);

  Object.keys(eliteMap.cells).forEach(cellKey => {
    eliteMap.cells[cellKey].elts = [];
  });

  for (const cellKey in cellFeatures) {
    delete cellFeatures[cellKey];
  }

  if( true /*dynamicComponents*/ ) {
    const { feature_indices, pca_components, feature_contribution, component_contribution } = diversityProjection;
    addComponentDataToEliteMapMeta(
      eliteMapMeta,
      feature_indices, pca_components, feature_contribution, component_contribution,
      eliteMap.generationNumber, evoRunDirPath, evolutionRunId
    );
  }

  // re-map to the container, with potentially new competition dynamics
  let i = 0;
  let containerLossCount = 0;
  const containerLossFeatures = {};
  for (const [cellKey, elite] of cellElitesMap) {
    let newCellKey;
    if (classScoringVariationsAsContainerDimensions) {
      const genomeString = Environment.persistence.readGenomeAndMetaFromDisk(evolutionRunId, elite.g, evoRunDirPath);
      const { duration, noteDelta, velocity } = getDurationNoteDeltaVelocityFromGenomeString(genomeString, cellKey);
      newCellKey = diversityProjection.feature_map[i].join('_') + `-${duration}_${noteDelta}_${velocity}`;
    } else {
      if( elite.sC ) { // add score class as dimension to the container key
        diversityProjection.feature_map[i].push( elite.sC );
      }
      newCellKey = diversityProjection.feature_map[i].join('_');
    }
    if (eliteMap.cells[newCellKey].elts.length) {
      const currentElite = eliteMap.cells[newCellKey].elts[0];
      if( doesNewEliteWinCurrentDuringRemapping( 
          elite, currentElite, eliteRemappingCompetitionCriteria,
          eliteMap.generationNumber
      ) ) {
        eliteMap.cells[newCellKey].elts = [elite];
        cellFeatures[newCellKey] = cellFeaturesMap.get(cellKey);
        cellFeatures[newCellKey]["containerProjection"] = diversityProjection.feature_map[i];
      } else {
        containerLossCount++;
        containerLossFeatures[cellKey] = cellFeaturesMap.get(cellKey);
        containerLossFeatures[cellKey]["score"] = currentElite.s;
      }
    } else {
      eliteMap.cells[newCellKey].elts = [elite];
      cellFeatures[newCellKey] = cellFeaturesMap.get(cellKey);
      cellFeatures[newCellKey]["containerProjection"] = diversityProjection.feature_map[i];
    }
    i++;
  }
  if( ! eliteMap.containerLossesPerUpdate ) {
    eliteMap.containerLossesPerUpdate = []; // handling older runs
  }
  eliteMap.containerLossesPerUpdate.push(containerLossCount);
  eliteMap.averageContainerLosses = eliteMap.containerLossesPerUpdate.reduce((a, b) => a + b, 0) / eliteMap.containerLossesPerUpdate.length;

  countNonEmptyCells = Object.values(eliteMap.cells).filter(cell => cell.elts.length > 0).length;
  console.log(`countNonEmptyCells after repopulation: ${countNonEmptyCells}`);

  if( retrainWithAllDiscoveredFeatures ) {
    Environment.persistence.saveLostFeaturesToDisk( containerLossFeatures, eliteMap, evoRunDirPath );
  }

  // Save the cell features at this generation to disk, for use during feature Z-score normalisation
  const featureExtractionType = projectionFeatureType; // TODO might want to make those distinct?
  const generationFeaturesFilePath = Environment.persistence.saveCellFeaturesAtGenerationToDisk( 
    cellFeatures, featureExtractionType, eliteMap.generationNumber, evoRunDirPath
  );

  if (shouldTrackDiversity) {
    // repeating above
    cellFeaturesMap = new Map(); // to ensure order of insertion
    cellElitesMap = new Map();
    for (const cellKey in cellFeatures) {
      cellFeaturesMap.set(cellKey, cellFeatures[cellKey]);
      if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
        cellElitesMap.set(cellKey, eliteMap.cells[cellKey].elts[0]);
      }
    }
    // Prepare feature vectors after remapping
    const fitnessValuesAfter = [];
    const featureVectorsAfter = [];
    const projectionFeatureVectorsAfter = [];
    for (const cellKeyWithFeatures of cellFeaturesMap.keys()) {
      featureVectorsAfter.push(cellFeatures[cellKeyWithFeatures][projectionFeatureType].features);
      projectionFeatureVectorsAfter.push(cellFeatures[cellKeyWithFeatures]["containerProjection"]);
      fitnessValuesAfter.push(cellElitesMap.get(cellKeyWithFeatures).s);
    }
// TODO: do we want the full feature vectors to .sendMetricsRequest? - or is that too noisy?
    // Send metrics request after remapping
    await tracker.sendMetricsRequest(eliteMap.generationNumber, featureVectorsAfter, 'after');
    // await tracker.sendClusterAnalysisRequest(eliteMap.generationNumber, featureVectorsAfter, 'after');
    await tracker.sendPerformanceSpreadRequest(eliteMap.generationNumber, projectionFeatureVectorsAfter, fitnessValuesAfter, 'after');
    tracker.compareMetrics(eliteMap.generationNumber);

    const comparison = tracker.getComparison(eliteMap.generationNumber);
    console.log(`Comparison for generation ${eliteMap.generationNumber}:`, comparison);

      // Get all comparisons
    const allComparisons = tracker.getAllComparisons();
    console.log('All comparisons:', allComparisons);

    // Request visualization of all metrics
    // TODO: needs further work:
    // await tracker.requestVisualization();

    console.log('Diversity tracking completed.');

    addNoveltyScoresToElites( cellElitesMap, tracker );
  }

  countNonEmptyCells = Object.values(eliteMap.cells).filter(cell => cell.elts.length > 0).length;
  console.log(`countNonEmptyCells after repopulation: ${countNonEmptyCells}`);

  if( noveltyArchive ) {
    console.log(`Updating novelty archive after generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`);
    const dimensionalityReductionModel = new DimensionalityReductionModel(
      evaluationDiversityHost + endpoint,
      evoRunDirPath,
      false, //shouldFit,
      pcaComponents,
      shouldCalculateSurprise,
      shouldUseAutoEncoderForSurprise
    );
    await noveltyArchive.updateArchive( eliteMap, dimensionalityReductionModel );
    console.log(`Novelty archive updated after generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`);
  }

  cellFeaturesMap = null;
  cellElitesMap = null;

  return {diversityProjection, generationFeaturesFilePath};
}

function doesNewEliteWinCurrentDuringRemapping(newElite, currentElite, eliteRemappingCompetitionCriteria, generationNumber, protectionPeriod = 10) {
  // Check if the current elite is within the protection period
  if (generationNumber - currentElite.gn < protectionPeriod) { // innovation protection
    // If protected, new elite only wins if it's significantly better
    return newElite.s > currentElite.s * 1.1; // 10% improvement threshold
  }

  // If not protected, use the existing criteria
  if (eliteRemappingCompetitionCriteria === ELITE_REMAPPING_COMPETITION_CRITERIA.SCORE || !eliteRemappingCompetitionCriteria) {
    return newElite.s > currentElite.s;
  } else if (eliteRemappingCompetitionCriteria === ELITE_REMAPPING_COMPETITION_CRITERIA.NOVELTY) {
    if (newElite.ns === undefined || currentElite.ns === undefined) {
      // initially we may not have novelty scores, as they are calculated during remapping
      return newElite.s > currentElite.s;
    } else {
      return newElite.ns > currentElite.ns;
    }
  } else if (eliteRemappingCompetitionCriteria === ELITE_REMAPPING_COMPETITION_CRITERIA.SURPRISE) {
    if (newElite.ss === undefined || currentElite.ss === undefined) {
      // initially we may not have surprise scores, as they are calculated from a trained projection model;
      // - we have seed elites - use the score:
      return newElite.s > currentElite.s;
    } else {
      return newElite.ss > currentElite.ss;
    }
  }
}

function addNoveltyScoresToElites( cellElitesMap, tracker ) {
  let eliteIndex = 0;
  for (const [cellKey, elite] of cellElitesMap) {
    elite.ns = tracker.last_novelty_scores_after[eliteIndex];
    eliteIndex++;
  }
}


// similar to retrainProjectionModel, but only tracking diversity - useful for runs where there is no projection model and / or retraining of the projection model
async function trackDiversity( 
  eliteMap, cellFeatures, evaluationDiversityHost, evoRunDirPath 
) {
  const tracker = new DiversityTracker(evaluationDiversityHost, `${evoRunDirPath}/diversity`);
  tracker.loadPersistedData(); // Load any persisted data

  const cellFeaturesMap = new Map(); // to ensure order of insertion
  const cellElitesMap = new Map();
  for (const cellKey in cellFeatures) {
    cellFeaturesMap.set(cellKey, cellFeatures[cellKey]);
    if (eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length) {
      cellElitesMap.set(cellKey, eliteMap.cells[cellKey].elts[0]);
    }
  }
  const {
    projectionFeatureType
  } = getWsServiceEndpointsFromClassConfiguration(eliteMap.classConfigurations[eliteMap.eliteMapIndex]);
  const featureVectors = []; // Object.values(cellFeatures).map(cell => cell[projectionFeatureType].features);
  const fitnessValues = [];
  for( const cellKeyWithFeatures of cellFeaturesMap.keys() ) {
    featureVectors.push(cellFeatures[cellKeyWithFeatures][projectionFeatureType].features);
    fitnessValues.push(cellElitesMap.get(cellKeyWithFeatures).s);
  }
  await tracker.sendMetricsRequest(eliteMap.generationNumber, featureVectors, 'after'); // 'after' as the setting of tracker.last_novelty_scores_after depends on that value
  // TODO: calculate performance spread? - massage data to fit tracker.sendPerformanceSpreadRequest ?
  // - that method might be agnostic to the dimensionality of the feature vectors?

  addNoveltyScoresToElites( cellElitesMap, tracker );
}

function getClassKeysWhereScoresAreElite( classScores, eliteMap, eliteWinsOnlyOneCell, classRestriction ) {
  if( classRestriction ) {
    const eliteScoreKeys = [];
    for( let oneClass of classRestriction ) {
      if( ! getCurrentClassElite(oneClass, eliteMap)
          || getCurrentClassElite(oneClass, eliteMap).s < classScores[oneClass].score
      ) {
        eliteScoreKeys.push(oneClass);
      }
    }
    return eliteScoreKeys;
  } else if( eliteWinsOnlyOneCell ) {
    const highestScoreClassKey = Object.keys(classScores).reduce((maxKey, oneClassKey) => 
      classScores[maxKey].score > classScores[oneClassKey].score ? maxKey : oneClassKey
    );
    const eliteScoreKeys = [];
    if( ! getCurrentClassElite(highestScoreClassKey, eliteMap)
        || getCurrentClassElite(highestScoreClassKey, eliteMap).s < classScores[highestScoreClassKey].score
    ) {
      eliteScoreKeys.push(highestScoreClassKey);
    }
    return eliteScoreKeys;
  } else {
    return Object.keys(classScores).filter( classKey =>
      ! getCurrentClassElite(classKey, eliteMap)
      || getCurrentClassElite(classKey, eliteMap).s < classScores[classKey].score
    );
  }
}

async function initializeEliteMap(
  evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationGraphModel, dummyRun,
  classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
  classConfigurations,
  eliteMapIndex
) {
  let eliteMap = {
    _id: Environment.persistence.getEliteMapKey(evolutionRunId, classConfigurations ? classConfigurations[0].refSetName : undefined),
    algorithm,
    evolutionRunConfig, evolutionaryHyperparameters,
    generationNumber: 0,
    lastProjectionFitIndex: 0, // or re-training of the projection model
    projectionModelFitGenerations: [],
    projectionSizes: [],
    coverages: [],
    noveltyArchiveSizes: {},
    eliteCounts: [],
    containerLossesPerUpdate: [],
    averageContainerLosses: -1,
    timestamp: Date.now(),
    eliteCountAtGeneration: 0,
    terminated: false,
    cells: {}, // aka classes or niches
    classConfigurations,
    qdScore: 0, qdScoreWithoutIncreaseCount: 0,
    qdScores: [],
    coverage: 0, coverageWithoutIncreaseCount: 0,
    isBeingSwitchedToFromAnotherMap: false,
    mapSwitchLog: [],
    eliteMapIndex
  };
  const classifierTags = await getClassifierTags(classificationGraphModel, dummyRun);
  if( classScoringVariationsAsContainerDimensions ) {
    for( const oneDuration of classScoringDurations ) {
      for( const oneNoteDelta of classScoringNoteDeltas ) {
        for( const oneVelocity of classScoringVelocities ) {
          classifierTags.forEach((oneTag, i) => {
            const oneClassKey = `${oneTag}-${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
            eliteMap.cells[oneClassKey] = {
              elts: [],
              eltAddCnt: 0
            };
          });
        }
      }
    }
  } else {
    classifierTags.forEach((oneTag, i) => {
      eliteMap.cells[oneTag] = {
        elts: []
      };
    });
  }
  return eliteMap;
}

async function initializeGrid( 
    evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters
) {
  const { 
    classifiers, classifierIndex, classesAsMaps, dummyRun,
    classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
    classScoringVariationsAsContainerDimensions
  } = evolutionRunConfig;
  const classificationGraphModel = classifiers[classifierIndex];
  let eliteMap;
  let eliteMapIndex = 0;
  if( typeof classificationGraphModel === 'object' && classificationGraphModel.hasOwnProperty('classConfigurations') && classificationGraphModel.hasOwnProperty('classificationDimensions') ) {
    const { classConfigurations, classificationDimensions } = classificationGraphModel;
    if( classesAsMaps ) {
      // an array of eliteMaps, with each map representing a classConfiguration
      eliteMap = [];
      for( const oneClassConfiguration of classConfigurations ) {
        const oneEliteMap = await initializeEliteMap(
          evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationDimensions, dummyRun,
          classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
          [oneClassConfiguration],
          eliteMapIndex
        );
        eliteMap.push( oneEliteMap );
        eliteMapIndex++;
      }
    } else {
      // only one map, but still using classConfigurations and classificationDimensions as the classificationGraphModel
      const oneEliteMap = await initializeEliteMap(
        evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationDimensions, dummyRun,
        classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
        classConfigurations,
        eliteMapIndex
      );
      eliteMap = oneEliteMap
    }
  } else {
    const oneEliteMap = await initializeEliteMap(
      evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationGraphModel, dummyRun,
      classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
      undefined, // classConfigurations
      eliteMapIndex
    );
    eliteMap = oneEliteMap;
  }
  return eliteMap;
}

///// methods to obtain a list of n-dimensional coordinates for a grid of cells
function createNDimensionalKeys(dims) {
  const keys = [];

  function generateKeys(indices, dimsIndex) {
    if (dimsIndex === dims.length) {
      keys.push(indices.join("_"));
    } else {
      if (Array.isArray(dims[dimsIndex])) {
        for (let i = 0; i < dims[dimsIndex].length; i++) {
          generateKeys([...indices, dims[dimsIndex][i]], dimsIndex + 1);
        }
      } else {
        for (let i = 0; i < dims[dimsIndex]; i++) {
          generateKeys([...indices, i], dimsIndex + 1);
        }
      }
    }
  }

  generateKeys([], 0);

  return keys;
}
///// end methods to obtain a list of n-dimensional coordinates for a grid of cells

async function getClassifierTags( graphModel, dummyRun ) {
  if( dummyRun && dummyRun.cellCount ) {
    return getDummyLabels(dummyRun.cellCount);
  } else {
    // if graphModel is an array, where each element is an integer, we'll assume it's a list defining the dimensions of a grid to project the behaviour space onto
    if( Array.isArray(graphModel) ) {
      if( graphModel.every(el => typeof el === "number" || Array.isArray(el)) ) {
        return createNDimensionalKeys(graphModel);
      } else {
        // the array elements are strings, then interpret as classifier names, from which the tags should be joined
        const tagsAggregate = [];
        for( const oneTag of graphModel ) {
          tagsAggregate.push(...getClassifierTags(oneTag));
        }
        return tagsAggregate;
      }
    } else {
      // if graphModel matches a websocket endpoint, we'll assume we can obtain the tags from the classifier
      if( graphModel.startsWith("ws://") || graphModel.startsWith("wss://") ) {
        const tagsWsRequest = { getKeys: true };
        const classifierTags = await Environment.evaluation.getAudioClassPredictionsFromWebsocket( // mis-/re-using this function to get the tags
          JSON.stringify(tagsWsRequest),
          graphModel, // geneEvaluationWebsocketServerHost
        );
        return classifierTags;
      } else {
        switch (graphModel) {
          // prefixes reflection those in quality_instrumentation.py in the kromosynth-evaluate repo
          case "yamnet":
            return yamnetTags.map( t => `YAM_${t}` );
          case "nsynth":
            return nsynthTags.map( t => `NSY_${t}` );
          case "mtg_jamendo_instrument":
            return mtgJamendoInstrumentTags.map( t => `MTG_${t}` );
          case "music_loop_instrument_role":
            return musicLoopInstrumentRoleClassLabels.map( t => `MLIR_${t}` );
          case "mood_acoustic":
            return moodAcousticClassLabels.map( t => `MA_${t}` );
          case "mood_electronic":
            return moodElectronicClassLabels.map( t => `ME_${t}` );
          case "voice_instrumental":
            return voiceInstrumentalClassLabels.map( t => `VI_${t}` );
          case "voice_gender":
            return voiceGenderClassLabels.map( t => `VG_${t}` );
          case "timbre":
            return timbreClassLabels.map( t => `TIM_${t}` );
          case "nsynth_acoustic_electronic":
            return nsynthAcousticElectronicClassLabels.map( t => `NAE_${t}` );
          case "nsynth_bright_dark":
            return nsynthBrightDarkClassLabels.map( t => `NBD_${t}` );
          case "nsynth_reverb":
            return nsynthReverbClassLabels.map( t => `NRV_${t}` );
          default:
            return yamnetTags.map( t => `YAM_${t}` );
        }
      }
    }
  }
}

function getCurrentClassElite( classKey, eliteMap ) {
  const classElites = eliteMap.cells[classKey];
  let currentClassElite;
  if( classElites && classElites.elts.length > 0 ) {
    currentClassElite = classElites.elts[classElites.elts.length-1];
  } else {
    if( ! classElites ) {
      eliteMap.cells[classKey] = {elts:[]};
      eliteMap.cells[classKey] = {uBC:10};
    }
    currentClassElite = null;
  }
  return currentClassElite;
}

function getClassScoresStandardDeviation( genomeClassScores ) {
  const scores = Object.values(genomeClassScores).map( gcs => gcs.s );
  const sd = calcStandardDeviation( scores );
  return sd;
}

/**
 *
 * @param {object} terminationCondition object with one key indicating the type of termination condition, mapping to a respective value or object:
 * {numberOfEvals: x}
 * or
 * {averageFitnessInMap: x}
 * or
 * {medianFitnessInMap: x}
 * or
 * {percentageOfMapFilledWithFitnessThreshold: {percentage: x, minimumCellFitness: x}}
 */
function shouldTerminate( terminationCondition, gradientWindowSize, eliteMap, classificationGraphModel, evolutionRunId, evoRunDirPath, dummyRun ) {
  let condition;
  let shouldTerminate = false;

  let terrainNames = [];
  if( typeof classificationGraphModel === "object" && classificationGraphModel.hasOwnProperty("classConfigurations") ) {
    terrainNames = classificationGraphModel.classConfigurations.map( cc => cc.refSetName );
  }
  console.log("------ terrainNames", terrainNames);
  let eliteMaps = [];
  if( terrainNames.length === 0 ) {
    eliteMaps.push( eliteMap );
  } else {
    for( const terrainName of terrainNames ) {
      const eliteMap = Environment.persistence.readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName );
      eliteMaps.push( eliteMap );
    }
  }

  for( const oneEliteMap of eliteMaps ) {

    if( dummyRun && dummyRun.iterations ) {
      shouldTerminate = dummyRun.iterations <= oneEliteMap.generationNumber;
    } else if( condition = terminationCondition["numberOfEvals"] ) {
      shouldTerminate = condition <= oneEliteMap.generationNumber * oneEliteMap.searchBatchSize;
      console.log("shouldTerminate", shouldTerminate, "elite id", oneEliteMap._id, "generationNumber", oneEliteMap.generationNumber, "searchBatchSize", oneEliteMap.searchBatchSize);
    } else if( condition = terminationCondition["averageFitnessInMap"] ) {
      const cellsKeysWithChampions = getCellKeysWithChampions(oneEliteMap.cells);
      if( cellsKeysWithChampions.length ) {
        let scoreSum = 0;
        for( const oneCellKey of cellsKeysWithChampions ) {
          scoreSum += oneEliteMap.cells[oneCellKey].elts[oneEliteMap.cells[oneCellKey].elts.length-1].s;
        }
        const averageFitness = scoreSum / cellsKeysWithChampions.length;
        shouldTerminate = condition <= averageFitness;
      } else {
        shouldTerminate = false;
      }
    } else if( condition = terminationCondition["medianFitnessInMap"] ) {
      const cellsKeysWithChampions = getCellKeysWithChampions(oneEliteMap.cells);
      if( cellsKeysWithChampions.length ) {
        const cellScores = getScoresForCellKeys( cellsKeysWithChampions, oneEliteMap.cells );
        const cellScoreMedian = median(cellScores);
        shouldTerminate = condition <= cellScoreMedian;
      } else {
        shouldTerminate = false;
      }
    } else if( condition = terminationCondition["percentageOfMapFilledWithFitnessThreshold"] ) {
      const cellCount = Object.keys(oneEliteMap.cells).length;
      const { percentage, minimumCellFitness } = condition;
      let cellsWithFitnessOverThresholdCount = 0;
      Object.keys(oneEliteMap.cells).forEach( oneClassKey => {
        if( minimumCellFitness <= oneEliteMap.cells[oneClassKey].elts[oneEliteMap.cells[oneClassKey].elts.length-1].s ) {
          cellsWithFitnessOverThresholdCount++;
        }
      });
      const cellsWithFitnessOverThresholdPercentage = cellsWithFitnessOverThresholdCount / cellCount;
      shouldTerminate = ( percentage <= cellsWithFitnessOverThresholdPercentage );
    } else if( 
      eliteMap.projectionSizes.length > gradientWindowSize &&
      ( condition = terminationCondition["coverageGradientThreshold"] )
    ) {
      shouldTerminate = getGradient( eliteMap.projectionSizes, gradientWindowSize, "projectionSizes" ) < condition;
    } else if( 
      eliteMap.projectionSizes.length > gradientWindowSize &&
      ( condition = terminationCondition["qdScoreGradientThreshold"] )
    ) {
      shouldTerminate = getGradient( eliteMap.qdScores, gradientWindowSize, "qdScores" ) < condition;
    }


    if( ! shouldTerminate ) {
      break;
    }
  }
  console.log("shouldTerminate", shouldTerminate);
  return shouldTerminate;
}

function shouldSwitchMap( eliteMap, mapSwitchingCondition ) {
  if( 
    mapSwitchingCondition.gradientWindowSize && eliteMap.mapSwitchLog && eliteMap.mapSwitchLog.length 
    &&
    eliteMap.mapSwitchLog[eliteMap.mapSwitchLog.length-1].nextMapGeneration + mapSwitchingCondition.gradientWindowSize > eliteMap.generationNumber
  ) { // ensure we stay for gradientWindowSize generations before switching
    return false;
  }
  if(
    eliteMap.generationNumber > 0 && mapSwitchingCondition.switchEveryNGenerations && eliteMap.generationNumber % mapSwitchingCondition.switchEveryNGenerations === 0
    ||
    mapSwitchingCondition.coverageWithoutIncreaseGenerations && 
    mapSwitchingCondition.coverageWithoutIncreaseGenerations < eliteMap.coverageWithoutIncreaseCount 
    ||
    mapSwitchingCondition.qdScoreWithoutIncreaseGenerations &&
    mapSwitchingCondition.qdScoreWithoutIncreaseGenerations < eliteMap.qdScoreWithoutIncreaseCount
    ||
    mapSwitchingCondition.coverageGradientThreshold && mapSwitchingCondition.gradientWindowSize &&
    eliteMap.projectionSizes.length > mapSwitchingCondition.gradientWindowSize &&
    getGradient( eliteMap.projectionSizes, mapSwitchingCondition.gradientWindowSize, "projectionSizes" ) < mapSwitchingCondition.coverageGradientThreshold
    ||
    mapSwitchingCondition.qdScoreGradientThreshold && mapSwitchingCondition.gradientWindowSize &&
    eliteMap.qdScores.length > mapSwitchingCondition.gradientWindowSize &&
    getGradient( eliteMap.qdScores, mapSwitchingCondition.gradientWindowSize, "qdScores" ) < mapSwitchingCondition.qdScoreGradientThreshold
  ) {
    return true;
  } else {
    return false;
  }
}

const getCellKeysWithChampions = cells => Object.keys(cells).filter(oneClassKey => cells[oneClassKey].elts.length);

const getScoresForCellKeys = (cellKeys, cells) => cellKeys.map( oneCellKey => cells[oneCellKey].elts[cells[oneCellKey].elts.length-1].s );

const getDummyLabels = cellCount => [...Array(cellCount).keys()].map(c => c.toString().padStart(cellCount.toString().length, 0));

const getDummyClassScoresForGenome = (cellLabels, generationNumber, totalIterations) => {
  const genomeClassScores = {};
  const minRandom = (generationNumber / totalIterations) / 2;
  const maxRandom = generationNumber / totalIterations;
  cellLabels.forEach( oneCellKey => genomeClassScores[oneCellKey] = {
    score: Math.random() * (maxRandom - minRandom) + minRandom, // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_number_between_two_values
    duration: 1,
    noteDelta: 0,
    velocity: 1
  } );
  return genomeClassScores;
};

const getDummyClassKeysWhereScoresAreElite = (cellLabels, generationNumber, totalIterations) => {
  console.log("generationNumber", generationNumber, "totalIterations", totalIterations);
  const numberOfClassKeys = Math.abs(totalIterations - generationNumber); // a batch run may cause generationNumber to exceed totalIterations
  const classKeysWhereScoresAreElite = new Array(numberOfClassKeys);
  for( let i = 0; i < numberOfClassKeys; i++ ) {
    const oneCellIndex = Math.floor(Math.random()*cellLabels.length);
    classKeysWhereScoresAreElite[i] = cellLabels[oneCellIndex];
  }
  return classKeysWhereScoresAreElite;
};

// read text from a file: if it doesn't exist, wait for it to be created and then read it
function readFromFileWhenItExists( filePath, tries ) {
  return new Promise( (resolve, reject) => {
    fs.readFile( filePath, 'utf8', (err, data) => {
      if( err ) {
        if( err.code === 'ENOENT' ) {
          if( tries < 60 ) {
            console.log(`waiting for ${filePath} to be created, tries: ${tries}`);
            setTimeout( () => {
              resolve( readFromFileWhenItExists(filePath, tries + 1) );
            }, 1000 );
          } else {
            console.log(`gave up on waiting for ${filePath} to be created, tries: ${tries}`);
            resolve(undefined);
          }
        } else {
          reject(err);
        }
      } else {
        resolve(data);
      }
    });
  });
}

function getWsServiceEndpointsFromClassConfiguration(classConfiguration) {
  if (!classConfiguration) {
    return {
      qualityFeatureExtractionEndpoint: "",
      projectionFeatureExtractionEndpoint: "",
      qualityFeatureType: "",
      projectionFeatureType: "",
      qualityEvaluationEndpoint: "",
      projectionEndpoint: "",
      shouldRetrainProjection: false,
      zScoreNormalisationReferenceFeaturesPaths: "",
      retrainWithAllDiscoveredFeatures: false,
      projectionRetrainingLinearGapIncrement: 10,
      shouldCalculateNovelty: false,
      shouldCalculateSurprise: false,
      shouldUseAutoEncoderForSurprise: false,
      qualityFromFeatures: false,
      usingQueryEmbeddings: false,
      sampleRate: 16000,
      shouldTrackDiversity: false,
      useNoveltyArchive: false, 
      inspirationRate: 0.1, 
      noveltyArchiveSizePercentage: 0.1,
      mapSelectorBias: MAP_SELECTOR_BIAS.PRODUCTIVITY,
      eliteRemappingCompetitionCriteria: ELITE_REMAPPING_COMPETITION_CRITERIA.SCORE,
      dynamicComponents: false,
    };
  }

  return {
    qualityFeatureExtractionEndpoint: classConfiguration.qualityFeatureExtractionEndpoint || classConfiguration.featureExtractionEndpoint,
    projectionFeatureExtractionEndpoint: classConfiguration.projectionFeatureExtractionEndpoint || classConfiguration.featureExtractionEndpoint,
    qualityFeatureType: classConfiguration.qualityFeatureType || classConfiguration.featureExtractionType,
    projectionFeatureType: classConfiguration.projectionFeatureType || classConfiguration.featureExtractionType,
    qualityEvaluationEndpoint: classConfiguration.qualityEvaluationEndpoint,
    projectionEndpoint: classConfiguration.projectionEndpoint,
    shouldRetrainProjection: classConfiguration.shouldRetrainProjection,
    zScoreNormalisationReferenceFeaturesPaths: classConfiguration.zScoreNormalisationReferenceFeaturesPaths ? classConfiguration.zScoreNormalisationReferenceFeaturesPaths.join(",") : "",
    retrainWithAllDiscoveredFeatures: classConfiguration.retrainWithAllDiscoveredFeatures,
    projectionRetrainingLinearGapIncrement: classConfiguration.projectionRetrainingLinearGapIncrement,
    shouldCalculateNovelty: classConfiguration.shouldCalculateNovelty,
    shouldCalculateSurprise: classConfiguration.shouldCalculateSurprise,
    shouldUseAutoEncoderForSurprise: classConfiguration.shouldUseAutoEncoderForSurprise,
    qualityFromFeatures: classConfiguration.qualityFromFeatures,
    usingQueryEmbeddings: classConfiguration.usingQueryEmbeddings,
    sampleRate: classConfiguration.sampleRate,
    shouldTrackDiversity: classConfiguration.shouldTrackDiversity,
    useNoveltyArchive: classConfiguration.useNoveltyArchive,
    inspirationRate: classConfiguration.inspirationRate,
    noveltyArchiveSizePercentage: classConfiguration.noveltyArchiveSizePercentage,
    mapSelectorBias: classConfiguration.mapSelectorBias,
    eliteRemappingCompetitionCriteria: classConfiguration.eliteRemappingCompetitionCriteria,
    dynamicComponents: classConfiguration.dynamicComponents,
  };
}