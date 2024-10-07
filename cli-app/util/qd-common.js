import { execSync, exec, spawn } from 'child_process';
// import fs from 'fs';
import fs from 'fs-extra';
import nthline from 'nthline';
import { renderAudio } from 'kromosynth';
import { 
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet,
  getFeaturesFromWebsocket,
} from '../service/websocket/ws-gene-evaluation.js';

export function getEvoRunDirPath( evoRunConfig, evoRunId ) {
  const { evoRunsDirPath } = evoRunConfig;
  const evoRunDirPath = `${evoRunsDirPath}${evoRunId}/`;
  return evoRunDirPath;
}

export function deleteAllGenomesNotInEliteMap( eliteMap, evoRunDirPath ) {
  const eliteGenomeIds = Object.fromEntries( 
    Object.values(eliteMap.cells).filter( oneCell => oneCell.elts.length > 0).map( oneCell => [oneCell.elts[0].g, true] )
  );
  const genomeFiles = fs.readdirSync(evoRunDirPath).filter( file => file.startsWith('genome_') );
  for( let genomeFile of genomeFiles ) {
    // genome ID from genomeFile name like "genome_1_2.json" -> "2"
    const genomeId = genomeFile.substring(genomeFile.lastIndexOf("_")+1, genomeFile.length - 5);
    if( !eliteGenomeIds[genomeId] ) {
      fs.unlinkSync(`${evoRunDirPath}${genomeFile}`);
    }
  }
}

export function deleteAllGenomeRendersNotInEliteMap( eliteMap, evoRenderDirPath ) {
  if( fs.existsSync(evoRenderDirPath) ) {
    const eliteGenomeIds = Object.fromEntries(
      Object.values(eliteMap.cells).filter( oneCell => oneCell.elts.length > 0).map( oneCell => [oneCell.elts[0].g, true] )
    );
    const wavFiles = fs.readdirSync(evoRenderDirPath).filter( file => file.endsWith('.wav') );
    for( let wavFile of wavFiles ) {
      // genome ID from wavFile name like "56_28_<ID>.wav" -> "<ID>"
      const genomeId = wavFile.substring(wavFile.lastIndexOf("_")+1, wavFile.length - 4);
      if( !eliteGenomeIds[genomeId] ) {
        const wavFilePath = `${evoRenderDirPath}${wavFile}`;
        console.log(`deleting genome render: ${wavFilePath}`);
        fs.unlinkSync(wavFilePath);
      }
    }
  }
}

export function getDurationNoteDeltaVelocityFromGenomeString( genomeString, cellKey ) {
  const genomeAndMeta = JSON.parse( genomeString );
  let tagForCell;
  if( cellKey ) {
    if( genomeAndMeta.genome.tags !== undefined ) {
      tagForCell = genomeAndMeta.genome.tags.find(t => t.tag === cellKey );
    }      
    if( undefined === tagForCell && genomeAndMeta.genome.tags !== undefined ) {
      // this genome has not been an elite in the current map, so let's use the last tag
      tagForCell = genomeAndMeta.genome.tags[genomeAndMeta.genome.tags.length - 1];
    }
  } else {
    // let's use the last tag
    tagForCell = genomeAndMeta.genome.tags[genomeAndMeta.genome.tags.length - 1];
  }
  // const { duration, noteDelta, velocity } = tagForCell;
  let duration, noteDelta, velocity;
  if( tagForCell !== undefined ) { // handling temporary condition during development, otherwise we should be able to destructure directly from tagForCell
    duration = tagForCell.duration;
    noteDelta = tagForCell.noteDelta;
    velocity = tagForCell.velocity;
  }
  return { duration, noteDelta, velocity };
}


///// features

export function getFeaturesForGenomeString( 
  genomeString, 
  duration, noteDelta, velocity, 
  useGPU, 
  antiAliasing, frequencyUpdatesApplyToAllPathcNetworkOutputs, 
  geneRenderingServerHost, 
  evaluationFeatureExtractionHost, featureExtractionEndpoint,
  sampleRate,
  ckptDir
) {
return new Promise( async (resolve, reject) => {
  const audioBuffer = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
    genomeString,
    duration,
    noteDelta,
    velocity,
    useGPU,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    geneRenderingServerHost, sampleRate
  ).catch(e => {
    console.error(`Error rendering geneome ${genomeString.substring(0, 10)}`, e);
    reject(e);
  });
  const featuresResponse = await getFeaturesFromWebsocket(
    audioBuffer,
    evaluationFeatureExtractionHost + featureExtractionEndpoint,
    ckptDir, // `${ckptDir}/${evaluationFeatureExtractionHostEncodedBase64}`,
    sampleRate,
  ).catch(e => {
    console.error("Error getting features", e);
    reject(e);
  });
  resolve( { features: featuresResponse.features, embedding: featuresResponse.embedding } );
});
}


///// functions corresponding to logic in endpoints in the kromosynth-evoruns project

export async function getEliteMap( evoRunDirPath, iterationIndex, forceCreateCommitIdsList ) {
  const commitId = await getCommitID( evoRunDirPath, iterationIndex, forceCreateCommitIdsList );
  const evoRunId = evoRunDirPath.split('/').pop();
  const eliteMapFilePath = `${evoRunDirPath}/elites_${evoRunId}.json`;
  if( fs.existsSync(eliteMapFilePath) ) {
    const eliteMapString = await spawnCmd(`git -C ${evoRunDirPath} show ${commitId}:elites_${evoRunId}.json`, {}, true);
    const eliteMap = JSON.parse(eliteMapString);
    return eliteMap;
  } else {
    return undefined;
  }
}

export async function getEliteMaps( evoRunDirPath, iterationIndex, forceCreateCommitIdsList ) {
  const commitId = await getCommitID( evoRunDirPath, iterationIndex, forceCreateCommitIdsList );
  const eliteMapFilePaths = fs.readdirSync(evoRunDirPath).filter( file => file.startsWith('elites_') );
  const eliteMaps = [];
  for( let eliteMapFilePath of eliteMapFilePaths ) {
    const eliteMapString = await spawnCmd(`git -C ${evoRunDirPath} show ${commitId}:${eliteMapFilePath}`, {}, true);
    const eliteMap = JSON.parse(eliteMapString);
    eliteMaps.push(eliteMap);
  }
  return eliteMaps;
}

export function getCommitCount( evoRunDirPath, forceCreateCommitIdsList ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunDirPath, forceCreateCommitIdsList );
  const commitCount = parseInt(runCmd(`wc -l < ${commitIdsFilePath}`));
  return commitCount;
}

export async function getClassLabelsWithElites( evoRunDirPath ) {
  const lastCommitIndex = getCommitCount( evoRunDirPath ) - 1;
  console.log('lastCommitIndex:', lastCommitIndex);
  const eliteMap = await getEliteMap( evoRunDirPath, lastCommitIndex );
  const classes = Object.keys(eliteMap.cells).filter( (className) => eliteMap.cells[className].elts.length > 0 ).sort();
  return classes;
}
export async function getClassLabelsWithElitesFromEliteMap( eliteMap ) {
  const classes = Object.keys(eliteMap.cells).filter( (className) => eliteMap.cells[className].elts.length > 0 ).sort();
  return classes;
}

function getCommitIdsFilePath( evoRunDirPath, forceCreateCommitIdsList ) {
  const commitIdsFileName = "commit-ids.txt";
  const evoRunDirPathSeparator = evoRunDirPath.endsWith('/') ? '' : '/';
  const commitIdsFilePath = `${evoRunDirPath}${evoRunDirPathSeparator}${commitIdsFileName}`;
  if( forceCreateCommitIdsList || ! fs.existsSync(`${evoRunDirPath}/commit-ids.txt`) ) {
    runCmd(`git -C ${evoRunDirPath} rev-list HEAD --first-parent --reverse > ${commitIdsFilePath}`);
  }
  return commitIdsFilePath;
}

async function getCommitID( evoRunDirPath, iterationIndex, forceCreateCommitIdsList ) {
  const commitIdsFilePath = getCommitIdsFilePath( evoRunDirPath, forceCreateCommitIdsList );
  let commitId;
  if( iterationIndex === undefined ) {
    // get last index
    const commitCount = getCommitCount( evoRunDirPath, forceCreateCommitIdsList );
    console.log('commitCount:', commitCount);
    const lastCommitIndex = commitCount - 1;
    commitId = await nthline(lastCommitIndex, commitIdsFilePath);
  } else {
    console.log("iterationIndex",iterationIndex)
    console.log("commitIdsFilePath",commitIdsFilePath)
    commitId = await nthline(iterationIndex, commitIdsFilePath);
  }
  return commitId;
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

export function invertedLogarithmicRamp(i, n) {
  // We add 1 to i as the index is 0-based and log(1) is 0
  // This ensures the first proportion (when i = 0) isn't 0 and last reaches to 1 (or very near).
  const adjustedI = i + 1;
  const adjustedN = n;

  // Using the natural logarithm for scaling
  const logMax = Math.log(adjustedN);
  const logCurrent = Math.log(adjustedI);

  // The proportion of the way through the total iterations (scaled logarithmically)
  const proportion = logCurrent / logMax;

  return proportion;
}

// the linear regression slope calculation:
// - operates on an array of numeric values and calculates the slope of the linear trend in the last windowSize values.
// - based on the least squares method to fit a line to the points inside the window.
export function getGradient(values, windowSize = 5, measurementType) {
  if (values.length < windowSize) {
      throw new Error("The array is shorter than the specified window size.");
  }

  // Take the last 'windowSize' points for the regression
  const y = values.slice(-windowSize);
  const x = [...Array(windowSize).keys()].map(i => i + values.length - windowSize);

  // Perform the linear regression using the least squares method
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < windowSize; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumXX += x[i] * x[i];
  }

  const slope = (windowSize * sumXY - sumX * sumY) / (windowSize * sumXX - sumX * sumX);
  console.log('slope:', slope, "measurementType:", measurementType);
  return slope;
}