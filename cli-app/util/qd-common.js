import { execSync, exec, spawn } from 'child_process';
import fs from 'fs';

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

export function calcVariance(numbers) {
  // calculate the mean
  const mean = numbers.reduce((total, num) => total + num) / numbers.length;

  // calculate the sum of squared deviations from the mean
  const deviations = numbers.map(num => (num - mean) ** 2);
  const sumOfDeviations = deviations.reduce((total, deviation) => total + deviation);

  // calculate the variance
  const variance = sumOfDeviations / numbers.length;

  return variance;
}

export function calcStandardDeviation(numbers) { 
  // calculate the standard deviation
  const variance = calcVariance(numbers);
  const standardDeviation = Math.sqrt(variance);

  return standardDeviation;
}

export function calcMeanDeviation(numbers) {
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