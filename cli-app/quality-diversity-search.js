import fs from 'fs';
import {glob} from 'glob';
import {ulid} from 'ulid';
import Chance from 'chance';
import sample from "lodash-es/sample.js";
import { getAudioGraphMutationParams } from "./kromosynth.js";
import { yamnetTags } from 'kromosynth/workers/audio-classification/classificationTags.js';
import {
  getGenomeFromGenomeString, getNewAudioSynthesisGenomeByMutation
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
  invertedLogarithmicRamp
} from './util/qd-common.js';
import { callGeneEvaluationWorker, callRandomGeneWorker, callGeneVariationWorker } from './service/workers/gene-child-process-forker.js';
import { get } from 'http';
import { i } from 'mathjs';
import { log } from 'console';

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
    terminationCondition, scoreProportionalToNumberOfEvalsTerminationCondition,
    evoRunsDirPath,
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
    eliteMapSnapshotEvery,
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
  const evoRunFailedGenesDirPath = `${evoRunsDirPath}${evolutionRunId}_failed-genes/`;
  let eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath );
  if( ! eliteMap ) {
    eliteMap = initializeGrid( 
      evolutionRunId, algorithmKey, evolutionRunConfig, evolutionaryHyperparameters
    );
    
    runCmd(`git init ${evoRunDirPath}`);

    createEvoRunDir( evoRunDirPath );
    createEvoRunDir( evoRunFailedGenesDirPath );
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, 0 ); // generation specific map

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

  let cellFeatures = {};

  while( 
      ! shouldTerminate(terminationCondition, eliteMap, dummyRun)
      &&
      ! ( batchDurationMs && batchDurationMs < Date.now() - startTimeMs )
  ) {

    // optionally ramping up the fitness values, to avoid premature convergence
    let scoreProportion;
    if( scoreProportionalToNumberOfEvalsTerminationCondition && terminationCondition.numberOfEvals ) {
      scoreProportion = invertedLogarithmicRamp(eliteMap.generationNumber, terminationCondition.numberOfEvals);
    } else {
      scoreProportion = 1.0;
    }

    console.log("algorithmKey",algorithmKey);
    if( algorithmKey === "mapElites_with_uBC" ) {
      await mapElitesBatch(
        eliteMap, cellFeatures, algorithmKey, evolutionRunId,
        searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
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
        evoRunDirPath, evoRunFailedGenesDirPath,
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

  } // while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
  if( ! (batchDurationMs && batchDurationMs < Date.now() - startTimeMs) ) {
    // process not stopped due to time limit, but should now have reached a general termination contidtion
    eliteMap.terminated = true;
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId );
    console.log("eliteMap",eliteMap);
    // collect git garbage - UPDATE: this should be run separately, as part of one of the qd-run-analysis routines:
    // runCmdAsync(`git -C ${evoRunDirPath} gc`);
  }
  // if( exitWhenDone ) process.exit();
}

async function mapElitesBatch(
  eliteMap, cellFeatures, algorithmKey, evolutionRunId,
  searchBatchSize, seedEvals, eliteWinsOnlyOneCell, classRestriction,
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
  evoRunDirPath, evoRunFailedGenesDirPath,
  evaluationCandidateWavFilesDirPath, classifiers,
  patchFitnessTestDuration,
  scoreProportion,
  dummyRun
) {
  const searchPromises = new Array(searchBatchSize);
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
      } else if( 
        _evaluationFeatureServers && _evaluationFeatureServers.length &&
        _evaluationProjectionServers && _evaluationProjectionServers.length &&
        _evaluationQualityServers && _evaluationQualityServers.length
      ) {
        // using feature extraction and dimensionality reduction for diversity projection and a separate quality evaluation service
        geneEvaluationServerHost = {
          feature: _evaluationFeatureServers[ batchIteration % _evaluationFeatureServers.length ],
          projection: _evaluationProjectionServers[ batchIteration % _evaluationProjectionServers.length ],
          quality: _evaluationQualityServers[ batchIteration % _evaluationQualityServers.length ]
        };
      }
    }
    const isUnsupervisedDiversityEvaluation = geneEvaluationServerHost && geneEvaluationServerHost.feature && geneEvaluationServerHost.projection && geneEvaluationServerHost.quality;
    if( geneEvaluationProtocol === "grpc" ) {
      console.log("geneVariationServerHost",geneVariationServerHost);
      console.log("geneEvaluationServerHost",geneEvaluationServerHost);
    }
    searchPromises[batchIteration] = new Promise( async (resolve, reject) => {

      let randomClassKey;
      const parentGenomes = [];

      ///// gene initialisation

      let newGenomeString;
      if( eliteMap.generationNumber < seedEvals ) {

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
          if( nonzeroClassBiasCount > 0 ) {
            randomClassKey = chance.weighted(classKeys, classBiases);
          } else { // if all are zero or below, .weighted complains
            randomClassKey = chance.pickone(classKeys);
          }
        const {
          // genome: classEliteGenomeId,
          // score,
          // generationNumber
          g: classEliteGenomeId,
          s,
          gN
        } = getCurrentClassElite(randomClassKey, eliteMap);

        const classEliteGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, classEliteGenomeId, evoRunDirPath );

        parentGenomes.push( {
          genomeId: classEliteGenomeId,
          eliteClass: randomClassKey,
          // score, generationNumber,
          s, gN,
        } );

        if( dummyRun ) {
          newGenomeString = classEliteGenomeString;
        } else {

          try {
            ///// variation
            if( geneEvaluationProtocol === "grpc" || geneEvaluationProtocol === "websocket" ) {
              try {
                newGenomeString = await callGeneVariationService(
                  classEliteGenomeString,
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
              }
            } else if( geneEvaluationProtocol === "worker" ) {
               const geneVariationWorkerResponse = await callGeneVariationWorker(
                searchBatchSize, batchIteration,
                classEliteGenomeString,
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
              const classEliteGenome = await getGenomeFromGenomeString(classEliteGenomeString, evolutionaryHyperparameters);
              const newGenome = getNewAudioSynthesisGenomeByMutation(
                classEliteGenome,
                evolutionRunId, generationNumber, -1, algorithmKey,
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
      } // if( eliteMap.generationNumber < seedEvals ) {

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
                    scoreProportion
                  );
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
              scoreProportion
            );
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

        

        // if( evaluationCandidateWavFilesDirPath ) {
        //   // so we'll render the genome to wav files for all combinations under consideration
        //   // and then return a list of paths to the wav files, for evaluation by external scripts, triggered below.
        //   const genome = await getGenomeFromGenomeString( newGenomeString );
        //   evaluationCandidatesJsonFilePath = await writeEvaluationCandidateWavFilesForGenome(
        //     genome,
        //     classScoringDurations,
        //     classScoringNoteDeltas,
        //     classScoringVelocities,
        //     true, //supplyAudioContextInstances
        //     evaluationCandidateWavFilesDirPath,
        //     evolutionRunId, genomeId
        //   ).catch(
        //     e => {
        //       console.error(`Error writing evaluation candidate wav files for gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
        //     }
        //   );
        //   console.log("evaluationCandidateWavFileDirPaths", evaluationCandidatesJsonFilePath);
        // } else {
          
        // }

        // else {
        //   newGenomeClassScores = evaluate(
        //     newGenomeString,
        //     classScoringDurations,
        //     classScoringNoteDeltas,
        //     classScoringVelocities,
        //     classificationGraphModel,
        //     useGpuForTensorflow,
        //     geneEvaluationServerHost
        //   );
        // }


      }
      console.log(
        "Resolution for genome ID" + genomeId + ", class scores defined: " + (newGenomeClassScores!==undefined), 
        (geneEvaluationProtocol === "worker" ? ", thread #"+batchIteration : ", evaluation host: "+geneEvaluationServerHost), 
        classRestriction && classRestriction.length ? classRestriction[0]+" score:" : newGenomeClassScores.length === 1 ? /* one feature mapping for the new genome */ Object.keys(newGenomeClassScores)[0] : " - Music score:", 
        classRestriction && classRestriction.length ?
            newGenomeClassScores && newGenomeClassScores[ classRestriction[0] ] ? newGenomeClassScores[ classRestriction[0] ].score : "N/A"
          :
            newGenomeClassScores.length === 1 ? /* one feature mapping for the new genome */
            newGenomeClassScores[0].score
          :
          newGenomeClassScores && newGenomeClassScores["Music"] ? newGenomeClassScores["Music"].score : "N/A"
      );
      resolve({
        genomeId,
        randomClassKey,
        newGenomeString,
        newGenomeClassScores,
        evaluationCandidatesJsonFilePath,
        parentGenomes
      });

    }); // new Promise( async (resolve) => {
  } // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

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

    for( let oneBatchIterationResult of batchIterationResults ) {

      const {
        genomeId, randomClassKey, newGenomeString, newGenomeClassScores,  parentGenomes
      } = oneBatchIterationResult;

      ///// add to archive

        if( newGenomeClassScores !== undefined && Object.keys(newGenomeClassScores).length ) {
          let eliteClassKeys;
          if( dummyRun && dummyRun.iterations ) {
            eliteClassKeys = getDummyClassKeysWhereScoresAreElite( Object.keys(eliteMap.cells), eliteMap.generationNumber, dummyRun.iterations );
          } else {
            eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap, eliteWinsOnlyOneCell, classRestriction );
          }
          if( eliteClassKeys.length > 0 ) {
            // const classScoresSD = getClassScoresStandardDeviation( newGenomeClassScores );
            // console.log("classScoresSD", classScoresSD);
            eliteMap.newEliteCount = eliteClassKeys.length;
            const newGenome = await getGenomeFromGenomeString( newGenomeString );
            newGenome.tags = [];
            newGenome.parentGenomes = parentGenomes.length ? parentGenomes : undefined;
            newGenome.generationNumber = eliteMap.generationNumber;
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
            }
            saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath, true );
            if( randomClassKey ) {
              eliteMap.cells[randomClassKey].uBC = 10;
            }
          } else if( randomClassKey ) { // if( eliteClassKeys.length > 0 ) {

          // bias search away from exploring niches that produce fewer innovations
          eliteMap.cells[randomClassKey].uBC -= 1; // TODO should stop at zero?
        }
        console.log("iteration", eliteMap.generationNumber,"eliteCountAtGeneration:",eliteClassKeys.length, "evo run ID:", evolutionRunId);
        eliteMap.eliteCountAtGeneration = eliteClassKeys.length;
        eliteMap.searchBatchSize = searchBatchSize;
        eliteMap.timestamp = Date.now();
        saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map

        // git commit iteration
        runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);

        eliteMap.generationNumber++; // TODO: well, it's more like iteration number, but we'll keep the name for now

      } // if( newGenomeClassScores !== undefined ) {

    } // for( let oneBatchIterationResult of batchIterationResults ) {

  }); // await Promise.all( searchPromises ).then( async (batchIterationResult) => {
}

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
            getGenomeFromGenomeString( newGenomeString ).then( failedGenome =>
              saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
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
            saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath, true );        
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
            getGenomeFromGenomeString( newGenomeString ).then( failedGenome =>
              saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
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
  saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
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
        getGenomeFromGenomeString( newGenomeString ).then( failedGenome =>
          saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
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
        getGenomeFromGenomeString( newGenomeString ).then( failedGenome =>
          saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
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
  eliteMap, // TODO: this may become obsolete, if the TODO extract to method below is implemented
  cellFeatures,
  evolutionRunId, evoRunDirPath,
  classificationGraphModel,
  scoreProportion
) {
  // not supporting arrays of durations, noteDeltas and velocities for now, as is done in getGenomeClassScores
  const duration = durations[0];
  const noteDelta = noteDeltas[0];
  const velocity = velocities[0];

  // for all cells in eliteMap, get the feature vector if there is a genome in the cell
  // - if the feature vector is not present in the cellFeatures cache map, call the feature extraction service

  const cellFitnessValues = [];

  // TODO: extract to a method, that is called before this method, to ensure cellFeatures is populated; and then not 
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
          geneRenderingServerHost, renderSampleRateForClassifier
        );
        const featuresResponse = await getFeaturesFromWebsocket(
          audioBuffer,
          evaluationFeatureExtractionHost
        );
        const cellGenomeFeatures = featuresResponse.features;
        cellFeatures[cellKey] = cellGenomeFeatures;
      }
      cellFitnessValues.push( cell.elts[0].s );
    }
  }

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
    );

    if( audioBuffer && audioBuffer.length && ! audioBuffer.some( value => isNaN(value) ) ) {
    // get features from audio buffer
      const featuresResponse = await getFeaturesFromWebsocket(
        audioBuffer,
        evaluationFeatureExtractionHost
      );
      const newGenomeFeatureVector = featuresResponse.features;
      newGenomesFeatures.push( newGenomeFeatureVector );

      // get quality from audio buffer
      let newGenomeQuality = await getQualityFromWebsocket(
        audioBuffer,
        evaluationQualityHost
      );
      newGenomesFitnessValues.push( newGenomeQuality.fitness * scoreProportion );
    }
  }

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

  const newGenomeClassScores = {};

  if( cellFitnessValues.length < allFitnessValues.length ) { // some genomes were successfully rendered

    // assume classificationGraphModel is an array defining the grid dimensions and size, like [10,10] or [10,10,10]
    if( eliteMap.generationNumber < classificationGraphModel.length ) {
      // if this is the first generation, just add the first new genome to the elite map
      // - the projection requires at least two genomes
      const randomClassKey = chance.pickone( Object.keys(eliteMap.cells) );
      newGenomeClassScores[ randomClassKey ] = {
        score: allFitnessValues[0],
        duration,
        noteDelta,
        velocity
      };
    } else {
      // call the diversity projection service
      const diversityProjection = await getDiversityFromWebsocket(
        allFeaturesToProject,
        undefined, // allFitnessValues, // TODO: not using fitnes values for unique cell projection for now
        evaluationDiversityHost
      );

      const { feature_map, fitness_values, indices_to_keep } = diversityProjection;

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
        const diversityMapKey = feature_map[i].join(",");

        if( newGenomeFeatureVector) cellFeatures[ diversityMapKey ] = newGenomeFeatureVector;

        newGenomeClassScores[ diversityMapKey ] = {
          score: newGenomeFitnessValue,
          duration,
          noteDelta,
          velocity
        };
      }
    }
    
  }
  
  // TODO: this is dependent on only one genome being evaluated at a time (so the for loop above is pointless atm):
  // - might want to return an array of newGenomeClassScores, one for each genomeString
  // - then the search promise in each batchIteration would need to resolve with an array of newGenomeClassScores
  return newGenomeClassScores;
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

function saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, generationNumber ) {
  const eliteMapFileName = `${getEliteMapKey(evolutionRunId, generationNumber)}.json`;
  const eliteMapFilePath = `${evoRunDirPath}${eliteMapFileName}`;
  const eliteMapStringified = JSON.stringify(eliteMap, null, 2); // prettified to obtain the benefits (compression of git diffs)
  fs.writeFileSync( eliteMapFilePath, eliteMapStringified );

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

function saveGenomeToDisk( genome, evolutionRunId, genomeId, evoRunDirPath, addToGit ) {
  const genomeKey = getGenomeKey(evolutionRunId, genomeId);
  const genomeFileName = `${genomeKey}.json`;
  const genomeFilePath = `${evoRunDirPath}${genomeFileName}`;
  const genomeString = JSON.stringify({
    _id: genomeKey,
    genome
  });
  fs.writeFileSync( genomeFilePath, genomeString );
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
    shouldTerminate = condition <= eliteMap.generationNumber;
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
