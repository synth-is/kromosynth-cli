import { WebSocketServer } from "ws";
import parseArgs from 'minimist';
import crypto from 'crypto';
import net from 'net';
import os from "os";
import fs from "fs";
import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getGenomeFromGenomeString,
  getClassScoresForGenome
} from 'kromosynth';
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext } = NodeWebAudioAPI;

const SAMPLE_RATE = 16000;
let audioCtx;
let modelUrl;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext({sampleRate: SAMPLE_RATE});
  return audioCtx;
}

async function handleRandomGenome(payload) {
  const {
    evolution_run_id,
    generation_number,
    evolutionary_hyperparameters,
    one_cppn_per_frequency
  } = payload;

  const genome = getNewAudioSynthesisGenome(
    evolution_run_id,
    generation_number,
    undefined,
    evolutionary_hyperparameters,
    one_cppn_per_frequency
  );

  console.log("Created new gene for evolution run", evolution_run_id);
  return { genome_string: JSON.stringify(genome) };
}

async function handleGenomeVariation(payload) {
  const {
    genomeStrings,
    evolutionRunId,
    generationNumber,
    algorithmKey,
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    patchFitnessTestDuration,
    useGPU
  } = payload;

  try {
    const genomes = await Promise.all(genomeStrings.map(async genomeString => 
      await getGenomeFromGenomeString(genomeString, evolutionaryHyperparameters)
    ));

    const newGenome = await getNewAudioSynthesisGenomeByMutation(
      genomes,
      evolutionRunId,
      generationNumber,
      -1,
      algorithmKey,
      getAudioContext(),
      probabilityMutatingWaveNetwork,
      probabilityMutatingPatch,
      audioGraphMutationParams,
      evolutionaryHyperparameters,
      OfflineAudioContext,
      patchFitnessTestDuration,
      useGPU
    );

    console.log("Created new genome by variation for evolution run", evolutionRunId);
    return { genome_string: newGenome ? JSON.stringify(newGenome) : "" };
  } catch (error) {
    console.error("WebSocket -> handleGenomeVariation:", error);
    throw error;
  }
}

async function handleGenomeEvaluation(payload) {
  const {
    genomeString,
    classScoringDurations,
    classScoringNoteDeltas,
    classScoringVelocities,
    classificationGraphModel,
    useGpuForTensorflow,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs
  } = payload;

  try {
    const genome = await getGenomeFromGenomeString(genomeString);
    const genomeClassScores = await getClassScoresForGenome(
      genome,
      classScoringDurations,
      classScoringNoteDeltas,
      classScoringVelocities,
      classificationGraphModel,
      modelUrl,
      useGpuForTensorflow,
      antiAliasing,
      true,
      true,
      frequencyUpdatesApplyToAllPathcNetworkOutputs
    );

    return { genomeClassScores };
  } catch (error) {
    console.error("WebSocket -> handleGenomeEvaluation:", error);
    throw error;
  }
}

async function isPortTaken(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => server.once('close', () => resolve(false)).close())
      .listen(port);
  });
}

async function filepathToPort(filepath, variation = 0) {
  let filepathVariation = filepath + variation.toString();
  let hash = crypto.createHash('md5').update(filepathVariation).digest("hex");
  let shortHash = parseInt(hash.substring(0, 8), 16);
  let port = 1024 + shortHash % (65535 - 1024);
  let isTaken = await isPortTaken(port);

  if(isTaken) {
    console.log(`--- filepathToPort(${filepath}): port ${port} taken`);
    return await filepathToPort(filepath, variation + 1);
  } else {
    console.log(`--- filepathToPort(${filepath}): port ${port} available`);
    return port;
  }
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  let port;
  let hostname;
  
  if (argv.hostInfoFilePath) {
    console.log("--- argv.hostInfoFilePath:", argv.hostInfoFilePath);
    let hostInfoFilePath;
    if (process.env.pm_id) {
      hostInfoFilePath = `${argv.hostInfoFilePath}${parseInt(process.env.pm_id) + 1}`;
    } else {
      hostInfoFilePath = argv.hostInfoFilePath;
    }
    port = await filepathToPort(hostInfoFilePath);
    let host = argv.host || os.hostname();
    hostname = `${host}:${port}`;
    console.log("--- hostname:", hostname);
    fs.writeFile(hostInfoFilePath, hostname, () => console.log(`Wrote hostname to ${hostInfoFilePath}`));
  } else {
    port = argv.port || process.env.PORT || '50051';
  }

  modelUrl = argv.modelUrl;
  if (modelUrl && modelUrl.includes("localscratch")) {
    const jobId = process.env.SLURM_JOB_ID;
    console.log("Replacing localscratch/<job-ID> with localscratch/"+jobId+" in modelUrl");
    modelUrl = modelUrl.replace("localscratch/<job-ID>", `localscratch/${jobId}`);
  }

  const processTitle = argv.processTitle || 'kromosynth-websocket';
  process.title = processTitle;
  process.on('SIGINT', () => process.exit(1));

  const wss = new WebSocketServer({ 
    port,
    host: hostname ? hostname.split(':')[0] : '0.0.0.0',
    maxPayload: 100 * 1024 * 1024 // 100 MB
  });

  wss.on("connection", function connection(ws) {
    ws.on('error', function(err) {
      console.error("WebSocket error:", err);
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    });

    ws.on("message", async function incoming(message) {
      try {
        const payload = JSON.parse(message);
        let response;

        switch (payload.type) {
          case 'RandomGenome':
            response = await handleRandomGenome(payload.data);
            break;
          case 'GenomeVariation':
            response = await handleGenomeVariation(payload.data);
            break;
          case 'GenomeEvaluation':
            response = await handleGenomeEvaluation(payload.data);
            break;
          default:
            throw new Error(`Unknown message type: ${payload.type}`);
        }

        ws.send(JSON.stringify(response));
      } catch (error) {
        console.error("Error processing message:", error);
        ws.send(JSON.stringify({ error: error.message }));
      }
    });
  });

  console.log(`Genome WebSocket server listening on port ${port}`);
}

main();