import fs from 'fs';
import { promises as fsPromise } from 'fs';
import path from 'path';
import {glob} from 'glob';
import {ulid} from 'ulid';
import Chance from 'chance';
import sample from "lodash-es/sample.js";
import toWav from 'audiobuffer-to-wav';
import { getAudioGraphMutationParams } from "./kromosynth.js";
import { yamnetTags } from 'kromosynth/workers/audio-classification/classificationTags.js';
import {
  getGenomeFromGenomeString, getNewAudioSynthesisGenomeByMutation,
  getAudioBufferFromGenomeAndMeta
} from 'kromosynth';
// import { callRandomGeneService } from './service/gene-random-worker-client.js';
import {
  callRandomGeneService,
  callGeneVariationService,
  callGeneEvaluationService,
  clearServiceConnectionList
} from './service/gRPC/gene_client.js';
import { 
  renderAndEvaluateGenomesViaWebsockets,
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet,
  getFeaturesFromWebsocket, getDiversityFromWebsocket, 
  getQualityFromWebsocket, getQualityFromWebsocketForEmbedding, addToQualityQueryEmbeddigs
} from './service/websocket/ws-gene-evaluation.js';
import {
  runCmd, runCmdAsync, readGenomeAndMetaFromDisk, getGenomeKey, calcStandardDeviation,
  writeEvaluationCandidateWavFilesForGenome,
  populateNewGenomeClassScoresInBatchIterationResultFromEvaluationCandidateWavFiles,
  invertedLogarithmicRamp,
  deleteAllGenomesNotInEliteMap, deleteAllGenomeRendersNotInEliteMap
} from './util/qd-common.js';
import { callGeneEvaluationWorker, callRandomGeneWorker, callGeneVariationWorker } from './service/workers/gene-child-process-forker.js';
import { get } from 'http';
import { add, e, i } from 'mathjs';
import { log } from 'console';
import { getAudioContext, getNewOfflineAudioContext } from './util/rendering-common.js';
import { calculateQDScoreForEliteMap, getCoverageForEliteMap } from './qd-run-analysis.js';

const chance = new Chance();

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
export async function qdSearch(
  evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters,
  exitWhenDone = true
  // seedEvals, terminationCondition, evoRunsDirPath
) {
  const {
    algorithm: algorithmKey,
    seedEvals, 
    eliteWinsOnlyOneCell, classRestriction,
    maxNumberOfParents,
    terminationCondition, scoreProportionalToNumberOfEvalsTerminationCondition,
    evoRunsDirPath, evoRendersDirPath,
    populationSize, gridDepth,
    geneEvaluationProtocol, childProcessBatchSize, 
    batchSize, batchMultiplicationFactor,
    evaluationCandidateWavFilesDirPath,
    probabilityMutatingWaveNetwork, probabilityMutatingPatch,
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
    dummyRun
  } = evolutionRunConfig;

  const classificationGraphModel = classifiers[classifierIndex];

  const startTimeMs = Date.now();

  let _geneVariationServers;
  if( gRpcHostFilePathPrefix && gRpcServerCount ) {
    _geneVariationServers = [];
    for( let i=1; i <= gRpcServerCount; i++ ) {
      const hostFilePath = `${gRpcHostFilePathPrefix}${i}`;
      const variationHost = await readFromFileWhenItExists(hostFilePath, 0);
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

  // initialise git
  const evoRunDirPath = `${evoRunsDirPath}${evolutionRunId}/`;
  const evoRenderDirPath = `${evoRendersDirPath}${evolutionRunId}/`;
  const evoRunFailedGenesDirPath = `${evoRunsDirPath}${evolutionRunId}_failed-genes/`;

  let eliteMap;
  let eliteMapMeta;
  let eliteMapIndex;
  let terrainName = undefined;
  let sampleRate;

  eliteMapMeta = readEliteMapMetaFromDisk( evolutionRunId, evoRunDirPath );
  if( ! eliteMapMeta ) {
    eliteMapIndex = 0
    eliteMapMeta = {
      eliteMapIndex
    };
    createEvoRunDir( evoRunDirPath );
    createEvoRunDir( evoRunFailedGenesDirPath );
    saveEliteMapMetaToDisk( eliteMapMeta, evoRunDirPath, evolutionRunId );
  } else {
    eliteMapIndex = eliteMapMeta.eliteMapIndex;
  }

  if( typeof classificationGraphModel === "object" && classificationGraphModel.hasOwnProperty("classConfigurations") ) {
    terrainName = classificationGraphModel.classConfigurations[eliteMapIndex].refSetName;
    sampleRate = classificationGraphModel.classConfigurations[eliteMapIndex].sampleRate;
  } else {
    sampleRate = renderSampleRateForClassifier;
  }

  eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName );
  if( ! eliteMap ) {
    let eliteMapContainer = initializeGrid( 
      evolutionRunId, algorithmKey, evolutionRunConfig, evolutionaryHyperparameters
    );

    runCmd(`git init ${evoRunDirPath}`);

    await saveEliteMapToDisk( eliteMapContainer, evoRunDirPath, evolutionRunId, undefined /* terrainName */, true /* addToGit */);

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

  let cellFeatures = readCellFeaturesFromDisk( evolutionRunId, evoRunDirPath );
  if( ! cellFeatures ) {
    cellFeatures = {};
  }

  let seedFeaturesAndScores = [];

  while( 
      ! shouldTerminate(terminationCondition, eliteMap, dummyRun)
      &&
      ! ( batchDurationMs && batchDurationMs < Date.now() - startTimeMs )
  ) {

    // optionally ramping up the fitness values, to avoid premature convergence
    let scoreProportion;
    if( scoreProportionalToNumberOfEvalsTerminationCondition && terminationCondition.numberOfEvals ) {
      scoreProportion = invertedLogarithmicRamp(eliteMap.generationNumber*searchBatchSize, terminationCondition.numberOfEvals);
    } else {
      scoreProportion = 1.0;
    }

    // check if we should switch maps
    if( classesAsMaps && shouldSwitchMap(eliteMap, mapSwitchingCondition) ) {

      // reset map switching conditions in map and save it
      eliteMap.coverageWithoutIncreaseGenerations = 0;
      eliteMap.qdScoreWithoutIncreaseGenerations = 0;
      await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName );

      // randomly select next elite map index, which is not the current one
      const eliteMapCount = classificationGraphModel.classConfigurations.length;
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
        saveEliteMapMetaToDisk( eliteMapMeta, evoRunDirPath, evolutionRunId );

        // let's get the features and scores from the current map, before switching
        // - using nextElite's refSetEmbedsPath to get the quality / fitness according to that one, before projecting individuals to the new map
        const refSetEmbedsPath = classificationGraphModel.classConfigurations[eliteMapIndex].refSetEmbedsPath;
        const refSetName = classificationGraphModel.classConfigurations[eliteMapIndex].refSetName;
        seedFeaturesAndScores = await getFeaturesAndScoresFromEliteMap( 
          eliteMap, cellFeatures,
          _evaluationQualityServers, evolutionRunId, evoRunDirPath,
          scoreProportion,
          ckptDir, measureCollectivePerformance,
          refSetEmbedsPath, refSetName
        );

        // eliteMap = eliteMapContainer[eliteMapIndex];
        terrainName = classificationGraphModel.classConfigurations[eliteMapIndex].refSetName;
        sampleRate = classificationGraphModel.classConfigurations[eliteMapIndex].sampleRate;
        eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName );
        // eliteMap.generationNumber++; // increment the generation number, as the increment at the end of last batch iteration happened after last save
        eliteMap.mapSwitchLog.push({
          previousMapGeneration: currentMapGeneration,
          previousMapId: currentMapId,
          nextMapGeneration: eliteMap.generationNumber,
          nextMapId: eliteMap._id
        });
        eliteMap.isBeingSwitchedToFromAnotherMap = true;
      } else {
        console.log("only one map, not switching");
      }
    } else if( eliteMap.isBeingSwitchedToFromAnotherMap ) {
      const refSetEmbedsPath = classificationGraphModel.classConfigurations[eliteMapIndex].refSetEmbedsPath;
      seedFeaturesAndScores = await getFeaturesAndScoresFromEliteMap( 
        eliteMap, cellFeatures,
        _evaluationQualityServers, evolutionRunId, evoRunDirPath,
        scoreProportion,
        ckptDir, measureCollectivePerformance,
        refSetEmbedsPath
      );
    }

    const batchStartTimeMs = performance.now();

    console.log("algorithmKey",algorithmKey);
    if( algorithmKey === "mapElites_with_uBC" ) {
      await mapElitesBatch(
        eliteMap, eliteMapIndex, cellFeatures, seedFeaturesAndScores, terrainName,
        algorithmKey, evolutionRunId,
        commitEliteMapToGitEveryNIterations, addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
        renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
        searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
        maxNumberOfParents,
        probabilityMutatingWaveNetwork, probabilityMutatingPatch,
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

  } // while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
  if( ! (batchDurationMs && batchDurationMs < Date.now() - startTimeMs) ) {
    // process not stopped due to time limit, but should now have reached a general termination condition
    eliteMap.terminated = true;
    await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName );
    console.log("eliteMap",eliteMap);
    // collect git garbage - UPDATE: this should be run separately, as part of one of the qd-run-analysis routines:
    // runCmdAsync(`git -C ${evoRunDirPath} gc`);
  }
  // if( exitWhenDone ) process.exit();
}

async function mapElitesBatch(
  eliteMap, eliteMapIndex, cellFeatures, seedFeaturesAndScores, terrainName,
  algorithmKey, evolutionRunId,
  commitEliteMapToGitEveryNIterations, addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
  renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
  searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
  maxNumberOfParents,
  probabilityMutatingWaveNetwork, probabilityMutatingPatch,
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
  let searchPromises;
  const isUnsupervisedDiversityEvaluation = (_evaluationFeatureServers && _evaluationFeatureServers.length > 0) &&
    (_evaluationProjectionServers && _evaluationProjectionServers.length > 0) &&
    (_evaluationQualityServers && _evaluationQualityServers.length > 0);

  const isSeedRound = (eliteMap.generationNumber*searchBatchSize) < seedEvals;
  
  const shouldPopulateCellFeatures = eliteMap.isBeingSwitchedToFromAnotherMap || 
    (! isSeedRound && isUnsupervisedDiversityEvaluation && ! Object.keys(cellFeatures).length && seedFeaturesAndScores.length);

  if( shouldPopulateCellFeatures ) {
    // seed rounds are over, we're doing unsupervised diversity evaluation, but we haven't yet projected the features:
    // - so far the have been collected: let's project the whole collection
    searchPromises = new Array( seedFeaturesAndScores.length );
    const seedFeatureClassKeys = await getClassKeysFromSeedFeatures(
      seedFeaturesAndScores, _evaluationProjectionServers[0], evoRunDirPath, classScoringVariationsAsContainerDimensions, eliteMap
    );
    for( let i=0; i < seedFeaturesAndScores.length; i++ ) {
      searchPromises[i] = new Promise( async (resolve, reject) => {
        const seedFeatureAndScore = seedFeaturesAndScores[i];
        const { 
          genomeId, genomeString,
          fitness, duration, noteDelta, velocity
        } = seedFeatureAndScore;
        let score;
        if( getIsTopScoreFitnessWithAssociatedClass(fitness) ) {
          score = fitness.top_score;
          seedFeatureClassKeys[i] = seedFeatureClassKeys[i] + `_${fitness.top_score_class}`;
        } else {
          score = fitness;
        }
        const classKey = seedFeatureClassKeys[i];
        const newGenomeClassScores = { [classKey]: {
          score, duration, noteDelta, velocity,
          features: seedFeatureAndScore.features,
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
    eliteMap.lastProjectionFitIndex = getNextFitGenerationIndex( (eliteMap.generationNumber*searchBatchSize) + seedFeaturesAndScores.length );

  } else {

    searchPromises = new Array(searchBatchSize);

    let featureExtractionEndpoint;
    let qualityEvaluationEndpoint;
    let projectionEndpoint;
    if( classificationGraphModel.classConfigurations && classificationGraphModel.classConfigurations.length ) {
      featureExtractionEndpoint = classificationGraphModel.classConfigurations[eliteMapIndex].featureExtractionEndpoint;
      qualityEvaluationEndpoint = ""; // TODO: not using for now: classificationGraphModel.classConfigurations[eliteMapIndex].qualityEvaluationEndpoint;
      projectionEndpoint = ""; // TODO: not using for now: classificationGraphModel.classConfigurations[eliteMapIndex].projectionEndpoint;
    } else {
      featureExtractionEndpoint = "";
      qualityEvaluationEndpoint = "";
      projectionEndpoint = "";
    }

    if( isUnsupervisedDiversityEvaluation && _evaluationFeatureServers && _evaluationFeatureServers.length ) {
      await populateAndSaveCellFeatures( 
        eliteMap, cellFeatures, 
        classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
        _geneRenderingServers, renderSampleRateForClassifier,
        _evaluationFeatureServers,
        evoRunDirPath, evolutionRunId,
        ckptDir,
        featureExtractionEndpoint
      );
    }
    for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

      console.log("batchIteration", batchIteration);
      let geneVariationServerHost;
      let geneRenderingServerHost;
      let geneEvaluationServerHost;
      if( dummyRun ) {
        geneVariationServerHost = _geneVariationServers[0];
        geneRenderingServerHost = _geneVariationServers[0];
        geneEvaluationServerHost = _geneEvaluationServers[0];
      } else {
        geneVariationServerHost = _geneVariationServers[ batchIteration % _geneVariationServers.length ];
        geneRenderingServerHost = _geneRenderingServers[ batchIteration % _geneRenderingServers.length ];
        if( _geneEvaluationServers && _geneEvaluationServers.length ) {
          // we're using a pre-trained classification for the diversity projection and quality evaluation
          geneEvaluationServerHost = _geneEvaluationServers[ batchIteration % _geneEvaluationServers.length ];
        } else if( isUnsupervisedDiversityEvaluation ) {
          // using feature extraction and dimensionality reduction for diversity projection and a separate quality evaluation service
          geneEvaluationServerHost = {
            feature: _evaluationFeatureServers[ batchIteration % _evaluationFeatureServers.length ] + featureExtractionEndpoint,
            projection: _evaluationProjectionServers[ batchIteration % _evaluationProjectionServers.length ] + projectionEndpoint,
            quality: _evaluationQualityServers[ batchIteration % _evaluationQualityServers.length ] + qualityEvaluationEndpoint
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
              newGenomeString = await callRandomGeneService(
                evolutionRunId, eliteMap.generationNumber, evolutionaryHyperparameters,
                geneVariationServerHost
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
          // else {
          //   const genome = getNewAudioSynthesisGenome(
          //     evolutionRunId,
          //     generationNumber,
          //     undefined,
          //     evolutionaryHyperparameters
          //   );
          //   newGenomeString = JSON.stringify(genome);
          // }
  
          } else {
            ///// selection
            let classKeys;
            if( classRestriction && classRestriction.length ) {
              console.log("classRestriction:", classRestriction);
              classKeys = classRestriction;
            } else if( eliteWinsOnlyOneCell || isUnsupervisedDiversityEvaluation ) {
              // select only cell keys where the elts attribute referes to a non-empty array
              classKeys = Object.keys(eliteMap.cells).filter( ck => eliteMap.cells[ck].elts.length > 0 );
            } else {
              classKeys = Object.keys(eliteMap.cells);
            }
            const classBiases = classKeys.map( ck =>
              undefined === eliteMap.cells[ck].uBC ? 10 : eliteMap.cells[ck].uBC
            );
            const nonzeroClassBiasCount = classBiases.filter(b => b > 0).length;
            
            let numberOfParentGenomes = Math.floor(Math.random() * (maxNumberOfParents - 1 +1)) + 1; // https://stackoverflow.com/a/1527820/169858
            console.log("numberOfParentGenomes", numberOfParentGenomes);
            const randomClassKeys = [];
            // TODO: match diverse parents together, rather than just picking randomly
            // - maybe by picking most distant elites in an unsupervised feature space
            // - possibly something like this: https://dl.acm.org/doi/10.1145/3449726.3459431
            for( let i=0; i < numberOfParentGenomes; i++ ) {
              if( nonzeroClassBiasCount > 0 ) {
                randomClassKey = chance.weighted(classKeys, classBiases);
              } else { // if all are zero or below, .weighted complains
                randomClassKey = chance.pickone(classKeys);
              }
              randomClassKeys.push(randomClassKey);
            }
  
            const classEliteGenomeStrings = [];
            for( const randomClassKey of randomClassKeys ) {
              const {
                // genome: classEliteGenomeId,
                // score,
                // generationNumber
                g: classEliteGenomeId,
                s,
                gN
              } = getCurrentClassElite(randomClassKey, eliteMap);
              classEliteGenomeStrings.push( await readGenomeAndMetaFromDisk( evolutionRunId, classEliteGenomeId, evoRunDirPath ) );
              parentGenomes.push( {
                genomeId: classEliteGenomeId,
                eliteClass: randomClassKey,
                // score, generationNumber,
                s, gN,
              } );
            }
  
            if( dummyRun ) {
              newGenomeString = classEliteGenomeStrings[0];
            } else {
  
            try {
              ///// variation
              if( geneEvaluationProtocol === "grpc" || geneEvaluationProtocol === "websocket" ) {
                try {
                  newGenomeString = await callGeneVariationService(
                    classEliteGenomeStrings,
                    evolutionRunId, eliteMap.generationNumber, algorithmKey,
                    probabilityMutatingWaveNetwork,
                    probabilityMutatingPatch,
                    audioGraphMutationParams,
                    evolutionaryHyperparameters,
                    patchFitnessTestDuration,
                    geneVariationServerHost
                  );  
                } catch (e) {
                  console.error("Error from callGeneVariationService", e);
                  clearServiceConnectionList(geneVariationServerHost);
                  reject(e);
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
            }
          }
        } // if( isSeedRound ) {  } else { 
  
        const genomeId = ulid();
  
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
                      measureCollectivePerformance, ckptDir, evoRunDirPath
                    );
                    seedFeaturesAndScores.push(seedGenomeScoreAndFeatures);
                    await saveGenomeToDisk( await getGenomeFromGenomeString(newGenomeString), evolutionRunId, genomeId, evoRunDirPath, addGenomesToGit );
                  }
                }
              }
              resolve({genomeId, newGenomeString, seedFeaturesAndScores}); // really just used to increment eliteMap.genertionNumber in the Promise.all iterations below

            } else {

              const generationIncrement = eliteMap.generationNumber + batchIteration; // TODO: remove
              // const shouldFit = getShouldFit(eliteMap.lastProjectionFitIndex, generationIncrement);
              // TODO fitting in a batch iteration is not ideal, at least when waiting time me result in in a Promise timeout?
              const shouldFit = false; // TOODO: need to refactor getGenomeClassScoresByDiversityProjectionWithNewGenomes
              
              if( classScoringVariationsAsContainerDimensions ) {
                newGenomeClassScores = {};
                let iterationIncrement = 0;
                for( const oneDuration of classScoringDurations ) {
                  for( const oneNoteDelta of classScoringNoteDeltas ) {
                    for( const oneVelocity of classScoringVelocities ) {
                      geneEvaluationServerHost = {
                        feature: _evaluationFeatureServers[ (batchIteration + iterationIncrement) % _evaluationFeatureServers.length ],
                        projection: _evaluationProjectionServers[ (batchIteration + iterationIncrement) % _evaluationProjectionServers.length ],
                        quality: _evaluationQualityServers[ (batchIteration + iterationIncrement) % _evaluationQualityServers.length ]
                      };
                      const oneClassKeySuffix = `_${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
                      // await populateAndSaveCellFeatures( 
                      //   eliteMap, cellFeatures, 
                      //   oneDuration, oneNoteDelta, oneVelocity, useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
                      //   geneRenderingServerHost, renderSampleRateForClassifier,
                      //   geneEvaluationServerHost.feature,
                      //   evoRunDirPath, evolutionRunId 
                      // );
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
                        geneEvaluationServerHost.projection,
                        eliteMap, eliteMapIndex,
                        cellFeatures,
                        evolutionRunId, evoRunDirPath,
                        scoreProportion,
                        shouldFit, generationIncrement,
                        measureCollectivePerformance, ckptDir
                      ).catch( e => {
                        console.error("Error getting genome class scores by diversity projection with new genomes", e);
                        reject(e);
                      });
                      for( const oneClassKey in oneCombinationClassScores ) { // TODO: here this will just be one iteration for now
                        const oneClassScores = oneCombinationClassScores[oneClassKey];
                        const oneClassKeyWithSuffix = oneClassKey + oneClassKeySuffix;
                        newGenomeClassScores[ oneClassKeyWithSuffix ] = oneClassScores;
                      }
                      iterationIncrement++;
                    }
                  }
                }
              } else {
                // await populateAndSaveCellFeatures( 
                //   eliteMap, cellFeatures, 
                //   classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
                //   geneRenderingServerHost, renderSampleRateForClassifier,
                //   geneEvaluationServerHost.feature,
                //   evoRunDirPath, evolutionRunId 
                // );
                newGenomeClassScores = await getGenomeClassScoresByDiversityProjectionWithNewGenomes(
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
                  geneEvaluationServerHost.projection,
                  eliteMap, eliteMapIndex,
                  cellFeatures,
                  evolutionRunId, evoRunDirPath,
                  scoreProportion,
                  shouldFit, generationIncrement,
                  measureCollectivePerformance, ckptDir
                ).catch( e => {
                  console.error("Error getting genome class scores by diversity projection with new genomes", e);
                  reject(e);
                });
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
                    const oneClassKeySuffix = `_${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
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
                      geneEvaluationServerHost
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
                geneEvaluationServerHost
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
            newGenomeClassScores && newGenomeClassScores.length === 1 ? /* one feature mapping for the new genome */
              newGenomeClassScores[0].score
            :
            newGenomeClassScores && newGenomeClassScores["Music"] ? newGenomeClassScores["Music"].score : newGenomeClassScores && Object.keys(newGenomeClassScores)[0] ? newGenomeClassScores[Object.keys(newGenomeClassScores)[0]].score : "N/A"
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
  await Promise.all( searchPromises ).then( async (batchIterationResults) => {

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
    let genomeIdToGenome = {};

    let classToBatchEliteCandidates = {};
    let cellKeyToExistingEliteGenomeId = {};
    // let eliteCountAtGeneration = 0;
    for( let batchResultIdx = 0; batchResultIdx < batchIterationResults.length; batchResultIdx++ ) {

      const {
        genomeId, randomClassKey, newGenomeString, newGenomeClassScores, parentGenomes,
        seedFeaturesAndScores
      } = batchIterationResults[batchResultIdx];

      ///// add to archive

      // newGenomeClassScores !== undefined will be undefined during seed rounds
      if( newGenomeClassScores !== undefined && Object.keys(newGenomeClassScores).length ) {
        const getClassKeysWhereScoresAreEliteStartTime = performance.now();
        let eliteClassKeys;
        if( dummyRun && dummyRun.iterations ) {
          eliteClassKeys = getDummyClassKeysWhereScoresAreElite( Object.keys(eliteMap.cells), eliteMap.generationNumber, dummyRun.iterations );
        } else {
          eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap, eliteWinsOnlyOneCell, classRestriction );
        }
        const getClassKeysWhereScoresAreEliteEndTime = performance.now();
        console.log("getClassKeysWhereScoresAreElite duration", getClassKeysWhereScoresAreEliteEndTime - getClassKeysWhereScoresAreEliteStartTime);
        if( eliteClassKeys.length > 0 ) {
          if( eliteClassKeys.length > 1 ) {
            console.log("eliteClassKeys", eliteClassKeys);
          }
          // const classScoresSD = getClassScoresStandardDeviation( newGenomeClassScores );
          // console.log("classScoresSD", classScoresSD);
          eliteMap.newEliteCount = eliteClassKeys.length;

          let newGenome;
          if( genomeIdToGenome[genomeId] === undefined ) {
            const getGenomeFromGenomeStringStartTime = performance.now();
            newGenome = await getGenomeFromGenomeString( newGenomeString );
            genomeIdToGenome[genomeId] = newGenome;
            const getGenomeFromGenomeStringEndTime = performance.now();
            console.log("getGenomeFromGenomeString duration", getGenomeFromGenomeStringEndTime - getGenomeFromGenomeStringStartTime);
          } else {
            newGenome = genomeIdToGenome[genomeId];
          }

          if( ! newGenome.tags ) newGenome.tags = [];
          newGenome.parentGenomes = parentGenomes.length ? parentGenomes : undefined;
          newGenome.generationNumber = eliteMap.generationNumber;
          const eliteMapUpdateStartTime = performance.now();
          for( const classKey of eliteClassKeys ) {
            cellKeyToExistingEliteGenomeId[classKey] = eliteMap.cells[classKey].elts.length ? eliteMap.cells[classKey].elts[0].g : undefined;
            const {score, duration, noteDelta, velocity} = newGenomeClassScores[classKey];
            const updated = Date.now();

            eliteMap.cells[classKey].elts = [{
              g: genomeId,
              s: score, // score: score.toFixed(4),
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

            const { features, embedding } = newGenomeClassScores[classKey];
            cellFeatures[classKey] = { features, embedding };

            classToBatchEliteCandidates[classKey] = {
              genomeId,
              // genome: newGenome
            };
            // eliteCountAtGeneration++;
          }
          const eliteMapUpdateEndTime = performance.now();
          console.log("eliteMapUpdate duration", eliteMapUpdateEndTime - eliteMapUpdateStartTime);
          
          if( randomClassKey ) {
            eliteMap.cells[randomClassKey].uBC = 10;
          }
          if( renderElitesToWavFiles ) {
            const oneClassScore = newGenomeClassScores[eliteClassKeys[0]].score;
            renderEliteGenomeToWavFile(
              newGenome, genomeId, eliteClassKeys.join("__"), eliteMap.generationNumber, oneClassScore, evoRenderDirPath,
              classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs
            );
          }
        } else if( randomClassKey && ! shouldPopulateCellFeatures /* defined way up there ^ 🤣 */ ) { // if( eliteClassKeys.length > 0 ) {

          // bias search away from exploring niches that produce fewer innovations
          eliteMap.cells[randomClassKey].uBC -= 1; // TODO should stop at zero?
        }

      } else if( seedFeaturesAndScores !== undefined && seedFeaturesAndScores.length ) { // if( newGenomeClassScores !== undefined ) {
        // we have scores and features from a seed round
        // eliteMap.generationNumber++;
      }

    } // for( let oneBatchIterationResult of batchIterationResults ) {

    for( let oneGenomeId in genomeIdToGenome ) {
      const saveGenomeToDiskStartTime = performance.now();
      await saveGenomeToDisk( genomeIdToGenome[oneGenomeId], evolutionRunId, oneGenomeId, evoRunDirPath, addGenomesToGit );
      const saveGenomeToDiskEndTime = performance.now();
      console.log("saveGenomeToDisk duration", saveGenomeToDiskEndTime - saveGenomeToDiskStartTime);
    }
    genomeIdToGenome = undefined; // attempt to free up memory

    let batchEliteIndex = 0;
    for( let oneNewEliteClass in classToBatchEliteCandidates ) {
      let { 
        // genome, 
        genomeId 
      } = classToBatchEliteCandidates[oneNewEliteClass];
      // add this genome's features to the quality query embeddings, if using classConfigurations, by calling /add-to-query-embeddings websocket endpoint
      if( eliteMap.classConfigurations && eliteMap.classConfigurations.length ) {
        const refSetName = eliteMap.classConfigurations[0].refSetName;
        const existingGenomeIdAtClass = cellKeyToExistingEliteGenomeId[oneNewEliteClass];
        const querySetEmbedsPath = getQuerySetEmbedsPath( evoRunDirPath, refSetName );
        const evaluationQualityHost = _evaluationQualityServers[ batchEliteIndex % _evaluationQualityServers.length ];
        addToQualityQueryEmbeddigs(
          cellFeatures[oneNewEliteClass].embedding, // added to cellFeatures in the iteration above
          genomeId, existingGenomeIdAtClass,
          querySetEmbedsPath,
          evaluationQualityHost
        );
      }
      batchEliteIndex++;
    }
    eliteMap.eliteCountAtGeneration = Object.keys(classToBatchEliteCandidates).length;
    classToBatchEliteCandidates = undefined; // attempt to free up memory

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

  eliteMap.generationNumber++;

  const shouldFit = getShouldFit(eliteMap.lastProjectionFitIndex, eliteMap.generationNumber*searchBatchSize); // eliteMap.generationNumber*searchBatchSize === iterationNumber
  if( isUnsupervisedDiversityEvaluation && ! isSeedRound && shouldFit ) {
    await retrainProjectionModel( cellFeatures, eliteMap, _evaluationProjectionServers, evoRunDirPath );
  }

  if( shouldRenderWaveFiles ) {
    await renderEliteMapToWavFiles(
      eliteMap, evolutionRunId, evoRunDirPath, evoRenderDirPath, eliteMap.generationNumber,
      classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
      _geneRenderingServers, renderSampleRateForClassifier
    );
  }

  eliteMap.searchBatchSize = searchBatchSize;
  eliteMap.timestamp = Date.now();

  const saveEliteMapToDiskStartTime = performance.now();
  await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName ); // the main / latest map
  const saveEliteMapToDiskEndTime = performance.now();
  console.log("saveEliteMapToDisk duration", saveEliteMapToDiskEndTime - saveEliteMapToDiskStartTime);

  const commitEliteMapToGitStartTime = performance.now();
  if( commitEliteMapToGitEveryNIterations && eliteMap.generationNumber % commitEliteMapToGitEveryNIterations === 0 ) {
    // git commit iteration
    runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);
  }
  const commitEliteMapToGitEndTime = performance.now();
  console.log("commitEliteMapToGit duration", commitEliteMapToGitEndTime - commitEliteMapToGitStartTime);

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
      genomeString = await readGenomeAndMetaFromDisk( evolutionRunId, eliteGenomeId, evoRunDirPath );
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
  const audioBuffer = await getAudioBufferFromGenomeAndMeta(
    {genome: genome, meta: {duration, noteDelta, velocity}},
    duration, noteDelta, velocity, 
    false, // reverse,
    false, // asDataArray
    getNewOfflineAudioContext( duration ),
    getAudioContext(),
    true, // useOvertoneInharmonicityFactors
    useGPU, // useGPU
    antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs
  );
  if( !fs.existsSync(evoRenderDirPath) ) fs.mkdirSync(evoRenderDirPath, {recursive: true});
  // replace commas in classKey with underscores (AudioStellar doesn't like commas in file names)
  let classKeySansCommas = classKey.replace(/,/g, "_");
  let filePath = path.join(evoRenderDirPath, `${Math.round(score*100)}_${iteration}_${classKeySansCommas}_${eliteGenomeId}.wav`);
  console.log("writing wav file to", filePath, "for elite genome", eliteGenomeId);
  let wav = toWav(audioBuffer);
  let wavBuffer = Buffer.from(new Uint8Array(wav));
  fs.writeFileSync( filePath, wavBuffer );
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
  geneEvaluationServerHost
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
          await saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
        );
      }
    );
  } else if( geneEvaluationProtocol === "websocket" ) {
    newGenomeClassScores = await renderAndEvaluateGenomesViaWebsockets(
      newGenomeString,
      classScoringDurations,
      classScoringNoteDeltas,
      classScoringVelocities,
      useGPU,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs,
      geneRenderingServerHost, renderSampleRateForClassifier,
      geneEvaluationServerHost
    ).catch(
      e => {
        console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
        getGenomeFromGenomeString( newGenomeString ).then( async failedGenome =>
          await saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
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
  featureExtractionEndpoint
) {
  let cellKeyIndex = 0;
  for( const cellKey in eliteMap.cells ) {
    const cell = eliteMap.cells[cellKey];
    if( cell.elts && cell.elts.length && ! cellFeatures[cellKey] ) {
      const cellGenomeId = cell.elts[0].g;
      const cellGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, cellGenomeId, evoRunDirPath );
      const audioBuffer = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
        cellGenomeString,
        duration,
        noteDelta,
        velocity,
        useGPU,
        antiAliasing,
        frequencyUpdatesApplyToAllPathcNetworkOutputs,
        geneRenderingServerHosts[cellKeyIndex % geneRenderingServerHosts.length], renderSampleRateForClassifier
      );
      const featuresResponse = await getFeaturesFromWebsocket(
        audioBuffer,
        evaluationFeatureExtractionHosts[cellKeyIndex % evaluationFeatureExtractionHosts.length] + featureExtractionEndpoint,
        ckptDir,
        renderSampleRateForClassifier
      );
      const { features, embedding } = featuresResponse;
      const cellGenomeFeatures = { features, embedding };
      cellFeatures[cellKey] = cellGenomeFeatures;

      cellKeyIndex++;
    }
  }
  const terrainName = eliteMap.classConfigurations && eliteMap.classConfigurations.length ? eliteMap.classConfigurations[0].refSetName : undefined;
  saveCellFeaturesToDisk( cellFeatures, eliteMap.generationNumber, evoRunDirPath, evolutionRunId, terrainName );
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
  genomeStrings,
  durations, 
  noteDeltas,
  velocities,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingServerHost, renderSampleRateForClassifier,
  evaluationFeatureExtractionHost,
  evaluationQualityHost,
  evaluationDiversityHost,
  eliteMap, eliteMapIndex,
  cellFeatures,
  evolutionRunId, evoRunDirPath,
  scoreProportion,
  shouldFit, modelFitGeneration,
  measureCollectivePerformance, ckptDir
) {
  // not supporting arrays of durations, noteDeltas and velocities for now, as is done in getGenomeClassScores
  const duration = Array.isArray(durations) ? durations[0] : durations;
  const noteDelta = Array.isArray(noteDeltas) ? noteDeltas[0] : noteDeltas;
  const velocity = Array.isArray(velocities) ? velocities[0] : velocities;

  const cellFitnessValues = await getCellFitnessValues( eliteMap );

  const { classConfigurations } = eliteMap;
  const pcaComponents = classConfigurations && classConfigurations.length ? classConfigurations[0].pcaComponents : undefined;

  const newGenomesFeatures = [];
  const newGenomesEmbedding = [];
  const newGenomesFitnessValues = [];
  // get the feature vector for the new genomes
  for( const genomeString of genomeStrings ) {

    const audioBuffer = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
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
    // console.log("--- getGenomeClassScoresByDiversityProjectionWithNewGenomes audioBuffer", audioBuffer);

    if( audioBuffer && audioBuffer.length && ! audioBuffer.some( value => isNaN(value) ) ) {

      const { features, embedding, quality } = await getFeaturesAndScoreForAudioBuffer(
        audioBuffer,
        evaluationFeatureExtractionHost, evaluationQualityHost,
        classConfigurations, eliteMapIndex,
        measureCollectivePerformance, ckptDir, evoRunDirPath
      );
      newGenomesFeatures.push( features );
      newGenomesEmbedding.push( embedding );
      let newGenomeQuality = quality;
      
// console.log("----------- features",features);
// console.log("----------- embedding",embedding);
// console.log("----------- newGenomeQuality",newGenomeQuality)

      const isTopScoreFitnessWithAssociatedClass = getIsTopScoreFitnessWithAssociatedClass( newGenomeQuality.fitness );
      if( isTopScoreFitnessWithAssociatedClass ) {
        newGenomeQuality.fitness.top_score = newGenomeQuality.fitness.top_score * scoreProportion;
        newGenomesFitnessValues.push( newGenomeQuality.fitness );
      } else {
        newGenomesFitnessValues.push( newGenomeQuality.fitness * scoreProportion );
      }
    }
  }

  const newGenomeClassScores = {};

  if( shouldFit ) {
    // let's blast all available features into the diversity projection, and then pick the new genome projections from the result

    console.log(`Retraining projection after generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`);

    const cellKeysWithFeatures = Object.keys(cellFeatures);
    const allFeaturesToProject = [];
    for( const cellKeyWithFeatures of cellKeysWithFeatures ) {
      allFeaturesToProject.push( cellFeatures[cellKeyWithFeatures] );
    }
    for( const newGenomeFeatures of newGenomesFeatures ) {
      allFeaturesToProject.push( newGenomeFeatures );
    }
  
    const allFitnessValues = [];
    for( const cellFitnessValue of cellFitnessValues ) {
      allFitnessValues.push( cellFitnessValue );
    }
    for( const newGenomeFitnessValue of newGenomesFitnessValues ) {
      allFitnessValues.push( newGenomeFitnessValue );
    }
  
    if( cellFitnessValues.length < allFitnessValues.length ) { // some genomes were successfully rendered
  
      // // assume classificationGraphModel is an array defining the grid dimensions and size, like [10,10] or [10,10,10]
      // if( eliteMap.generationNumber < classificationGraphModel.length ) {
      //   // if this is the first generation, just add the first new genome (somewhere!) to the elite map
      //   // - the projection requires at least n genomes, where n is the number of dimensions in the grid
      //   const randomClassKey = chance.pickone( Object.keys(eliteMap.cells) );
      //   newGenomeClassScores[ randomClassKey ] = {
      //     score: allFitnessValues[0],
      //     duration,
      //     noteDelta,
      //     velocity,
      //     features: newGenomesFeatures[0]
      //   };
      // } else {
  
        // call the diversity projection service
        const diversityProjection = await getDiversityFromWebsocket(
          allFeaturesToProject,
          undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
          evaluationDiversityHost,
          evoRunDirPath,
          shouldFit,
          pcaComponents
        ).catch(e => {
          console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
        });
        // console.log("--- getGenomeClassScoresByDiversityProjectionWithNewGenomes diversityProjection", diversityProjection);
        let featureMap;
        if( diversityProjection.status === "ERROR" ) {
          throw new Error("Error in diversity projection");
        } else {
          featureMap = diversityProjection.feature_map;
        }
  
        // work the new projection into the elite map
        // - basing on the array element ordering:
        // - - the first Object.keys(cellFeatures).length (or cellFitnessValues.length) elements are the cells that were already in the elite map
        // - - the remaining elements are the new genomes
        // - - so we can iterate over the new genomes and add them to the elite map
        // - - iff their index is in indices_to_keep
        // TODO: for now this will just be one iteration, as we're just evlauating one genome at a time within the current framework
  
        // TODO: start the iteration after cellKeysWithFeatures.length, as we're not using fitness values for unique cell projection for now
  
        for( let i = cellFitnessValues.length; i < allFitnessValues.length; i++ ) {

          const newGenomeFitnessValue = allFitnessValues[i];
          let score;
          if( getIsTopScoreFitnessWithAssociatedClass( newGenomeFitnessValue ) ) {
            score = newGenomeFitnessValue.top_score;
            featureMap[i].push( newGenomeFitnessValue.top_score_class );
          } else {
            score = newGenomeFitnessValue;
          }
          const newGenomeFeatureVector = allFeaturesToProject[i];

          const diversityMapKey = featureMap[i].join("_");

          newGenomeClassScores[ diversityMapKey ] = {
            score,
            duration,
            noteDelta,
            velocity,
            features: newGenomeFeatureVector
          };
        }
      // }
      eliteMap.projectionSizes.push( featureMap.length );
    }

    eliteMap.lastProjectionFitIndex++;
    eliteMap.projectionModelFitGenerations.push( modelFitGeneration );
    

  } else {
    // assume we already have a trained projection model, and just project the new genome features
    const diversityProjection = await getDiversityFromWebsocket(
      newGenomesFeatures,
      undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
      evaluationDiversityHost,
      evoRunDirPath,
      shouldFit, // this should be false
      pcaComponents
    ).catch(e => {
      console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
    });
    for( let i = 0; i < newGenomesFeatures.length; i++ ) {
      const newGenomeFitnessValue = newGenomesFitnessValues[i];

      let score;
      if( getIsTopScoreFitnessWithAssociatedClass( newGenomeFitnessValue ) ) {
        score = newGenomeFitnessValue.top_score;
        // let's add the class to the diversityMapKey as another dimension
        diversityProjection.feature_map[i].push( newGenomeFitnessValue.top_score_class );
      } else {
        score = newGenomeFitnessValue;
      }
      const newGenomeFeatureVector = newGenomesFeatures[i];
      const newGenomeEmbedding = newGenomesEmbedding[i];

      const diversityMapKey = diversityProjection.feature_map[i].join("_");

      // TODO: this is premature, as this individual genome is not yet in the elite map; is handled in the batchIterationResults round
      // cellFeatures[diversityMapKey] = {
      //   features: newGenomeFeatureVector,
      //   embedding: newGenomeEmbedding
      // };
      
      newGenomeClassScores[ diversityMapKey ] = {
        score,
        duration,
        noteDelta,
        velocity,
        features: newGenomeFeatureVector,
        embedding: newGenomeEmbedding
      };
    }
  }
  // TODO: this is dependent on only one genome being evaluated at a time (so the for loop above is pointless atm):
  // - might want to return an array of newGenomeClassScores, one for each genomeString
  // - then the search promise in each batchIteration would need to resolve with an array of newGenomeClassScores
  return newGenomeClassScores;
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
  measureCollectivePerformance, ckptDir, evoRunDirPath
) {
  const audioBuffer = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
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

    const { features, embedding, quality } = await getFeaturesAndScoreForAudioBuffer(
      audioBuffer,
      evaluationFeatureExtractionHost, evaluationQualityHost,
      classConfigurations, eliteMapIndex,
      measureCollectivePerformance, ckptDir, evoRunDirPath
    );
    newGenomeFeatureVector = features;
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
    genomeString,
    fitness,
    duration,
    noteDelta,
    velocity,
    features: newGenomeFeatureVector,
    embedding: newGenomeEmbedding
  };
}

function getQuerySetEmbedsPath( evoRunDirPath, refSetName ) {
  return evoRunDirPath + `${refSetName}__query_set_embeds.npy`;
}

async function getFeaturesAndScoreForAudioBuffer(
  audioBuffer,
  evaluationFeatureExtractionHost, evaluationQualityHost,
  classConfigurations, eliteMapIndex, 
  measureCollectivePerformance, ckptDir, evoRunDirPath
) {
  let qualityFromEmbeds = false;
  let refSetName, refSetEmbedsPath, querySetEmbedsPath, featureExtractionEndpoint, sampleRate;
  if( classConfigurations && classConfigurations.length ) {
    // TODO: handle multiple class configurations here?
    // for now, assume we have just one entry in classConfigurations
    
    // refSetName = classConfigurations[eliteMapIndex].refSetName;
    // each map holds only one class configuration, as set in initializeGrid
    refSetName = classConfigurations[0].refSetName;
    
    refSetEmbedsPath = classConfigurations[0].refSetEmbedsPath;
    querySetEmbedsPath = getQuerySetEmbedsPath( evoRunDirPath, refSetName ); // classConfigurations[0].querySetEmbedsPath;
    sampleRate = classConfigurations[0].sampleRate;
    qualityFromEmbeds = true;
  }

  // get features from audio buffer
  const featuresResponse = await getFeaturesFromWebsocket(
    audioBuffer,
    evaluationFeatureExtractionHost,
    // optional:
    ckptDir,
    sampleRate,
  ).catch(e => {
    console.error("Error getting features", e);
  });
  // console.log("--- getGenomeClassScoresByDiversityProjectionWithNewGenomes featuresResponse", featuresResponse);
  const newGenomeFeatureVector = featuresResponse.features;
  // newGenomesFeatures.push( newGenomeFeatureVector );
  const newGenomeEmbedding = featuresResponse.embedding;
  // newGenomesEmbedding.push( newGenomeEmbedding );

  let newGenomeQuality;
  if( qualityFromEmbeds ) {
    const newGenomeEmbed = featuresResponse.embedding;
    newGenomeQuality = await getQualityFromWebsocketForEmbedding(
      newGenomeEmbed,
      refSetEmbedsPath,
      querySetEmbedsPath,
      measureCollectivePerformance,
      evaluationQualityHost,
      ckptDir
    ).catch(e => {
      console.error(`Error getting quality at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
    });
  } else {
    // get quality from audio buffer
    newGenomeQuality = await getQualityFromWebsocket(
      audioBuffer,
      evaluationQualityHost
    ).catch(e => {
      console.error(`Error getting quality at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
    });
  }
  return {
    features: newGenomeFeatureVector,
    embedding: newGenomeEmbedding,
    quality: newGenomeQuality
  };
}

async function getClassKeysFromSeedFeatures( seedFeaturesAndScores, evaluationDiversityHost, evoRunDirPath, classScoringVariationsAsContainerDimensions, eliteMap ) {
  const featuresArray = seedFeaturesAndScores.map( f => f.features );
  const pcaComponents = eliteMap.classConfigurations[0].pcaComponents;
  const diversityProjection = await getDiversityFromWebsocket(
    featuresArray,
    undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
    evaluationDiversityHost,
    evoRunDirPath,
    true, // shouldFit
    pcaComponents
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
  });

  // doing the same thing here as in function retrainProjectionModel
  eliteMap.projectionModelFitGenerations.push( eliteMap.generationNumber );
  eliteMap.projectionSizes.push( diversityProjection.feature_map.length );
  
  if( classScoringVariationsAsContainerDimensions ) {
    return diversityProjection.feature_map.map( (oneClassKey, i) => {
      const {duration, noteDelta, velocity} = seedFeaturesAndScores[i];
      const classScoringVariationsKey =  `_${duration}_${noteDelta}_${velocity}`;
      return oneClassKey.join('_') + classScoringVariationsKey;
    });
  } else {
    return diversityProjection.feature_map.map( (oneClassKey, i) => {
      return oneClassKey.join('_');
    });
  }
}

async function getFeaturesAndScoresFromEliteMap(
  eliteMap, cellFeatures,
  _evaluationQualityServers, evolutionRunId, evoRunDirPath,
  scoreProportion,
  ckptDir, measureCollectivePerformance,
  refSetEmbedsPath, refSetName
) {
  const seedFeaturesAndScores = [];

  let i = 0;
  const querySetEmbedsPath = getQuerySetEmbedsPath( evoRunDirPath, refSetName );
  for( let cellKey in cellFeatures ) {
    
    if( eliteMap.cells[cellKey].elts && eliteMap.cells[cellKey].elts.length ) {
      const features = cellFeatures[cellKey];
      const genomeId = eliteMap.cells[cellKey].elts[0].g;
      const genomeString = await readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath );
      const genomeAndMeta = JSON.parse( genomeString );
      const tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === cellKey );
      if( undefined === tagForCell ) {
        console.error(`Error: tagForCell is undefined for genomeId ${genomeId} and cellKey ${cellKey}`);
      }
      const { duration, noteDelta, velocity } = tagForCell;
      const genomeQuality = await getQualityFromWebsocketForEmbedding(
        features.embedding,
        refSetEmbedsPath,
        querySetEmbedsPath,
        measureCollectivePerformance,
        _evaluationQualityServers[ i % _evaluationQualityServers.length ],
        ckptDir
      );
      const fitness = genomeQuality.fitness * scoreProportion;
      seedFeaturesAndScores.push({
        genomeId,
        genomeString,
        fitness,
        duration,
        noteDelta,
        velocity,
        features: features.features,
        embedding: features.embedding
      });
      i++;
    }
  }
  return seedFeaturesAndScores;
}

const projectionRetrainingLinearGapIncrement = 10;
function getShouldFit( lastProjectionFitIndex, iterationNumber ) {
  // T_n = n * k * (n + 1) / 2,
  const nextProjectionFitIndex = lastProjectionFitIndex + 1;
  const nextFitIterationNumber = nextProjectionFitIndex * projectionRetrainingLinearGapIncrement * (nextProjectionFitIndex + 1) / 2;
  const shouldFit = iterationNumber >= nextFitIterationNumber;
  return shouldFit;
}

// only called once, after the seed rounds are over:
function getNextFitGenerationIndex( lastProjectionFitGenerationNumber ) {
  let nextFitGenerationIndex = 0;
  do {
    const nextFitGenerationNumber = nextFitGenerationIndex * projectionRetrainingLinearGapIncrement * (nextFitGenerationIndex + 1) / 2;
    if( nextFitGenerationNumber > lastProjectionFitGenerationNumber ) {
      return nextFitGenerationIndex;
    }
  } while( ++nextFitGenerationIndex );
}

async function retrainProjectionModel( cellFeatures, eliteMap, evaluationDiversityHosts, evoRunDirPath ) {
  const evaluationDiversityHost = evaluationDiversityHosts[0];
  const cellKeysWithFeatures = Object.keys(cellFeatures);
  const allFeaturesToProject = [];
  for( const cellKeyWithFeatures of cellKeysWithFeatures ) {
    allFeaturesToProject.push( cellFeatures[cellKeyWithFeatures].features );
  }
  console.log(`Retraining projection with ${allFeaturesToProject.length} features, after generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`);
  const pcaComponents = eliteMap.classConfigurations[0].pcaComponents;
  const diversityProjection = await getDiversityFromWebsocket(
    allFeaturesToProject,
    undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
    evaluationDiversityHost,
    evoRunDirPath,
    true, // shouldFit
    pcaComponents
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
  });
  eliteMap.lastProjectionFitIndex++;
  eliteMap.projectionModelFitGenerations.push( eliteMap.generationNumber );
  eliteMap.projectionSizes.push( diversityProjection.feature_map.length );
  return diversityProjection;
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

function initializeEliteMap(
  evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationGraphModel, dummyRun,
  classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
  classConfigurations
) {
  let eliteMap = {
    _id: getEliteMapKey(evolutionRunId, classConfigurations[0].refSetName),
    algorithm,
    evolutionRunConfig, evolutionaryHyperparameters,
    generationNumber: 0,
    lastProjectionFitIndex: 0, // or re-training of the projection model
    projectionModelFitGenerations: [],
    projectionSizes: [], // aka coverage
    timestamp: Date.now(),
    eliteCountAtGeneration: 0,
    terminated: false,
    cells: {}, // aka classes or niches
    classConfigurations,
    qdScore: 0, qdScoreWithoutIncreaseCount: 0,
    coverage: 0, coverageWithoutIncreaseCount: 0,
    isBeingSwitchedToFromAnotherMap: false,
    mapSwitchLog: []
  };
  const classifierTags = getClassifierTags(classificationGraphModel, dummyRun);
  if( classScoringVariationsAsContainerDimensions ) {
    for( const oneDuration of classScoringDurations ) {
      for( const oneNoteDelta of classScoringNoteDeltas ) {
        for( const oneVelocity of classScoringVelocities ) {
          classifierTags.forEach((oneTag, i) => {
            const oneClassKey = `${oneTag}_${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
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

function initializeGrid( 
    evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters
) {
  const { 
    classifiers, classifierIndex, classesAsMaps, dummyRun,
    classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
    classScoringVariationsAsContainerDimensions
  } = evolutionRunConfig;
  const classificationGraphModel = classifiers[classifierIndex];
  let eliteMap;
  if( typeof classificationGraphModel === 'object' && classificationGraphModel.hasOwnProperty('classConfigurations') && classificationGraphModel.hasOwnProperty('classificationDimensions') ) {
    const { classConfigurations, classificationDimensions } = classificationGraphModel;
    if( classesAsMaps ) {
      // an array of eliteMaps, with each map representing a classConfiguration
      eliteMap = [];
      for( const oneClassConfiguration of classConfigurations ) {
        const oneEliteMap = initializeEliteMap(
          evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationDimensions, dummyRun,
          classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
          [oneClassConfiguration]
        );
        eliteMap.push( oneEliteMap );
      }
    } else {
      // only one map, but still using classConfigurations and classificationDimensions as the classificationGraphModel
      const oneEliteMap = initializeEliteMap(
        evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationDimensions, dummyRun,
        classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
        classConfigurations
      );
      eliteMap = oneEliteMap
    }
  } else {
    const oneEliteMap = initializeEliteMap(
      evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters, classificationGraphModel, dummyRun,
      classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classScoringVariationsAsContainerDimensions,
      undefined // classConfigurations
    );
    eliteMap = oneEliteMap;
  }
  return eliteMap;
}

function createEvoRunDir( evoRunDirPath ) {
  if( ! fs.existsSync(evoRunDirPath) ) fs.mkdirSync( evoRunDirPath, { recursive: true } );
}

async function saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, terrainName, addToGit ) {
  if( Array.isArray(eliteMap) ) {
    for( const oneEliteMap of eliteMap ) {
      const refSetName = oneEliteMap.classConfigurations[0].refSetName;
      await saveEliteMapToDisk( oneEliteMap, evoRunDirPath, evolutionRunId, refSetName, addToGit );
    }
  } else {
    const eliteMapFileName = `${getEliteMapKey(evolutionRunId, terrainName)}.json`;
    const eliteMapFilePath = `${evoRunDirPath}${eliteMapFileName}`;
    const eliteMapStringified = JSON.stringify(eliteMap, null, 2); // prettified to obtain the benefits (compression of git diffs)
    await fsPromise.writeFile( eliteMapFilePath, eliteMapStringified );

    if( addToGit ) {
      // add file to git (possibly redundantly)
      runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);
    }
  }
}
function readEliteMapFromDisk( evolutionRunId, evoRunDirPath, terrainName ) {
  let eliteMap;
  try {
    const eliteMapFilePath = `${evoRunDirPath}${getEliteMapKey(evolutionRunId, terrainName)}.json`;
    if( fs.existsSync(eliteMapFilePath) ) {
      const eliteMapJSONString = fs.readFileSync(eliteMapFilePath, 'utf8');
      eliteMap = JSON.parse( eliteMapJSONString );
    }
  } catch( err ) {
    console.error("readEliteMapFromDisk: ", err);
  }
  return eliteMap;
}

function saveEliteMapMetaToDisk( eliteMapMeta, evoRunDirPath, evolutionRunId ) {
  const eliteMapMetaFileName = `eliteMapMeta_${evolutionRunId}.json`;
  const eliteMapMetaFilePath = `${evoRunDirPath}${eliteMapMetaFileName}`;
  const eliteMapMetaStringified = JSON.stringify(eliteMapMeta, null, 2); // prettified to obtain the benefits (compression of git diffs)
  fs.writeFileSync( eliteMapMetaFilePath, eliteMapMetaStringified );
}

function readEliteMapMetaFromDisk( evolutionRunId, evoRunDirPath) {
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

function saveCellFeaturesToDisk( cellFeatures, generationNumber, evoRunDirPath, evolutionRunId, terrainName ) {
  const cellFeaturesToSave = { ...cellFeatures }
  cellFeaturesToSave["_timestamp"] = Date.now();
  cellFeaturesToSave["_generationNumber"] = generationNumber;
  const cellFeaturesFileName = `cellFeatures_${evolutionRunId}.json`;
  const cellFeaturesFilePath = `${evoRunDirPath}${cellFeaturesFileName}`;
  const cellFeaturesStringified = JSON.stringify(cellFeaturesToSave, null, 2); // prettified to obtain the benefits (compression of git diffs)
  fs.writeFileSync( cellFeaturesFilePath, cellFeaturesStringified );
  
  if( generationNumber % 100 === 0 ) {
    // for analysis purposes, save the cellFeatures at each generation
    const terrainSuffix = terrainName ? `_${terrainName}` : "";
    const cellFeaturesFileNameAtGeneration = `cellFeatures_${evolutionRunId}_gen${generationNumber}${terrainSuffix}.json`;
    const cellFeaturesFilePathAtGeneration = `${evoRunDirPath}${cellFeaturesFileNameAtGeneration}`;
    fs.writeFileSync( cellFeaturesFilePathAtGeneration, cellFeaturesStringified );
  }
}
function readCellFeaturesFromDisk( evolutionRunId, evoRunDirPath ) {
  let cellFeatures;
  try {
    const cellFeaturesFilePath = `${evoRunDirPath}cellFeatures_${evolutionRunId}.json`;
    if( fs.existsSync (cellFeaturesFilePath) ) {
      const cellFeaturesJSONString = fs.readFileSync( cellFeaturesFilePath, 'utf8' );
      cellFeatures = JSON.parse( cellFeaturesJSONString );
    }
  } catch( err ) {
    console.error("readCellFeaturesFromDisk: ", err);
  }
  if( cellFeatures ) {
    delete cellFeatures["_timestamp"];
    delete cellFeatures["_generationNumber"];
  }
  return cellFeatures;
}

async function saveGenomeToDisk( genome, evolutionRunId, genomeId, evoRunDirPath, addToGit ) {
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

function getEliteMapKey( evolutionRunId, terrainName ) {
  if( undefined === terrainName ) {
    return `elites_${evolutionRunId}`;
  } else {
    return `elites_${evolutionRunId}_${terrainName}`;
  }
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

function getClassifierTags( graphModel, dummyRun ) {
  if( dummyRun && dummyRun.cellCount ) {
    return getDummyLabels(dummyRun.cellCount);
  } else {
    // if graphModel is an array, we'll assume it's a list defining the dimensions of a grid to project the behaviour space onto
    if( Array.isArray(graphModel) ) {
      return createNDimensionalKeys(graphModel);
    } else {
      switch (graphModel) {
        case "yamnet":
          return yamnetTags;
        default:
          return yamnetTags;
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
function shouldTerminate( terminationCondition, eliteMap, dummyRun ) {
  let condition;
  let shouldTerminate = false;
  if( dummyRun && dummyRun.iterations ) {
    shouldTerminate = dummyRun.iterations <= eliteMap.generationNumber;
  } else if( condition = terminationCondition["numberOfEvals"] ) {
    shouldTerminate = condition <= eliteMap.generationNumber * eliteMap.searchBatchSize;
  } else if( condition = terminationCondition["averageFitnessInMap"] ) {
    const cellsKeysWithChampions = getCellKeysWithChampions(eliteMap.cells);
    if( cellsKeysWithChampions.length ) {
      let scoreSum = 0;
      for( const oneCellKey of cellsKeysWithChampions ) {
        scoreSum += eliteMap.cells[oneCellKey].elts[eliteMap.cells[oneCellKey].elts.length-1].s;
      }
      const averageFitness = scoreSum / cellsKeysWithChampions.length;
      shouldTerminate = condition <= averageFitness;
    } else {
      shouldTerminate = false;
    }
  } else if( condition = terminationCondition["medianFitnessInMap"] ) {
    const cellsKeysWithChampions = getCellKeysWithChampions(eliteMap.cells);
    if( cellsKeysWithChampions.length ) {
      const cellScores = getScoresForCellKeys( cellsKeysWithChampions, eliteMap.cells );
      const cellScoreMedian = median(cellScores);
      shouldTerminate = condition <= cellScoreMedian;
    } else {
      shouldTerminate = false;
    }
  } else if( condition = terminationCondition["percentageOfMapFilledWithFitnessThreshold"] ) {
    const cellCount = Object.keys(eliteMap.cells).length;
    const { percentage, minimumCellFitness } = condition;
    let cellsWithFitnessOverThresholdCount = 0;
    Object.keys(eliteMap.cells).forEach( oneClassKey => {
      if( minimumCellFitness <= eliteMap.cells[oneClassKey].elts[eliteMap.cells[oneClassKey].elts.length-1].s ) {
        cellsWithFitnessOverThresholdCount++;
      }
    });
    const cellsWithFitnessOverThresholdPercentage = cellsWithFitnessOverThresholdCount / cellCount;
    shouldTerminate = ( percentage <= cellsWithFitnessOverThresholdPercentage );
  }
  return shouldTerminate;
}

function shouldSwitchMap( eliteMap, mapSwitchingCondition ) {
  if(
    eliteMap.generationNumber > 0 && eliteMap.generationNumber % mapSwitchingCondition.switchEveryNGenerations === 0
    // ||
    // mapSwitchingCondition.coverageWithoutIncreaseGenerations && 
    // mapSwitchingCondition.coverageWithoutIncreaseGenerations < eliteMap.coverageWithoutIncreaseCount 
    // ||
    // mapSwitchingCondition.qdScoreWithoutIncreaseGenerations &&
    // mapSwitchingCondition.qdScoreWithoutIncreaseGenerations < eliteMap.qdScoreWithoutIncreaseCount
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
