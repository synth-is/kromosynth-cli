import fs from 'fs';
import {ulid} from 'ulid';
import Chance from 'chance';
import { getAudioGraphMutationParams } from "./kromosynth.js";
import { yamnetTags } from 'kromosynth/workers/audio-classification/classificationTags.js';
import {
  getClassScoresForGenome,
  getGenomeFromGenomeString
} from 'kromosynth';
import { randomGene, geneVariation } from './service/gene-factory.js';
import { evaluate } from './service/gene-evaluation.js';

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
export async function mapElites( evolutionRunId, evolutionRunConfig, evolutionaryHyperparameters
  // seedEvals, terminationCondition, evoRunsDirPath 
) {
  const algorithmKey = 'mapElites_with_unproductiveBiasCounter';
  const {
    seedEvals, terminationCondition, evoRunsDirPath,
    probabilityMutatingWaveNetwork, probabilityMutatingPatch,
    classScoringDurations, classScoringNoteDeltas, classScoringVelocities, classificationGraphModel,
    useGpuForTensorflow,
    eliteMapSnapshotEvery,
    dummyRun
  } = evolutionRunConfig;
  const evoRunDirPath = `${evoRunsDirPath}${evolutionRunId}/`;
  let eliteMap = readEliteMapFromDisk( evolutionRunId, evoRunDirPath );
  if( ! eliteMap ) {
    eliteMap = initializeGrid( evolutionRunId, algorithmKey, evolutionRunConfig, evolutionaryHyperparameters );
    createEvoRunDir( evoRunDirPath );
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, 0 ); // generation specific map
  }
  const audioGraphMutationParams = getAudioGraphMutationParams( evolutionaryHyperparameters );
  const patchFitnessTestDuration = 0.1;
  const chance = new Chance();

  while( ! shouldTerminate(terminationCondition, eliteMap, dummyRun) ) {
    let newGenome;
    let randomClassKey;
    const parentGenomes = [];


    ///// gene factory

    if( eliteMap.generationNumber < seedEvals ) {

      newGenome = randomGene( evolutionRunId, eliteMap.generationNumber, evolutionaryHyperparameters );

    } else {

      ///// selection 

      const classKeys = Object.keys(eliteMap.cells);
      const classBiases = classKeys.map( ck =>
        undefined === eliteMap.cells[ck].unproductiveBiasCounter ? 10 : eliteMap.cells[ck].unproductiveBiasCounter
      );
      randomClassKey = chance.weighted(classKeys, classBiases);

      const {
        genome: classEliteGenomeId, duration, noteDelta, velocity, score, generationNumber
      } = getCurrentClassElite(randomClassKey, eliteMap);
      const classEliteGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, classEliteGenomeId, evoRunDirPath );

      parentGenomes.push( {
        genomeId: classEliteGenomeId,
        eliteClass: randomClassKey,
        duration, noteDelta, velocity, score, generationNumber
      } );

      if( dummyRun ) {
        newGenome = await getGenomeFromGenomeString( classEliteGenomeString );
      } else {

        ///// variation

        newGenome = await geneVariation(
          classEliteGenomeString,
          evolutionRunId, eliteMap.generationNumber, algorithmKey,
          probabilityMutatingWaveNetwork,
          probabilityMutatingPatch,
          audioGraphMutationParams,
          evolutionaryHyperparameters,
          patchFitnessTestDuration
        );
      }
    }

    const genomeId = ulid();

    let newGenomeClassScores;
    if( dummyRun && dummyRun.iterations ) {
      newGenomeClassScores = getDummyClassScoresForGenome( Object.keys(eliteMap.cells), eliteMap.generationNumber, dummyRun.iterations );
    } else {

      ///// evaluate

      newGenomeClassScores = await evaluate(
        newGenome,
        classScoringDurations,
        classScoringNoteDeltas,
        classScoringVelocities,
        classificationGraphModel,
        useGpuForTensorflow,
        true // supplyAudioContextInstances
      );

    }

    ///// add to archive

    if( newGenomeClassScores !== undefined ) {
      const eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap );
      if( eliteClassKeys.length > 0 ) {
        // const genomeSavedInDB = await this.saveToGenomeMap(evolutionRunId, genomeId, newGenome);
        newGenome.tags = [];
        newGenome.parentGenomes = parentGenomes.length ? parentGenomes : undefined;
        for( const classKey of eliteClassKeys ) {
          const {score, duration, noteDelta, velocity} = newGenomeClassScores[classKey];
          const updated = Date.now();
          eliteMap.cells[classKey].champions = [
          // .push(
          {
            genome: genomeId,
            duration,
            noteDelta,
            velocity,
            score,
            generationNumber: eliteMap.generationNumber,
            parentGenomes: parentGenomes.length ? parentGenomes : undefined
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
          if( eliteMap[classKey].champions.length > 2 ) {
            // const lastTopEliteGenomeId = eliteMap[classKey].champions[ eliteMap[classKey].champions.length-2 ].genome;
            // delete genomeMap[lastTopEliteGenomeId];
            eliteMap[classKey].champions = eliteMap[classKey].champions.slice( - 1 );
          }
          */
          // if( !eliteMapExtra[classKey] ) eliteMapExtra[classKey] = {};
          eliteMap.cells[classKey].unproductiveBiasCounter = 10;
        }
        await saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath );
        if( randomClassKey ) {
          eliteMap.cells[randomClassKey].unproductiveBiasCounter = 10;
        }
      } else if( randomClassKey ) {
        // bias search away from exploring niches that produce fewer innovations
        eliteMap.cells[randomClassKey].unproductiveBiasCounter -= 1; // TODO should stop at zero?
      }
    }
    console.log("iteration", eliteMap.generationNumber);
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
    if( eliteMap.generationNumber % eliteMapSnapshotEvery === 0 ) {
      saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, eliteMap.generationNumber ); // generation specific map
    }
    eliteMap.generationNumber++;
  }
  console.log("eliteMap",eliteMap);
  process.exit();
}

function getClassKeysWhereScoresAreElite( classScores, eliteMap ) {
  return Object.keys(classScores).filter( classKey =>
    ! getCurrentClassElite(classKey, eliteMap)
    || getCurrentClassElite(classKey, eliteMap).score < classScores[classKey].score
  );
}

function initializeGrid( evolutionRunId, algorithm, evolutionRunConfig, evolutionaryHyperparameters ) {
  const { classificationGraphModel, dummyRun } = evolutionRunConfig;
  let eliteMap = {
    _id: getEliteMapKey(evolutionRunId),
    algorithm,
    evolutionRunConfig, evolutionaryHyperparameters,
    generationNumber: 0,
    cells: {} // aka classes or niches
  };
  const classifierTags = getClassifierTags(classificationGraphModel, dummyRun);
  classifierTags.forEach((oneTag, i) => {
    eliteMap.cells[oneTag] = {
      champions: []
    };
  });
  return eliteMap;
}

function createEvoRunDir( evoRunDirPath ) {
  if( ! fs.existsSync(evoRunDirPath) ) fs.mkdirSync( evoRunDirPath, { recursive: true } );
}

function saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, generationNumber ) {
  const eliteMapFilePath = `${evoRunDirPath}${getEliteMapKey(evolutionRunId, generationNumber)}.json`;
  const eliteMapStringified = JSON.stringify(eliteMap);
  fs.writeFileSync( eliteMapFilePath, eliteMapStringified );
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

function saveGenomeToDisk( genome, evolutionRunId, genomeId, evoRunDirPath ) {
  const genomeKey = getGenomeKey(evolutionRunId, genomeId);
  const genomeFilePath = `${evoRunDirPath}${genomeKey}.json`;
  const genomeString = JSON.stringify({
    _id: genomeKey,
    genome
  });
  fs.writeFileSync( genomeFilePath, genomeString );
}

async function readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath ) {
  let genomeJSONString;
  try {
    const genomeKey = getGenomeKey(evolutionRunId, genomeId);
    const genomeFilePath = `${evoRunDirPath}${genomeKey}.json`;
    if( fs.existsSync(genomeFilePath) ) {
      genomeJSONString = fs.readFileSync(genomeFilePath, 'utf8');
    }
  } catch( err ) {
    console.error("readGenomeFromDisk: ", err);
  }
  return genomeJSONString;
}

function getEliteMapKey( evolutionRunId, generationNumber ) {
  if( undefined === generationNumber ) {
    return `elites_${evolutionRunId}`;
  } else {
    return `elites_${evolutionRunId}_${generationNumber}`;
  }
}

function getGenomeKey( evolutionRunId, genomeId ) {
  return `genome_${evolutionRunId}_${genomeId}`;
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
  if( classElites && classElites.champions.length > 0 ) {
    currentClassElite = classElites.champions[classElites.champions.length-1];
  } else {
    if( ! classElites ) {
      eliteMap.cells[classKey] = {champions:[]};
      eliteMap.cells[classKey] = {unproductiveBiasCounter:10};
    }
    currentClassElite = null;
  }
  return currentClassElite;
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
        scoreSum += eliteMap.cells[oneCellKey].champions[eliteMap.cells[oneCellKey].champions.length-1].score;
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
      if( minimumCellFitness <= eliteMap.cells[oneClassKey].champions[eliteMap.cells[oneClassKey].champions.length-1].score ) {
        cellsWithFitnessOverThresholdCount++;
      }
    });
    const cellsWithFitnessOverThresholdPercentage = cellsWithFitnessOverThresholdCount / cellCount;
    shouldTerminate = ( percentage <= cellsWithFitnessOverThresholdPercentage );
  }
  return shouldTerminate;
}

const getCellKeysWithChampions = cells => Object.keys(cells).filter(oneClassKey => cells[oneClassKey].champions.length);

const getScoresForCellKeys = (cellKeys, cells) => cellKeys.map( oneCellKey => cells[oneCellKey].champions[cells[oneCellKey].champions.length-1].score );

// https://github.com/30-seconds/30-seconds-of-code/blob/master/snippets/median.md
const median = arr => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

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