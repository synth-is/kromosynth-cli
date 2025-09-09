import { 
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet 
} from '../service/websocket/ws-gene-evaluation.js';
import { readGenomeAndMetaFromDisk } from '../util/qd-common-elite-map-persistence.js';
// import toWav from 'audiobuffer-to-wav';
// import fs from 'fs';

const genomeString = await readGenomeAndMetaFromDisk(
  "01JEFBE7HR76299N81G5CZF1J1_evoConf_singleMap_refSingleEmbeddings_x100_mfcc-statistics_pca_retrainIncr50_classDims",
  "01JEFC6Y3V6HFZNPSMNVWQ8PHW",
  "/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns/01JEFBE7HR76299N81G5CZF1J1_evoConf_singleMap_refSingleEmbeddings_x100_mfcc-statistics_pca_retrainIncr50_classDims/"
);

const duration = 2;
const noteDelta = 0;
const velocity = 1
const antiAliasing = true;
const frequencyUpdatesApplyToAllPathcNetworkOutputs = true; 
const sampleRate = 16000;
const useGPU = false;
const sampleCountToActivate = sampleRate * (duration/4);
const sampleOffset = 0;

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Please provide the ws://websocket host as a command line argument.");
  process.exit(1);
}
const geneRenderingWebsocketServerHost = args[0];

let audioFloat32Array = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
  genomeString,
  duration,
  noteDelta,
  velocity,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingWebsocketServerHost, sampleRate,
  // sampleCountToActivate,
  // sampleOffset,
);

console.log("audioBuffer", audioFloat32Array);

// const audioBuffer = new AudioBuffer({
//   length: audioFloat32Array.length,
//   numberOfChannels: 1,
//   sampleRate: 16000
// });

// let wav = toWav(audioBuffer);
// let wavBuffer = Buffer.from(new Uint8Array(wav));
// fs.writeFileSync("genome-rendering.wav", wavBuffer);

// server:
// cd /fp/projects01/ec29/bthj/kromosynth-render/render-socket/
// apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --max-old-space-size=8192 --processTitle kromosynth-render-socket-server --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-test-host-1