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
  getFeaturesFromWebsocket, getQualityFromWebsocket, getDiversityFromWebsocket
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
    classifiers, classifierIndex, yamnetModelUrl,
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
  let eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath );
  if( ! eliteMap ) {
    eliteMap = initializeGrid( 
      evolutionRunId, algorithmKey, evolutionRunConfig, evolutionaryHyperparameters
    );
    
    runCmd(`git init ${evoRunDirPath}`);

    createEvoRunDir( evoRunDirPath );
    createEvoRunDir( evoRunFailedGenesDirPath );
    await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
    await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, 0 ); // generation specific map

    // add file to git
    const eliteMapFileName = `${getEliteMapKey(evolutionRunId)}.json`;
    runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);
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

    const batchStartTimeMs = performance.now();

    console.log("algorithmKey",algorithmKey);
    if( algorithmKey === "mapElites_with_uBC" ) {
      await mapElitesBatch(
        eliteMap, cellFeatures, seedFeaturesAndScores,
        algorithmKey, evolutionRunId,
        commitEliteMapToGitEveryNIterations, addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
        renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
        searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
        maxNumberOfParents,
        probabilityMutatingWaveNetwork, probabilityMutatingPatch,
        audioGraphMutationParams, evolutionaryHyperparameters,
        classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
        classScoringVariationsAsContainerDimensions,
        classificationGraphModel, yamnetModelUrl,
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
      );
    } else if( algorithmKey === "Deep-Grid-MAP-Elites" ) {
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
    } else {
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

  } // while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
  if( ! (batchDurationMs && batchDurationMs < Date.now() - startTimeMs) ) {
    // process not stopped due to time limit, but should now have reached a general termination contidtion
    eliteMap.terminated = true;
    await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId );
    console.log("eliteMap",eliteMap);
    // collect git garbage - UPDATE: this should be run separately, as part of one of the qd-run-analysis routines:
    // runCmdAsync(`git -C ${evoRunDirPath} gc`);
  }
  // if( exitWhenDone ) process.exit();
}

async function mapElitesBatch(
  eliteMap, cellFeatures, seedFeaturesAndScores,
  algorithmKey, evolutionRunId,
  commitEliteMapToGitEveryNIterations, addGenomesToGit, prunePastEliteGenomesEveryNGenerations,
  renderEliteMapToWavFilesEveryNGenerations, renderElitesToWavFiles,
  searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
  maxNumberOfParents,
  probabilityMutatingWaveNetwork, probabilityMutatingPatch,
  audioGraphMutationParams, evolutionaryHyperparameters,
  classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
  classScoringVariationsAsContainerDimensions,
  classificationGraphModel, yamnetModelUrl,
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

  if( ! isSeedRound && isUnsupervisedDiversityEvaluation && ! Object.keys(cellFeatures).length && seedFeaturesAndScores.length ) {

    // seed rounds are over, we're doing unsupervised diversity evaluation, but we haven't yet projected the features:
    // - so far the have been collected: let's project the whole collection
    searchPromises = new Array( seedFeaturesAndScores.length );
    const seedFeatureClassKeys = await getClassKeysFromSeedFeatures(
      seedFeaturesAndScores, _evaluationProjectionServers[0], evoRunDirPath
    );
    for( let i=0; i < seedFeaturesAndScores.length; i++ ) {
      searchPromises[i] = new Promise( async (resolve, reject) => {
        const seedFeatureAndScore = seedFeaturesAndScores[i];
        const { 
          genomeId, genomeString,
          score, duration, noteDelta, velocity
        } = seedFeatureAndScore;
        const classKey = seedFeatureClassKeys[i];
        const newGenomeClassScores = { [classKey]: {
          score, duration, noteDelta, velocity
        } };
        resolve({
          genomeId, 
          randomClassKey: classKey.join(","),
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

    if( isUnsupervisedDiversityEvaluation && _evaluationFeatureServers && _evaluationFeatureServers.length ) {
      await populateAndSaveCellFeatures( 
        eliteMap, cellFeatures, 
        classScoringDurations[0], classScoringNoteDeltas[0], classScoringVelocities[0], useGpuForTensorflow, antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs,
        _geneRenderingServers, renderSampleRateForClassifier,
        _evaluationFeatureServers,
        evoRunDirPath, evolutionRunId 
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
            feature: _evaluationFeatureServers[ batchIteration % _evaluationFeatureServers.length ],
            projection: _evaluationProjectionServers[ batchIteration % _evaluationProjectionServers.length ],
            quality: _evaluationQualityServers[ batchIteration % _evaluationQualityServers.length ]
          };
        }
      }
  
      searchPromises[batchIteration] = new Promise( async (resolve, reject) => {
  
        let randomClassKey;
        const parentGenomes = [];
  
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
  
              // TODO call getGenomeClassScoresByDiversityProjectionWithSeedGenomes and populate seedFeaturesAndScores
              // - then use seedFeaturesAndScores to populate cellFeatures
  
              const seedGenomeScoreAndFeatures = await getGenomeScoreAndFeatures(
                genomeId,
                newGenomeString,
                classScoringDurations,
                classScoringNoteDeltas,
                classScoringVelocities,
                useGpuForTensorflow,
                antiAliasing,
                frequencyUpdatesApplyToAllPathcNetworkOutputs,
                geneRenderingServerHost, renderSampleRateForClassifier,
                geneEvaluationServerHost.feature,
                geneEvaluationServerHost.quality,
                scoreProportion
              );
              seedFeaturesAndScores.push(seedGenomeScoreAndFeatures);
              await saveGenomeToDisk( await getGenomeFromGenomeString(newGenomeString), evolutionRunId, genomeId, evoRunDirPath, addGenomesToGit );
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
                        eliteMap, cellFeatures,
                        evolutionRunId, evoRunDirPath,
                        classificationGraphModel,
                        scoreProportion,
                        shouldFit, generationIncrement
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
                  eliteMap, cellFeatures,
                  evolutionRunId, evoRunDirPath,
                  classificationGraphModel,
                  scoreProportion,
                  shouldFit, generationIncrement
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

  const classToBatchEliteCandidates = {};
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

    for( let batchResultIdx = 0; batchResultIdx < batchIterationResults.length; batchResultIdx++ ) {

      const {
        genomeId, randomClassKey, newGenomeString, newGenomeClassScores, parentGenomes,
        seedFeaturesAndScores
      } = batchIterationResults[batchResultIdx];

      ///// add to archive

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
          // const classScoresSD = getClassScoresStandardDeviation( newGenomeClassScores );
          // console.log("classScoresSD", classScoresSD);
          eliteMap.newEliteCount = eliteClassKeys.length;
          const getGenomeFromGenomeStringStartTime = performance.now();
          const newGenome = await getGenomeFromGenomeString( newGenomeString );
          const getGenomeFromGenomeStringEndTime = performance.now();
          console.log("getGenomeFromGenomeString duration", getGenomeFromGenomeStringEndTime - getGenomeFromGenomeStringStartTime);
          newGenome.tags = [];
          newGenome.parentGenomes = parentGenomes.length ? parentGenomes : undefined;
          newGenome.generationNumber = eliteMap.generationNumber;
          const eliteMapUpdateStartTime = performance.now();
          for( const classKey of eliteClassKeys ) {
            const {score, duration, noteDelta, velocity} = newGenomeClassScores[classKey];
            const updated = Date.now();
            eliteMap.cells[classKey].elts = [
              // genomeId
            // .push(
            {
              g: genomeId, //genome: genomeId,
              // duration,
              // noteDelta,
              // velocity,
              s: score, // score: score.toFixed(4),
              gN: eliteMap.generationNumber, // generationNumber: eliteMap.generationNumber,
              // parentGenomes: newGenome.parentGenomes
            }
            ];
            // );
            newGenome.tags.push({
              tag: classKey,
              score, duration, noteDelta, velocity,
              updated
            });
            // delete the last top elite (if any) from genomeMap
            /*
            if( eliteMap[classKey].elts.length > 2 ) {
              // const lastTopEliteGenomeId = eliteMap[classKey].elts[ eliteMap[classKey].elts.length-2 ].genome;
              // delete genomeMap[lastTopEliteGenomeId];
              eliteMap[classKey].elts = eliteMap[classKey].elts.slice( - 1 );
            }
            */
            // if( !eliteMapExtra[classKey] ) eliteMapExtra[classKey] = {};
            eliteMap.cells[classKey].uBC = 10;

            cellFeatures[classKey] = newGenomeClassScores[classKey].features;

            classToBatchEliteCandidates[classKey] = {
              genomeId,
              genome: newGenome
            };
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
        } else if( randomClassKey ) { // if( eliteClassKeys.length > 0 ) {

          // bias search away from exploring niches that produce fewer innovations
          eliteMap.cells[randomClassKey].uBC -= 1; // TODO should stop at zero?
        }

      } else if( seedFeaturesAndScores !== undefined && seedFeaturesAndScores.length ) { // if( newGenomeClassScores !== undefined ) {
        // we have scores and features from a seed round
        // eliteMap.generationNumber++;
      }

    } // for( let oneBatchIterationResult of batchIterationResults ) {

  }); // await Promise.all( searchPromises ).then( async (batchIterationResult) => {
    
  for( const oneNewEliteClass in classToBatchEliteCandidates ) {
    const { genome, genomeId } = classToBatchEliteCandidates[oneNewEliteClass];
    const saveGenomeToDiskStartTime = performance.now();
    await saveGenomeToDisk( genome, evolutionRunId, genomeId, evoRunDirPath, addGenomesToGit );
    const saveGenomeToDiskEndTime = performance.now();
    console.log("saveGenomeToDisk duration", saveGenomeToDiskEndTime - saveGenomeToDiskStartTime);
  }

  // let's save and commit the eliteMap

  eliteMap.eliteCountAtGeneration = Object.keys(classToBatchEliteCandidates).length;
  eliteMap.coverageSize = Object.keys(cellFeatures).length;
  eliteMap.coveragePercentage = (eliteMap.coverageSize / Object.keys(eliteMap.cells).length) * 100;

  console.log(
    "generation", eliteMap.generationNumber,
    "eliteCountAtGeneration:", eliteMap.eliteCountAtGeneration,
    "coverageSize", eliteMap.coverageSize, "coveragePercentage", eliteMap.coveragePercentage, 
    "evo run ID:", evolutionRunId
  );

  eliteMap.searchBatchSize = searchBatchSize;
  eliteMap.timestamp = Date.now();

  const saveEliteMapToDiskStartTime = performance.now();
  await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
  const saveEliteMapToDiskEndTime = performance.now();
  console.log("saveEliteMapToDisk duration", saveEliteMapToDiskEndTime - saveEliteMapToDiskStartTime);

  const commitEliteMapToGitStartTime = performance.now();
  if( commitEliteMapToGitEveryNIterations && eliteMap.generationNumber % commitEliteMapToGitEveryNIterations === 0 ) {
    // git commit iteration
    runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);
  }
  const commitEliteMapToGitEndTime = performance.now();
  console.log("commitEliteMapToGit duration", commitEliteMapToGitEndTime - commitEliteMapToGitStartTime);

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

}

// TODO: the implementation of this variant has fallen behind and isn't really used / working to well?
async function deepGridMapElitesBatch(
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
) {
  const batchPromisesSelection = new Array(populationSize);
  for( let parentIdx = 0; parentIdx < populationSize; parentIdx++ ) {

    const geneVariationServerHost = _geneVariationServers[ parentIdx % _geneVariationServers.length ];
    const geneEvaluationServerHost = _geneEvaluationServers[ parentIdx % _geneEvaluationServers.length ];

    batchPromisesSelection[parentIdx] = new Promise( async (resolve) => {

      ///// selection

      const randomClassKey = sample(Object.keys(eliteMap.cells));
      const cellIndividualGenomeString = await fitnessProportionalSelectionOfIndividualInCell( eliteMap, randomClassKey, evolutionRunId, evoRunDirPath );
      let genomeId = ulid();
      
      // let newGenome;
      let newGenomeString;
      if( cellIndividualGenomeString ) {

        ///// variation

        // newGenome = await getNewAudioSynthesisGenomeByMutation(
        //   cellIndividual,
        //   evolutionRunId, eliteMapExtra.generationNumber, parentIdx, 'deepGridMapElites', audioCtx,
        //   this.state.probabilityMutatingWaveNetwork,
        //   this.state.probabilityMutatingPatch,
        //   this.state.mutationParams
        // );

        try {
          newGenomeString = await callGeneVariationService(
            cellIndividualGenomeString,
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
          genomeId = undefined;
        }


      } else {

        ///// gene initialisation

        // newGenome = getNewAudioSynthesisGenome(
        //   evolutionRunId, eliteMapExtra.generationNumber, parentIdx
        // );
        
        try {
          newGenomeString = await callRandomGeneService(
            evolutionRunId, eliteMap.generationNumber, evolutionaryHyperparameters,
            geneVariationServerHost
          );
        } catch (error) {
          console.error("Error calling gene seed service: " + error);
          clearServiceConnectionList(geneVariationServerHost);
          genomeId = undefined;
        }


        ///// evaluate

        // const score = await this.getClassScoreForOneGenome(
        //   newGenome, randomClassKey, 1, 0, 1
        // );

        const newGenomeClassScores = await callGeneEvaluationService(
          newGenomeString,
          classScoringDurations,
          classScoringNoteDeltas,
          classScoringVelocities,
          classificationGraphModel,
          useGpuForTensorflow,
          geneEvaluationServerHost
        ).catch(
          e => {
            console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
            clearServiceConnectionList(geneEvaluationServerHost);
            getGenomeFromGenomeString( newGenomeString ).then( async failedGenome =>
              await saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
            );
            genomeId = undefined;
          }
        );
        if( newGenomeClassScores ) {
          const {score, duration, noteDelta, velocity} = newGenomeClassScores[randomClassKey];
            const updated = Date.now();

          const offspringCell = eliteMap.cells[randomClassKey];
          const championEntry = {
            g: genomeId,
            s: score,
            gN: eliteMap.generationNumber
            // duration: 1, noteDelta: 0, velocity: 1
          };
          offspringCell.elts.push( championEntry );

          if( genomeId ) {
            // const genomeSavedInDB = await this.saveToGenomeMap(evolutionRunId, genomeId, newGenome);
            const newGenome = await getGenomeFromGenomeString( newGenomeString );
            newGenome.tags = [];
            newGenome.tags.push({
              tag: randomClassKey,
              score, duration, noteDelta, velocity,
              updated
            });
            await saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath, true );        
          }

        } else {
          console.error("Error evaluating gene at generation", eliteMap.generationNumber, "for evolution run", evolutionRunId);
          genomeId = undefined;
        }
        
      }

      // parents[parentIdx] = genomeId;

      resolve( genomeId );

    }); // batchPromises[parentIdx] = new Promise( async (resolve) => {

    // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {
    // } // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

  }

  // place population members in grid

  await Promise.all( batchPromisesSelection ).then( async (parents) => {

    const batchPromisesEvaluation = new Array(parents.length); // same as populationSize

    for (const [parentIdx, offspringId] of parents.filter( e => e !== undefined ).entries()) {
    // for( const offspringId of parents ) {

      batchPromisesEvaluation[parentIdx] = new Promise( async (resolve) => {
        // const offspring = await this.getFromGenomeMap(evolutionRunId, offspringId);
        
        const classEliteGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, offspringId, evoRunDirPath );
        const geneEvaluationServerHost = _geneEvaluationServers[ parentIdx % _geneEvaluationServers.length ];
        const newGenomeClassScores = await callGeneEvaluationService(
          classEliteGenomeString,
          classScoringDurations,
          classScoringNoteDeltas,
          classScoringVelocities,
          classificationGraphModel,
          useGpuForTensorflow,
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
        if( newGenomeClassScores && Object.keys(newGenomeClassScores).length ) {
          // const eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap, true /*eliteWinsOnlyOneCell*/, undefined/*classRestriction*/ );
          // const topScoringClassForOffspring = newGenomeClassScores[ eliteClassKeys[0] ];
          const topScoringClassForOffspring = getHighestScoringCell( newGenomeClassScores );
          
          // const topScoringClassForOffspring = await this.getTopClassForGenome(offspring);
          const {score, 
            // duration, noteDelta, velocity
          } = topScoringClassForOffspring;
          const championEntry = {
            g: offspringId,
            s: score, 
            // duration, noteDelta, velocity,
            gN: eliteMap.generationNumber,
            class: topScoringClassForOffspring.class
          };
          resolve( championEntry );
        } else {
          console.error("Error evaluating gene at generation", eliteMap.generationNumber, "for evolution run", evolutionRunId);
          resolve( undefined );
        }
      });
      
      // const offspringCell = eliteMap[topScoringClassForOffspring.class];
      // if( offspringCell.elts.length < gridDepth ) {
      //   offspringCell.elts.push( championEntry );
      // } else {
      //   const championToReplaceIdx = Math.floor(Math.random() * offspringCell.elts.length);
      //   offspringCell.elts[championToReplaceIdx] = championEntry;
      // }
    }
    await Promise.all( batchPromisesEvaluation ).then( async (championEntries) => {
      for( const championEntry of championEntries.filter( e => e !== undefined ) ) {
        const offspringCell = eliteMap.cells[championEntry.class];
        if( offspringCell.elts.length < gridDepth ) {
          offspringCell.elts.push( championEntry );
        } else {
          const championToReplaceIdx = Math.floor(Math.random() * offspringCell.elts.length);
          offspringCell.elts[championToReplaceIdx] = championEntry;
        }
      }
    }); // Promise.all( batchPromisesEvaluation ).then( async (championEntries) => {
  }); // await Promise.all( batchPromises ).then( async (batchIterationResults) => {
  // console.log("iteration", eliteMapExtra.generationNumber);
  // this.setState({eliteMap: cloneDeep(eliteMap), generationNumber: eliteMapExtra.generationNumber});
  // await this.saveEliteMap( evolutionRunId, eliteMapExtra.generationNumber, eliteMap );
  // await this.saveEliteMapExtra( evolutionRunId, eliteMapExtra );
  
  console.log("iteration", eliteMap.generationNumber, "evo run ID:", evolutionRunId);
  await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
  // git commit iteration
  runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);

  eliteMap.generationNumber++;
}

// for DG-MAP-Elites
async function fitnessProportionalSelectionOfIndividualInCell( eliteMap, classKey, evolutionRunId, evoRunDirPath ) {
  const cell = eliteMap.cells[classKey];
  let cellIndividualId;
  let cellIndividualGenomeString;
  if( cell.elts && cell.elts.length ) {
    if( cell.elts.length > 1 ) {
      const cellGenomes = cell.elts.map( ch => ch.g );
      const cellGenomeScores = cell.elts.map( ch => ch.s );
      const nonzeroGenomeScoreCount = cellGenomeScores.filter( s => s > 0 ).length;
      if( nonzeroGenomeScoreCount > 0 ) {
        cellIndividualId = chance.weighted(cellGenomes, cellGenomeScores);
      } else {
        cellIndividualId = chance.pickone(cellGenomes);
      }
    } else {
      cellIndividualId = cell.elts[0].genome;
    }
    // cellIndividual = await this.getFromGenomeMap( evolutionRunId, cellIndividualId );
    cellIndividualGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, cellIndividualId, evoRunDirPath );
  }
  return cellIndividualGenomeString;
}

function getHighestScoringCell( genomeClassScores ) {
  const highestScoringClassKey = Object.keys(genomeClassScores).reduce((maxKey, oneClassKey) =>
    genomeClassScores[maxKey].score > genomeClassScores[oneClassKey].score ? maxKey : oneClassKey
  );
  const {score, duration, noteDelta, velocity} = genomeClassScores[highestScoringClassKey];
  return {score, duration, noteDelta, velocity, class: highestScoringClassKey};
}

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
  evoRunDirPath, evolutionRunId
) {
  let cellKeyIndex = 0;
  for( const cellKey in eliteMap.cells ) {
    const cell = eliteMap.cells[cellKey];
    if( cell.elts && cell.elts.length ) {
      if( ! cellFeatures[cellKey] ) {
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
          evaluationFeatureExtractionHosts[cellKeyIndex % evaluationFeatureExtractionHosts.length]
        );
        const cellGenomeFeatures = featuresResponse.features;
        cellFeatures[cellKey] = cellGenomeFeatures;

        cellKeyIndex++;
      }
    }

  }
  saveCellFeaturesToDisk( cellFeatures, eliteMap.generationNumber, evoRunDirPath, evolutionRunId );
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
  eliteMap,
  cellFeatures,
  evolutionRunId, evoRunDirPath,
  classificationGraphModel,
  scoreProportion,
  shouldFit, modelFitGeneration
) {
  // not supporting arrays of durations, noteDeltas and velocities for now, as is done in getGenomeClassScores
  const duration = durations[0];
  const noteDelta = noteDeltas[0];
  const velocity = velocities[0];

  const cellFitnessValues = await getCellFitnessValues( eliteMap );

  const newGenomesFeatures = [];
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
    // get features from audio buffer
      const featuresResponse = await getFeaturesFromWebsocket(
        audioBuffer,
        evaluationFeatureExtractionHost
      ).catch(e => {
        console.error(`Error getting features at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
      });
      // console.log("--- getGenomeClassScoresByDiversityProjectionWithNewGenomes featuresResponse", featuresResponse);
      const newGenomeFeatureVector = featuresResponse.features;
      newGenomesFeatures.push( newGenomeFeatureVector );

      // get quality from audio buffer
      let newGenomeQuality = await getQualityFromWebsocket(
        audioBuffer,
        evaluationQualityHost
      ).catch(e => {
        console.error(`Error getting quality at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
      });
      // console.log("--- getGenomeClassScoresByDiversityProjectionWithNewGenomes newGenomeQuality", newGenomeQuality);
      newGenomesFitnessValues.push( newGenomeQuality.fitness * scoreProportion );
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
          shouldFit
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
          // if( i in indices_to_keep ) {
          const newGenomeFitnessValue = allFitnessValues[i];
          const newGenomeFeatureVector = allFeaturesToProject[i];
          const diversityMapKey = featureMap[i].join(",");
          
          // if( newGenomeFeatureVector) cellFeatures[ diversityMapKey ] = newGenomeFeatureVector;
  
          newGenomeClassScores[ diversityMapKey ] = {
            score: newGenomeFitnessValue,
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
      shouldFit // this should be false
    ).catch(e => {
      console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
    });
    for( let i = 0; i < newGenomesFeatures.length; i++ ) {
      const newGenomeFitnessValue = newGenomesFitnessValues[i];
      const newGenomeFeatureVector = newGenomesFeatures[i];
      const diversityMapKey = diversityProjection.feature_map[i].join(",");
      newGenomeClassScores[ diversityMapKey ] = {
        score: newGenomeFitnessValue,
        duration,
        noteDelta,
        velocity,
        features: newGenomeFeatureVector
      };
    }
  }

  // TODO: this is dependent on only one genome being evaluated at a time (so the for loop above is pointless atm):
  // - might want to return an array of newGenomeClassScores, one for each genomeString
  // - then the search promise in each batchIteration would need to resolve with an array of newGenomeClassScores
  return newGenomeClassScores;
}

// similar to getGenomeClassScoresByDiversityProjectionWithNewGenomes, but specialised for the seed rounds
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
  scoreProportion
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
  ).catch(
    e => {
      console.error(`Error rendering geneome ${genomeId}`, e);
    }
  );

  let newGenomeFeatureVector;
  let newGenomeQuality;
  if( audioBuffer && audioBuffer.length && ! audioBuffer.some( value => isNaN(value) ) ) {
    // get features from audio buffer
    const featuresResponse = await getFeaturesFromWebsocket(
      audioBuffer,
      evaluationFeatureExtractionHost
    ).catch(e => {
      console.error(`getGenomeScoreAndFeatures: Error getting features for genomeId ${genomeId}`, e);
    });
    newGenomeFeatureVector = featuresResponse.features;

    // get quality from audio buffer
    newGenomeQuality = await getQualityFromWebsocket(
      audioBuffer,
      evaluationQualityHost
    ).catch(e => {
      console.error(`Error getting quality at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
    });
  }

  return {
    genomeId,
    genomeString,
    score: newGenomeQuality.fitness * scoreProportion,
    duration,
    noteDelta,
    velocity,
    features: newGenomeFeatureVector
  };
}

async function getClassKeysFromSeedFeatures( seedFeaturesAndScores, evaluationDiversityHost, evoRunDirPath ) {
  const featuresArray = seedFeaturesAndScores.map( f => f.features );
  const diversityProjection = await getDiversityFromWebsocket(
    featuresArray,
    undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
    evaluationDiversityHost,
    evoRunDirPath,
    true // shouldFit
  ).catch(e => {
    console.error(`Error projecting diversity at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
  });
  return diversityProjection.feature_map;
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
    allFeaturesToProject.push( cellFeatures[cellKeyWithFeatures] );
  }
  console.log(`Retraining projection with ${allFeaturesToProject.length} features, after generation ${eliteMap.generationNumber} for evolution run ${eliteMap._id}`)
  const diversityProjection = await getDiversityFromWebsocket(
    allFeaturesToProject,
    undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
    evaluationDiversityHost,
    evoRunDirPath,
    true // shouldFit
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

function initializeGrid( 
    evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters
) {
  const { 
    classifiers, classifierIndex, dummyRun,
    classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
    classScoringVariationsAsContainerDimensions
  } = evolutionRunConfig;
  const classificationGraphModel = classifiers[classifierIndex];
  let eliteMap = {
    _id: getEliteMapKey(evolutionRunId),
    algorithm,
    evolutionRunConfig, evolutionaryHyperparameters,
    generationNumber: 0,
    lastProjectionFitIndex: 0, // or re-training of the projection model
    projectionModelFitGenerations: [],
    projectionSizes: [], // aka coverage
    timestamp: Date.now(),
    eliteCountAtGeneration: 0,
    terminated: false,
    cells: {} // aka classes or niches
  };
  const classifierTags = getClassifierTags(classificationGraphModel, dummyRun);
  if( classScoringVariationsAsContainerDimensions ) {
    for( const oneDuration of classScoringDurations ) {
      for( const oneNoteDelta of classScoringNoteDeltas ) {
        for( const oneVelocity of classScoringVelocities ) {
          classifierTags.forEach((oneTag, i) => {
            const oneClassKey = `${oneTag}_${oneDuration}_${oneNoteDelta}_${oneVelocity}`;
            eliteMap.cells[oneClassKey] = {
              elts: []
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

function createEvoRunDir( evoRunDirPath ) {
  if( ! fs.existsSync(evoRunDirPath) ) fs.mkdirSync( evoRunDirPath, { recursive: true } );
}

async function saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, generationNumber ) {
  const eliteMapFileName = `${getEliteMapKey(evolutionRunId, generationNumber)}.json`;
  const eliteMapFilePath = `${evoRunDirPath}${eliteMapFileName}`;
  const eliteMapStringified = JSON.stringify(eliteMap, null, 2); // prettified to obtain the benefits (compression of git diffs)
  await fsPromise.writeFile( eliteMapFilePath, eliteMapStringified );

  // add file to git (possibly redundantly)
  // runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);
}
function readEliteMapFromDisk( evolutionRunId, evoRunDirPath ) {
  let eliteMap;
  try {
    const eliteMapFilePath = `${evoRunDirPath}${getEliteMapKey(evolutionRunId)}.json`;
    if( fs.existsSync(eliteMapFilePath) ) {
      const eliteMapJSONString = fs.readFileSync(eliteMapFilePath, 'utf8');
      eliteMap = JSON.parse( eliteMapJSONString );
    }
  } catch( err ) {
    console.error("readEliteMapFromDisk: ", err);
  }
  return eliteMap;
}

function saveCellFeaturesToDisk( cellFeatures, generationNumber, evoRunDirPath, evolutionRunId ) {
  const cellFeaturesToSave = { ...cellFeatures }
  cellFeaturesToSave["_timestamp"] = Date.now();
  cellFeaturesToSave["_generationNumber"] = generationNumber;
  const cellFeaturesFileName = `cellFeatures_${evolutionRunId}.json`;
  const cellFeaturesFilePath = `${evoRunDirPath}${cellFeaturesFileName}`;
  const cellFeaturesStringified = JSON.stringify(cellFeaturesToSave, null, 2); // prettified to obtain the benefits (compression of git diffs)
  fs.writeFileSync( cellFeaturesFilePath, cellFeaturesStringified );
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

function getEliteMapKey( evolutionRunId, generationNumber ) {
  if( undefined === generationNumber ) {
    return `elites_${evolutionRunId}`;
  } else {
    return `elites_${evolutionRunId}_${generationNumber}`;
  }
}

///// methods to obtain a list of n-dimensional coordinates for a grid of cells
function createNDimensionalKeys(dims) {
  const length = dims.reduce((prev, current) => prev * current, 1);
  const keys = [];

  for (let i = 0; i < length; i++) {
    const indices = getIndices(dims, i);
    const key = indices.join(",");
    keys.push(key);
  }

  return keys;
}

function getIndices(dims, index) {
  const indices = [];

  for (let i = dims.length - 1; i >= 0; i--) {
    const size = dims[i];
    indices[i] = index % size;
    index = Math.floor(index / size);
  }

  return indices.reverse();
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
          if( tries < 10 ) {
            console.log(`waiting for ${filePath} to be created`);
            setTimeout( () => {
              resolve( readFromFileWhenItExists(filePath), tries + 1 );
            }, 1000 );
          } else {
            console.log(`gave up on waiting for ${filePath} to be created`);
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
