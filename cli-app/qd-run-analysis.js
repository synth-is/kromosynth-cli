import fs from 'fs';
import {
  runCmd, spawnCmd,
  getEvoRunDirPath,
  readGenomeAndMetaFromDisk,
  calcVariance, calcStandardDeviation, calcMeanDeviation
} from './util/qd-common.js';
import nthline from 'nthline';
import {
	getAudioBufferFromGenomeAndMeta, getGenomeFromGenomeString
} from 'kromosynth';
import { getAudioContext, getNewOfflineAudioContext, playAudio } from './util/rendering-common.js';
import figlet from 'figlet';
import { log } from 'console';
import { get } from 'http';


///// QD score

export async function calculateQDScoresForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const qdScores = new Array(Math.ceil(commitCount / stepSize));
  for( let iterationIndex = 0, qdScoreIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, qdScoreIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating QD score for iteration ${iterationIndex}...`);
      qdScores[qdScoreIndex] = await calculateQDScoreForOneIteration(
        evoRunConfig, evoRunId, iterationIndex
      );
    }
  }
  const qdScoresStringified = JSON.stringify(qdScores);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const qdScoresFilePath = `${evoRunDirPath}qd-scores_step-${stepSize}.json`;
  fs.writeFileSync( qdScoresFilePath, qdScoresStringified );
  return qdScores;
}

export async function calculateQDScoreForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const cellCount = cellKeys.length;
  let cumulativeScore = 0;
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      cumulativeScore += parseFloat(eliteMap.cells[oneCellKey].elts[0].s);
    }
  }
  const qdScore = cumulativeScore / cellCount;
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

export async function getCoverageForOneIteration( evoRunConfig, evoRunId, iterationIndex, scoreThreshold = 0 ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
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

export async function getCoverageForAllIterations( evoRunConfig, evoRunId, stepSize = 1, scoreThreshold = 0 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const coverages = new Array(Math.ceil(commitCount / stepSize));
  for( let iterationIndex = 0, coverageIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, coverageIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating coverage for iteration ${iterationIndex}...`);
      coverages[coverageIndex] = await getCoverageForOneIteration(
        evoRunConfig, evoRunId, iterationIndex, scoreThreshold
      );
    }
  }
  const coveragesStringified = JSON.stringify(coverages);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const coveragesFilePath = `${evoRunDirPath}coverages_step-${stepSize}_threshold-${scoreThreshold}.json`;
  fs.writeFileSync( coveragesFilePath, coveragesStringified );
  return coverages;
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

export async function getGenomeSetsForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const genomeSets = new Array(Math.ceil(commitCount / stepSize));
  const genomeSetsAdditions = new Array(Math.ceil(commitCount / stepSize)); // new genomes added in each iteration
  const genomeSetsRemovals = new Array(Math.ceil(commitCount / stepSize)); // genomes removed in each iteration
  for( let iterationIndex = 0, genomeSetsIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, genomeSetsIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating genome sets for iteration ${iterationIndex}...`);
      genomeSets[genomeSetsIndex] = await getGenomeSetsForOneIteration(
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
  return { genomeSets, genomeSetsAdditions, genomeSetsRemovals };
}

export async function getGenomeCountsForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const genomeSetsCollection = await getGenomeSetsForAllIterations( evoRunConfig, evoRunId, stepSize );
  return { // conversion to arrays for JSON.stringify
    genomeCount: genomeSetsCollection.genomeSets.map( oneSet => [...oneSet].length ), 
    genomeSetsAdditions: genomeSetsCollection.genomeSetsAdditions.map( oneSet => [...oneSet].length ),
    genomeSetsRemovals: genomeSetsCollection.genomeSetsRemovals.map( oneSet => [...oneSet].length )
  };
}

///// network complexity

export async function getGenomeStatisticsAveragedForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const genomeStatistics = new Array(Math.ceil(commitCount / stepSize));
  for( let iterationIndex = 0, genomeStatisticsIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, genomeStatisticsIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      console.log(`Calculating genome statistics for iteration ${iterationIndex}...`);
      genomeStatistics[genomeStatisticsIndex] = await getGenomeStatisticsAveragedForOneIteration(
        evoRunConfig, evoRunId, iterationIndex
      );
    }
  }
  const genomeStatisticsStringified = JSON.stringify(genomeStatistics);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const genomeStatisticsFilePath = `${evoRunDirPath}genome-statistics_step-${stepSize}.json`;
  fs.writeFileSync( genomeStatisticsFilePath, genomeStatisticsStringified );
  return genomeStatistics;
}

export async function getGenomeStatisticsAveragedForOneIteration( evoRunConfig, evoRunId, iterationIndex ) {
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  const cellCount = cellKeys.length;
  let cumulativeCppnNodeCount = 0;
  let cumulativeCppnConnectionCount = 0;
  let cumulativeAsNEATPatchNodeCount = 0;
  let cumulativeAsNEATPatchConnectionCount = 0;
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
      // TODO might want to ensure this is done only once per unique genomeId, to avoid unnecessary disk reads
      const {
        cppnNodeCount, cppnConnectionCount, asNEATPatchNodeCount, asNEATPatchConnectionCount
      } = await getGenomeStatistics( genomeId, evoRunConfig, evoRunId );
      cumulativeCppnNodeCount += cppnNodeCount;
      cumulativeCppnConnectionCount += cppnConnectionCount;
      cumulativeAsNEATPatchNodeCount += asNEATPatchNodeCount;
      cumulativeAsNEATPatchConnectionCount += asNEATPatchConnectionCount;
    }
  }
  const averageCppnNodeCount = cumulativeCppnNodeCount / cellCount;
  const averageCppnConnectionCount = cumulativeCppnConnectionCount / cellCount;
  const averageAsNEATPatchNodeCount = cumulativeAsNEATPatchNodeCount / cellCount;
  const averageAsNEATPatchConnectionCount = cumulativeAsNEATPatchConnectionCount / cellCount;
  return {
    averageCppnNodeCount, averageCppnConnectionCount, averageAsNEATPatchNodeCount, averageAsNEATPatchConnectionCount
  };
}

async function getGenomeStatistics( genomeId, evoRunConfig, evoRunId ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
  const genomeAndMeta = await getGenomeFromGenomeString( genomeString, {} /*evoParams*/ );
  const cppnNodeCount = genomeAndMeta.waveNetwork.offspring.nodes.length;
  const cppnConnectionCount = genomeAndMeta.waveNetwork.offspring.connections.length;
  const asNEATPatchNodeCount = genomeAndMeta.asNEATPatch.nodes.length;
  const asNEATPatchConnectionCount = genomeAndMeta.asNEATPatch.connections.length;
  // console.log("genomeId:", genomeId, "cppnNodeCount:", cppnNodeCount, "cppnConnectionCount:", cppnConnectionCount, "asNEATPatchNodeCount:", asNEATPatchNodeCount, "asNEATPatchConnectionCount:", asNEATPatchConnectionCount);
  return { 
    cppnNodeCount, cppnConnectionCount, asNEATPatchNodeCount, asNEATPatchConnectionCount
  };
}

///// saturation generations

export async function getCellSaturationGenerations( evoRunConfig, evoRunId ) {
  const cellEliteGenerations = {};
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const iterationIndex = commitCount - 1;
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
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
  const eliteGenomeIds = Array.from((await getGenomeSetsForOneIteration( evolutionConfig, evoRunId, iterationIndex )).values());
  const genomeScores = getGenomeScores( evoRunConfig, evoRunId, iterationIndex );
  const scoreVarianceForEliteGenomes = getScoreVarianceForGenomes( evoRunConfig, evoRunId, iterationIndex, eliteGenomeIds, genomeScores );
  return scoreVarianceForEliteGenomes;
}

export async function getScoreVarianceForOneIteration( evoRunConfig, evoRunId, iterationIndex, stepSize = 1 ) {
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
  const scoreVariance = calcVariance( mapScores );
  const scoreStandardDeviation = calcStandardDeviation( mapScores );
  const scoreMeanDeviation = calcMeanDeviation( mapScores );
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

export async function getElitesEnergy( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId, true );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const eliteEnergies = {};
  const eliteIterationEnergies = [];
  for( let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
      const cellKeys = Object.keys(eliteMap.cells);
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
      const oneIterationEnergy = Object.values(eliteEnergies).reduce( (acc, cur) => acc + cur.at(-1).energy, 0 );
      eliteIterationEnergies.push( oneIterationEnergy );
    }
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

// TOODO lineages

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

async function getEliteMap( evoRunConfig, evoRunId, iterationIndex, forceCreateCommitIdsList ) {
  const commitId = await getCommitID( evoRunConfig, evoRunId, iterationIndex );
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const eliteMapString = await spawnCmd(`git -C ${evoRunDirPath} show ${commitId}:elites_${evoRunId}.json`, {}, true);
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
