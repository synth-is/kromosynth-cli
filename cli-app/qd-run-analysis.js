import fs from 'fs';
import {
  runCmd, spawnCmd,
  getEvoRunDirPath,
  readGenomeAndMetaFromDisk
} from './util/qd-common.js';
import nthline from 'nthline';
import {
	getAudioBufferFromGenomeAndMeta, getGenomeFromGenomeString
} from 'kromosynth';
import { getAudioContext, getNewOfflineAudioContext, playAudio } from './util/rendering-common.js';
import figlet from 'figlet';
import { log } from 'console';


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
