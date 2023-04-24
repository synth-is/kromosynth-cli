import fs from 'fs';
import {ulid} from 'ulid';
import Chance from 'chance';
import { getAudioGraphMutationParams } from "./kromosynth.js";
import { yamnetTags } from 'kromosynth/workers/audio-classification/classificationTags.js';
import {
  getGenomeFromGenomeString
} from 'kromosynth';
// import { callRandomGeneService } from './service/gene-random-worker-client.js';
import {
  callRandomGeneService,
  callGeneVariationService,
  callGeneEvaluationService,
  clearServiceConnectionList
} from './service/gRPC/gene_client.js';
import {
  runCmd, readGenomeAndMetaFromDisk, getGenomeKey
} from './util/qd-common.js';

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
 *  "classificationGraphModel": "yamnet",
 *  "useGpuForTensorflow": true
 * }
 * @param {object} evolutionaryHyperparameters
 */
export async function mapElites(
  evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters,
  exitWhenDone = true
  // seedEvals, terminationCondition, evoRunsDirPath
) {
  const algorithmKey = 'mapElites_with_uBC';
  const {
    seedEvals, terminationCondition, evoRunsDirPath,
    probabilityMutatingWaveNetwork, probabilityMutatingPatch,
    classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
    classificationGraphModel,
    useGpuForTensorflow,
    eliteMapSnapshotEvery,
    geneVariationServers,
    geneEvaluationServers,
    dummyRun
  } = evolutionRunConfig;
  const evoRunDirPath = `${evoRunsDirPath}${evolutionRunId}/`;
  const evoRunFailedGenesDirPath = `${evoRunsDirPath}${evolutionRunId}_failed-genes/`;
  let eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath );
  if( ! eliteMap ) {
    eliteMap = initializeGrid( evolutionRunId, algorithmKey, evolutionRunConfig, evolutionaryHyperparameters );

    // initialise git
    runCmd(`git init ${evoRunDirPath}`);

    createEvoRunDir( evoRunDirPath );
    createEvoRunDir( evoRunFailedGenesDirPath );
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, 0 ); // generation specific map

    // add file to git
    const eliteMapFileName = `${getEliteMapKey(evolutionRunId)}.json`;
    runCmd(`git -C ${evoRunDirPath} add ${eliteMapFileName}`);
  }
  const audioGraphMutationParams = getAudioGraphMutationParams( evolutionaryHyperparameters );
  const patchFitnessTestDuration = 0.1;
  const chance = new Chance();

  let searchBatchSize;
  if( dummyRun ) {
    searchBatchSize = dummyRun.searchBatchSize;
  } else {
    searchBatchSize = geneEvaluationServers.length;
  }

  // turn of automatic garbage collection,
  // as automatic background runs seem to affect performance when performing rapid successive commits
  // - gc will be triggered manually at regular intervals below
  runCmd('git config --global gc.auto 0');

  while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
    const searchPromises = new Array(searchBatchSize);
    for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {
      console.log("batchIteration", batchIteration);
      let geneVariationServerHost;
      let geneEvaluationServerHost;
      if( dummyRun ) {
        geneVariationServerHost = geneVariationServers[0];
        geneEvaluationServerHost = geneEvaluationServers[0];
      } else {
        geneVariationServerHost = geneVariationServers[ batchIteration % geneVariationServers.length ];
        geneEvaluationServerHost = geneEvaluationServers[ batchIteration % geneEvaluationServers.length ];
      }
      console.log("geneVariationServerHost",geneVariationServerHost);
      console.log("geneEvaluationServerHost",geneEvaluationServerHost);
      searchPromises[batchIteration] = new Promise( async (resolve, reject) => {

        let randomClassKey;
        const parentGenomes = [];

        ///// gene initialisation

        let newGenomeString;
        if( eliteMap.generationNumber < seedEvals ) {

          try {
            newGenomeString = await callRandomGeneService(
              evolutionRunId, eliteMap.generationNumber, evolutionaryHyperparameters,
              geneVariationServerHost
            );
          } catch (error) {
            console.error("Error calling gene seed service: " + error);
            clearServiceConnectionList(geneVariationServerHost);
          }

        } else {
          ///// selection
          const classKeys = Object.keys(eliteMap.cells);
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
            } catch (error) {
              console.error("Error calling gene variation service: " + error);
              clearServiceConnectionList(geneVariationServerHost);
            }

          }
        } // if( eliteMap.generationNumber < seedEvals ) {

        const genomeId = ulid();

        let newGenomeClassScores;
        if( dummyRun && dummyRun.iterations ) {
          newGenomeClassScores = getDummyClassScoresForGenome( Object.keys(eliteMap.cells), eliteMap.generationNumber, dummyRun.iterations );
        } else if( newGenomeString ) {

          ///// evaluate

          newGenomeClassScores = await callGeneEvaluationService(
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
            }
          );
        }
        console.log("Resolution for genome ID" + genomeId + ", class scores defined: " + (newGenomeClassScores!==undefined) + ", evaluation host: " + geneEvaluationServerHost, " - Music score:", newGenomeClassScores && newGenomeClassScores["Music"] ? newGenomeClassScores["Music"].score : "N/A" );
        resolve({
          genomeId,
          randomClassKey,
          newGenomeString,
          newGenomeClassScores,
          parentGenomes
        });

      }); // new Promise( async (resolve) => {
    } // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

    await Promise.all( searchPromises ).then( async (batchIterationResults) => {
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
            eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap );
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
            await saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath, true );
            if( randomClassKey ) {
              eliteMap.cells[randomClassKey].uBC = 10;
            }
          } else if( randomClassKey ) { // if( eliteClassKeys.length > 0 ) {

            // bias search away from exploring niches that produce fewer innovations
            eliteMap.cells[randomClassKey].uBC -= 1; // TODO should stop at zero?
          }
          console.log("iteration", eliteMap.generationNumber,"eliteCountAtGeneration:",eliteClassKeys.length);
          eliteMap.eliteCountAtGeneration = eliteClassKeys.length;
          saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
          if( eliteMap.generationNumber % eliteMapSnapshotEvery === 0 ) {
            // saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, eliteMap.generationNumber ); // generation specific map
            // runCmd(`git -C ${evoRunDirPath} gc --prune=now`);
            // runCmd(`git -C ${evoRunDirPath} gc`);
          }

          // git commit iteration
          runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);

          eliteMap.generationNumber++;

        } // if( newGenomeClassScores !== undefined ) {

      } // for( let oneBatchIterationResult of batchIterationResults ) {

    }); // await Promise.all( searchPromises ).then( async (batchIterationResult) => {

  } // while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
  eliteMap.terminated = true;
  saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId );
  console.log("eliteMap",eliteMap);
  // collect git garbage
  runCmd(`git -C ${evoRunDirPath} gc`);
  if( exitWhenDone ) process.exit();
}

function getClassKeysWhereScoresAreElite( classScores, eliteMap ) {
  return Object.keys(classScores).filter( classKey =>
    ! getCurrentClassElite(classKey, eliteMap)
    || getCurrentClassElite(classKey, eliteMap).s < classScores[classKey].score
  );
}

function initializeGrid( evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters ) {
  const { classificationGraphModel, dummyRun } = evolutionRunConfig;
  let eliteMap = {
    _id: getEliteMapKey(evolutionRunId),
    algorithm,
    evolutionRunConfig, evolutionaryHyperparameters,
    generationNumber: 0,
    eliteCountAtGeneration: 0,
    terminated: false,
    cells: {} // aka classes or niches
  };
  const classifierTags = getClassifierTags(classificationGraphModel, dummyRun);
  classifierTags.forEach((oneTag, i) => {
    eliteMap.cells[oneTag] = {
      elts: []
    };
  });
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

function getClassifierTags( graphModel, dummyRun ) {
  if( dummyRun && dummyRun.cellCount ) {
    return getDummyLabels(dummyRun.cellCount);
  } else {
    switch (graphModel) {
      case "yamnet":
        return yamnetTags;
      default:

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


// https://chat-gpt.org/chat
function calcStandardDeviation(numbers) {
  // calculate the mean
  const mean = numbers.reduce((total, num) => total + num) / numbers.length;

  // calculate the sum of squared deviations from the mean
  const deviations = numbers.map(num => (num - mean) ** 2);
  const sumOfDeviations = deviations.reduce((total, deviation) => total + deviation);

  // calculate the standard deviation
  const variance = sumOfDeviations / numbers.length;
  const standardDeviation = Math.sqrt(variance);

  return standardDeviation;
}

function calculateMeanDeviation(numbers) {
  // Calculate the mean of the array
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;

  // Calculate the deviations of each number from the mean
  const deviations = numbers.map(num => Math.abs(num - mean));

  // Calculate the mean deviation
  const meanDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

  // Return the result
  return meanDeviation;
}

// https://github.com/30-seconds/30-seconds-of-code/blob/master/snippets/median.md
const median = arr => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

// function median(arr) {
//   const mid = Math.floor(arr.length / 2);
//   const nums = [...arr].sort((a, b) => a - b);
//   return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
// }

function medianAbsoluteDeviation(arr) {
  const med = median(arr);
  const absDeviation = arr.map((el) => Math.abs(el - med));
  return median(absDeviation);
}
