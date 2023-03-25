import fs from 'fs';
import {
  runCmd, spawnCmd, 
  getEvoRunDirPath,
  readGenomeAndMetaFromDisk
} from './util/qd-common.js';
import nthline from 'nthline';
import {
	getAudioBufferFromGenomeAndMeta
} from 'kromosynth';
import { getAudioContext, getNewOfflineAudioContext, playAudio } from './util/rendering-common.js';

export async function calculateQDScoresForAllIterations( evoRunConfig, evoRunId, stepSize = 1 ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId );
  const commitCount = getCommitCount( evoRunConfig, evoRunId, commitIdsFilePath );
  const qdScores = new Array(Math.ceil(commitCount / stepSize));
  for( let iterationIndex = 0, qdScoreIndex = 0; iterationIndex < commitCount; iterationIndex+=stepSize, qdScoreIndex++ ) {
    if( iterationIndex % stepSize === 0 ) {
      qdScores[qdScoreIndex] = await calculateQDScoreForOneIteration( 
        evoRunConfig, evoRunId, iterationIndex
      );
    }
  }
  const qdScoresStringified = JSON.stringify(qdScores);
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const qdScoresFilePath = `${evoRunDirPath}qd-scores.json`;
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

export async function playAllClassesInEliteMap(evoRunConfig, evoRunId, iterationIndex, scoreThreshold) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const eliteMap = await getEliteMap( evoRunConfig, evoRunId, iterationIndex );
  const cellKeys = Object.keys(eliteMap.cells);
  for( const oneCellKey of cellKeys ) {
    if( eliteMap.cells[oneCellKey].elts.length ) {
      const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
      const score = eliteMap.cells[oneCellKey].elts[0].s;
      if( undefined === scoreThreshold || scoreThreshold <= score ) {
        const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, evoRunDirPath );
        const genomeAndMeta = JSON.parse( genomeString );
        const tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === oneCellKey);
        const { duration, noteDelta, velocity } = tagForCell;
        const audioBuffer = await getAudioBufferFromGenomeAndMeta(
          genomeAndMeta,
          duration, noteDelta, velocity, 
          false, // reverse,
          false, // asDataArray
          getNewOfflineAudioContext( duration ),
          getAudioContext(),
          true, // useOvertoneInharmonicityFactors
        );
        console.log("Playing class", oneCellKey, "for", (iterationIndex === undefined ? "last iteration": "iteration "+iterationIndex), "in evo run", evoRunId, "; duration", duration, ", note delta", noteDelta, " and velocity", velocity );
        playAudio( audioBuffer );
        await new Promise(resolve => setTimeout(resolve, duration*1000));
      }
    }
  }
}

export async function playOneClassAcrossEvoRun(evoRunConfig, evoRunId, iterationIndex, scoreThreshold) {

}

async function getEliteMap( evoRunConfig, evoRunId, iterationIndex ) {
  const commitId = await getCommitID( evoRunConfig, evoRunId, iterationIndex );
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const eliteMapString = await spawnCmd(`git -C ${evoRunDirPath} show ${commitId}:elites_${evoRunId}.json`, {}, true);
  const eliteMap = JSON.parse(eliteMapString);
  return eliteMap;
}

async function getCommitID( evoRunConfig, evoRunId, iterationIndex ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunConfig, evoRunId );
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

function getCommitIdsFilePath( evoRunConfig, evoRunId ) {
  const evoRunDirPath = getEvoRunDirPath( evoRunConfig, evoRunId );
  const commitIdsFileName = "commit-ids.txt";
  const commitIdsFilePath = `${evoRunDirPath}${commitIdsFileName}`;
  if( ! fs.existsSync(`${evoRunDirPath}/commit-ids.txt`) ) {
    runCmd(`git -C ${evoRunDirPath} rev-list master --first-parent --reverse > ${commitIdsFilePath}`);
  }
  return commitIdsFilePath;
}