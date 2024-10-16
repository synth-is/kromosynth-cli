import { 
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet 
} from '../service/websocket/ws-gene-evaluation.js';
import { readGenomeAndMetaFromDisk } from '../util/qd-common-elite-map-persistence.js';

const genomeString = await readGenomeAndMetaFromDisk(
  "01JA6KRYPX52QN3WD3RQ6PGFFQ_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09",
  "01JA6KSNH6PAQFA8J7NEG6MB60",
  "/fp/projects01/ec29/bthj/evoruns/singleMapBDs/01JA6KRYPX52QN3WD3RQ6PGFFQ_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09/"
);

const duration = 4;
const noteDelta = 0;
const velocity = 1
const antiAliasing = true;
const frequencyUpdatesApplyToAllPathcNetworkOutputs = true; 
const renderSampleRateForClassifier = 16000;
const useGPU = false;

const geneRenderingWebsocketServerHost = "ws://c1-28.fox:31520";

let audioBuffer;
for( let i=0; i < 100000; i++ ) {
  console.log("genome rendering attempt:", i);
  audioBuffer = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
    genomeString,
    duration,
    noteDelta,
    velocity,
    useGPU,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
    geneRenderingWebsocketServerHost, renderSampleRateForClassifier
  );
}

console.log("audioBuffer", audioBuffer);


// server:
// cd /fp/projects01/ec29/bthj/kromosynth-render/render-socket/
// apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --max-old-space-size=8192 --processTitle kromosynth-render-socket-server --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-test-host-1