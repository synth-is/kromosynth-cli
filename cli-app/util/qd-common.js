import { execSync, exec, spawn } from 'child_process';
// import fs from 'fs';
import fs from 'fs-extra';
import { renderAudio } from 'kromosynth';

export function getEvoRunDirPath( evoRunConfig, evoRunId ) {
  const { evoRunsDirPath } = evoRunConfig;
  const evoRunDirPath = `${evoRunsDirPath}${evoRunId}/`;
  return evoRunDirPath;
}

export async function readGenomeAndMetaFromDisk( evolutionRunId, genomeId, evoRunDirPath ) {
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

export function getGenomeKey( evolutionRunId, genomeId ) {
  return `genome_${evolutionRunId}_${genomeId}`;
}


// bjarnij
export function runCmd( cmd ) {
  try {
    return execSync(cmd).toString();
  } catch (e) {
    throw e;
  }
}

export function runCmdAsLines( cmd ) {
  return runCmd( cmd ).split('\n');
}

export function runCmdAsync( cmd ) {
  exec( cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`exec error for cmd ${cmd}: ${err}`);
      return;
    }
  
    console.log(`result of ${cmd}: ${stdout}`);
  });
}

// https://stackoverflow.com/a/68958420/169858 (not restricted by the shell buffer limitation (as `runCmd*` are))
export function spawnCmd(instruction, spawnOpts = {}, silenceOutput = false) {
  return new Promise((resolve, reject) => {
      let errorData = "";

      const [command, ...args] = instruction.split(/\s+/);

      if (process.env.DEBUG_COMMANDS === "true") {
          console.log(`Executing \`${instruction}\``);
          console.log("Command", command, "Args", args);
      }

      const spawnedProcess = spawn(command, args, spawnOpts);

      let data = "";

      spawnedProcess.on("message", console.log);

      spawnedProcess.stdout.on("data", chunk => {
          if (!silenceOutput) {
              console.log(chunk.toString());
          }

          data += chunk.toString();
      });

      spawnedProcess.stderr.on("data", chunk => {
          errorData += chunk.toString();
      });

      spawnedProcess.on("close", function(code) {
          if (code > 0) {
              return reject(new Error(`${errorData} (Failed Instruction: ${instruction})`));
          }

          resolve(data);
      });

      spawnedProcess.on("error", function(err) {
          reject(err);
      });
  });
}


///// stats

// https://chat-gpt.org/chat

export function calcMean( arrayOfNumbers ) {
  return arrayOfNumbers.reduce((a, b) => a + b, 0) / arrayOfNumbers.length;
}

export function calcVariance(numbers) {
  // calculate the mean
  const mean = calcMean( numbers );

  // calculate the sum of squared deviations from the mean
  const deviations = numbers.map(num => (num - mean) ** 2);
  const sumOfDeviations = deviations.reduce((total, deviation) => total + deviation);

  // calculate the variance
  const variance = sumOfDeviations / numbers.length;

  return variance;
}

export function calcStandardDeviation(numbers) { 
  // calculate the standard deviation
  let variance;
  if( !numbers.length || numbers.every( number => number === undefined ) ) {
    variance = 0;
  } else {
    variance = calcVariance(numbers);
  }
  const standardDeviation = Math.sqrt(variance);
  return standardDeviation;
}

export function calcMeanDeviation(numbers) {
  // Calculate the mean of the array
  const mean = calcMean( numbers );

  // Calculate the deviations of each number from the mean
  const deviations = numbers.map(num => Math.abs(num - mean));

  // Calculate the mean deviation
  const meanDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

  // Return the result
  return meanDeviation;
}

// https://github.com/30-seconds/30-seconds-of-code/blob/master/snippets/median.md
export const median = arr => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

// function median(arr) {
//   const mid = Math.floor(arr.length / 2);
//   const nums = [...arr].sort((a, b) => a - b);
//   return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
// }

export function medianAbsoluteDeviation(arr) {
  const med = median(arr);
  const absDeviation = arr.map((el) => Math.abs(el - med));
  return median(absDeviation);
}

///// classification of audio synthesis genomes

// Get audio buffers for class scoring for the given genome
export async function writeEvaluationCandidateWavFilesForGenome(
  genome,
  classScoringDurations = [0.5, 1, 2, 5],
  classScoringNoteDeltas = [-36, -24, -12, 0, 12, 24, 36],
  classScoringVelocities = [0.25, 0.5, 0.75, 1],
  supplyAudioContextInstances,
  evaluationCandidateWavFilesDirPath,
  evolutionRunId, genomeId
) {
  const evaluationCandidateWavFileDirPaths = [];
  const evaluationCandidateWavFilePaths = [];
  for( let duration of classScoringDurations ) {
    for( let noteDelta of classScoringNoteDeltas ) {
      // TODO: choose notes within octave according to classScoringOctaveNoteCount
      for( let velocity of classScoringVelocities ) {

        let offlineAudioContext;
        let audioContext;
        if( supplyAudioContextInstances ) {
          offlineAudioContext = new OfflineAudioContext({
            numberOfChannels: 2,
            length: SAMPLE_RATE * duration,
            sampleRate: SAMPLE_RATE,
          });
          audioContext = getAudioContext();
        } else {
          offlineAudioContext = undefined;
          audioContext = undefined;
        }
        const {asNEATPatch, waveNetwork} = genome;
        const audioBuffer = await renderAudio(
          asNEATPatch, waveNetwork, duration, noteDelta, velocity,
          SAMPLE_RATE, // Essentia.js input extractor sample rate:  https://mtg.github.io/essentia.js/docs/api/machinelearning_tfjs_input_extractor.js.html#line-92
          false, // reverse
          false, // asDataArray
          offlineAudioContext,
          audioContext
        ).catch( e => console.error(`Error from renderAudio called form getGenomeClassPredictions, for genomem ${genome._id}`, e ) );
        if( audioBuffer ) {
        
          const evaluationCandidateFileName = `${evolutionRunId}_${genomeId}_${duration}_${noteDelta}_${velocity}.wav`;
          const evaluationCandidateWavFilePath = `${evaluationCandidateWavFilesDirPath}/${evaluationCandidateFileName}`;

          const wav = toWav(audioBuffer);
          const wavBuffer = Buffer.from(new Uint8Array(wav));
          if( !fs.existsSync(evaluationCandidateWavFilesDirPath) ) fs.mkdirSync(evaluationCandidateWavFilesDirPath);
          fs.writeFileSync(evaluationCandidateWavFilePath, wavBuffer);

          evaluationCandidateWavFilePaths.push( {
            evaluationCandidateWavFilePath,
            duration,
            noteDelta,
            velocity
          } );

        
          evaluationCandidateWavFileDirPaths.push( evaluationCandidateWavFilePath );

          // const wavBlob = new Blob([ new DataView(wav) ], {
          //   type: 'audio/wav'
          // });
          // saveAs( wavBlob, `${freqIdx}_${durIdx}_${velIdx}.wav`, )
        }

      }
    }
  }
  const evaluationCandidatesDirPathsJsonFileName = `${evolutionRunId}_${genomeId}_evaluation-candidate-wav-file-paths.json`;
  const evaluationCandidatesJsonFilePath = `${evaluationCandidateWavFilesDirPath}/${evaluationCandidatesDirPathsJsonFileName}`;
  fs.writeFileSync(evaluationCandidatesJsonFilePath, JSON.stringify(evaluationCandidateWavFilePaths));
  return evaluationCandidatesJsonFilePath;
}

export function populateNewGenomeClassScoresInBatchIterationResultFromEvaluationCandidateWavFiles(
  batchIterationResults,
  classifiers,
  evaluationCandidateWavFilesDirPath
) {
  batchIterationResults = getAudioClassPredictionsCombinedFromExternalClassifiers(
    batchIterationResults,
    classifiers
  );

  // TODO: temporary placeholder for newGenomeClassScores - replace with actual predictions
  batchIterationResults = batchIterationResults.map( batchIterationResult => {
    return {...batchIterationResult, newGenomeClassScores: {}} 
  });

  // delete all files from evaluationCandidateWavFilesDirPath
  fs.emptyDirSync(evaluationCandidateWavFilesDirPath);

  return batchIterationResults;
}

///// object attribute averages and stdvs

export function averageAttributes(data) {
  let attributeSums = {};
  // let attributeCounts = {};
  for (let object of data) {
    for (let attribute in object) {
      if (attributeSums[attribute]) {
        attributeSums[attribute] += object[attribute];
        // attributeCounts[attribute]++;
      } else {
        attributeSums[attribute] = object[attribute];
        // attributeCounts[attribute] = 1;
      }
    }
  }
  let attributeAverages = {};
  for (let attribute in attributeSums) {
    // attributeAverages[attribute] = attributeSums[attribute] / attributeCounts[attribute];
    attributeAverages[attribute] = attributeSums[attribute] / Object.keys(data).length;
  }
  return attributeAverages;
}

export function standardDeviationAttributes(data) {
  let attributeSums = {};
  // let attributeCounts = {};
  let attributeAverages = {};
  let squaredDiffs = {};

  for(let object of data) {
    for(let attribute in object) {
      if (attributeSums[attribute]) {
        attributeSums[attribute] += object[attribute];
        // attributeCounts[attribute]++;
      } else {
        attributeSums[attribute] = object[attribute];
        // attributeCounts[attribute] = 1;
      }
    }
  }

  for(let attribute in attributeSums) {
    // attributeAverages[attribute] = attributeSums[attribute] / attributeCounts[attribute];
    attributeAverages[attribute] = attributeSums[attribute] / Object.keys(data).length;
  }

  for(let object of data) {
    for(let attribute in object) {
      let diff = object[attribute] - attributeAverages[attribute];
      if(squaredDiffs[attribute]) {
        squaredDiffs[attribute] += diff * diff;
      } else {
        squaredDiffs[attribute] = diff * diff;
      }
    }
  }

  let attributeStdDevs = {};
  for(let attribute in squaredDiffs) {
    // attributeStdDevs[attribute] = Math.sqrt(squaredDiffs[attribute] / attributeCounts[attribute]);
    attributeStdDevs[attribute] = Math.sqrt(squaredDiffs[attribute] / Object.keys(data).length);
  }

  return attributeStdDevs;
}