import { execSync, spawn } from 'child_process';

export function getEvoRunDirPath( evoRunConfig, evoRunId ) {
  const { evoRunsDirPath } = evoRunConfig;
  const evoRunDirPath = `${evoRunsDirPath}${evoRunId}/`;
  return evoRunDirPath;
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