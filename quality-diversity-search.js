import fs from 'fs';
import NodeWebAudioAPI from 'node-web-audio-api';
const { OfflineAudioContext } = NodeWebAudioAPI;
import {ulid} from 'ulid';
import Chance from 'chance';
import { getAudioGraphMutationParams, getAudioContext } from "./kromosynth.js";
import { yamnetTags } from 'kromosynth/workers/audio-classification/classificationTags.js';
import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getClassScoresForGenome,
  getGenomeFromGenomeString
} from 'kromosynth';

/**
 * 
 * @param {string} evolutionRunId Identifier for the evolution run
 * @param {object} evolutionRunConfig Configuration JSON for this evolution run, such as:
 * {
 *  "seedEvals": 100,
 *  "terminationCondition": {
 *   {"numberOfEvals": x}
 *   or
 *   {"averageFitnessInMap": x}
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
    useGpuForTensorflow
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
  while( ! shouldTerminate(terminationCondition, eliteMap) ) {
    let newGenome;
    let randomClassKey;
    const parentGenomes = [];
    if( eliteMap.generationNumber < seedEvals ) {
      newGenome = getNewAudioSynthesisGenome(
        evolutionRunId,
        eliteMap.generationNumber,
        undefined,
        evolutionaryHyperparameters
      );
    } else {
      const classKeys = Object.keys(eliteMap.cells);
      const classBiases = classKeys.map( ck =>
        undefined === eliteMap.cells[ck].unproductiveBiasCounter ? 10 : eliteMap.cells[ck].unproductiveBiasCounter
      );
      randomClassKey = chance.weighted(classKeys, classBiases);

      const classEliteGenomeId = getCurrentClassElite(randomClassKey, eliteMap).genome;
      const classEliteGenome = await readGenomeAndMetaFromDisk( evolutionRunId, classEliteGenomeId, evoRunDirPath );
      parentGenomes.push( {
        genomeId: classEliteGenome.id,
        eliteClass: randomClassKey
      } );
      newGenome = await getNewAudioSynthesisGenomeByMutation(
        classEliteGenome,
        evolutionRunId, eliteMap.generationNumber, -1, algorithmKey, getAudioContext(),
        probabilityMutatingWaveNetwork,
        probabilityMutatingPatch,
        audioGraphMutationParams,
        evolutionaryHyperparameters,
        OfflineAudioContext,
        patchFitnessTestDuration
      );
      // TODO conditional getNewAudioSynthesisGenomeByCrossover
    }

    const genomeId = ulid();

    const newGenomeClassScores = await getClassScoresForGenome(
        newGenome,
        classScoringDurations,
        classScoringNoteDeltas,
        classScoringVelocities,
        classificationGraphModel,
        useGpuForTensorflow,
        true // supplyAudioContextInstances
      )
      .catch( async e => {
        console.error("mapElites -> getClassScoresForGenome: ", e);
      } );
    if( newGenomeClassScores !== undefined ) {
      const eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap );
      if( eliteClassKeys.length > 0 ) {
        // const genomeSavedInDB = await this.saveToGenomeMap(evolutionRunId, genomeId, newGenome);
        newGenome.tags = [];
        for( const classKey of eliteClassKeys ) {
          const {score, duration, noteDelta, velocity} = newGenomeClassScores[classKey];
          const updated = Date.now();
          eliteMap.cells[classKey].champions.push({
            genome: genomeId,
            duration,
            noteDelta,
            velocity,
            score,
            generationNumber: eliteMap.generationNumber,
            parentGenomes
          });
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
    saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId, eliteMap.generationNumber ); // generation specific map
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
  const { classificationGraphModel } = evolutionRunConfig;
  let eliteMap = {
    _id: getEliteMapKey(evolutionRunId),
    algorithm,
    evolutionRunConfig, evolutionaryHyperparameters,
    generationNumber: 0,
    cells: {} // aka classes or niches
  };
  const classifierTags = getClassifierTags(classificationGraphModel);
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
console.log("saveGenomeToDisk");
  const genomeKey = getGenomeKey(evolutionRunId, genomeId);
  const genomeFilePath = `${evoRunDirPath}${genomeKey}.json`;
  const genomeString = JSON.stringify({
    _id: genomeKey,
    genome
  });
  fs.writeFileSync( genomeFilePath, genomeString );
console.log("wrote file");
}

async function readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath ) {
console.log("readGenomeFromDisk");
  let genome;
  try {
    const genomeKey = getGenomeKey(evolutionRunId, genomeId);
    const genomeFilePath = `${evoRunDirPath}${genomeKey}.json`;
    if( fs.existsSync(genomeFilePath) ) {
      const genomeJSONString = fs.readFileSync(genomeFilePath, 'utf8');
      genome = await getGenomeFromGenomeString( genomeJSONString );
    }
  } catch( err ) {
    console.error("readGenomeFromDisk: ", err);
  }
  return genome;
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

function getClassifierTags( graphModel ) {
  switch (graphModel) {
    case "yamnet":
      return yamnetTags;
    default:

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
 * {percentageOfMapFilledWithFitnessThreshold: {percentage: x, minimumCellFitness: x}}
 */
function shouldTerminate( terminationCondition, eliteMap ) {
  let condition;
  let shouldTerminate = false;
  if( condition = terminationCondition["numberOfEvals"] ) {
    shouldTerminate = condition <= eliteMap.generationNumber;
  } else if( condition = terminationCondition["averageFitnessInMap"] ) {
    const cellsKeysWithChampions = Object.keys(eliteMap.cells).filter(oneClassKey => eliteMap.cells[oneClassKey].champions.length);
    const averageFitness = cellsKeysWithChampions.reduce((a, b) => 
      eliteMap.cells[a].champions[eliteMap.cells[a].champions.length-1].score + eliteMap.cells[b].champions[eliteMap.cells[b].champions.length-1].score 
    ) / cellsKeysWithChampions.length;
    shouldTerminate = condition <= averageFitness;
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