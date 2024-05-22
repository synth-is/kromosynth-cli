
import { getAudioContext } from '../util/rendering-common.js';
import { readWavFile } from "../util/file-common.js";
import { 
  generateRandomSoundBuffer, generateSoundBufferWithSpikesAndGaps, generateSoundBufferWithSineWave, generateSoundBufferWithSquareWave, generateSoundBufferWithTriangleWave, generateSoundBufferWithSawtoothWave, generateSoundBufferWithSilence,
  callFeatureExtractionService,
   getDiversityFromWebsocket
} from "./test-common.js";

const qualityEvaluationServerHost = 'ws://localhost:32051';


const SAMPLE_RATE = 16000;
// const SAMPLE_RATE = 48000;





// send websocket message to server, with audio buffer and receive quality
function getQualityFromWebsocket(
  audioBufferChannelData,
) {
  // const webSocket = new WebSocket(qualityEvaluationServerHost);
  const webSocket = new WebSocket(qualityEvaluationServerHost + "/score?background_embds_path=");
  webSocket.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      webSocket.send(audioBufferChannelData);
    });
    webSocket.on("message", (message) => {
      const quality = JSON.parse(message);
      resolve(quality);
    });
    webSocket.on("error", (error) => {
      reject(error);
    });
  });
}

// send websocket message to server, with embedding as the message and reference set and query set embeddings paths and receive quality
function getQualityFromWebsocketForEmbedding(
  embedding,
  refSetEmbedsPath,
  querySetEmbedsPath,
  measureCollectivePerformance,
  ckptDir,
) {
  console.log('measureCollectivePerformance:', measureCollectivePerformance);
  const webSocket = new WebSocket(qualityEvaluationServerHost + "/score?background_embds_path=" + refSetEmbedsPath + "&eval_embds_path=" + querySetEmbedsPath + "&measure_collective_performance=" + measureCollectivePerformance + "&ckpt_dir=" + ckptDir);
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      webSocket.send(JSON.stringify(embedding));
    });
    webSocket.on("message", (message) => {
      const quality = JSON.parse(message);
      resolve(quality);
    });
    webSocket.on("error", (error) => {
      reject(error);
    });
  });
}

function addEmbeddingToEmbedsFile(
  embedding,
  embedsPath,
) {
  const randomeGenomeId = Math.random().toString(36).substring(7);
  const webSocket = new WebSocket(qualityEvaluationServerHost + "/add-to-query-embeddings?eval_embds_path=" + embedsPath + "&candidate_id=" + randomeGenomeId + "&replacement_id=" + randomeGenomeId);
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      webSocket.send(JSON.stringify(embedding));
    });
    webSocket.on("message", (message) => {
      const quality = JSON.parse(message);
      resolve(quality);
    });
    webSocket.on("error", (error) => {
      reject(error);
    });
  });
}





async function callQualityEvaluationService( audioBuffer ) {
  const _audioBuffer = audioBuffer || generateRandomSoundBuffer(SAMPLE_RATE);
  // console.log('audio buffer:', _audioBuffer);
  const quality = await getQualityFromWebsocket(_audioBuffer);
  // console.log('audio quality:', quality);
  return quality.fitness;
}

async function callQualityEvaluationServiceForEmbedding( embedding, refSetEmbedsPath, querySetEmbedsPath, measureCollectivePerformance, ckptDir ) {
  const quality = await getQualityFromWebsocketForEmbedding( embedding, refSetEmbedsPath, querySetEmbedsPath, measureCollectivePerformance, ckptDir );
  console.log('audio quality:', quality);
  return quality;
}

async function callQualityEvaluationServiceForAddingEmbedding( embedding, embedsPath ) {
  const quality = await addEmbeddingToEmbedsFile( embedding, embedsPath );
  console.log('audio quality:', quality);
  return quality;
}

async function callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues( numberOfEvaluationCandidates = 1 ) {
  // get numberOfEvaluationCandidates feature vectors and fitness values by calling callFeatureExtractionServiceWithARandomSoundBuffer and callQualityEvaluationServiceWithARandomSoundBuffer
  const featureVectors = [];
  const fitnessValues = [];
  for (let i = 0; i < numberOfEvaluationCandidates; i++) {
    const audioBuffer = generateRandomSoundBuffer(SAMPLE_RATE*10);
    // const audioBuffer = generateSoundBufferWithSpikesAndGaps(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSineWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSquareWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithTriangleWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSawtoothWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSilence(SAMPLE_RATE*5.0);

    // const audioBuffer = await readWavFile('/Users/bjornpjo/Downloads/nsynth-valid/customRef/samples/customRef1/vocal_synthetic_003-038-100.wav');
    
    const featureResponse = await callFeatureExtractionService( audioBuffer );
    const { features, embedding } = featureResponse;
    
    // const fitnessValue = await callQualityEvaluationService( audioBuffer );
    
    // const fitnessValue = await callQualityEvaluationServiceForEmbedding(
    //   embedding,
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/bass/embeds.npy',
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/brass/embeds.npy', //'/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/brass/embeds.npy',
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/source-split/acoustic/embeds.npy',
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/source-split/acoustic/embeds.npy',
    //   '/Users/bjornpjo/Downloads/nsynth-valid/customRef/embeddings/customRef1/embeds.npy',
    //   '/Users/bjornpjo/Downloads/nsynth-valid/customRef/embeddings/customEvalDump/embeds.npy',
    //   false, // measureCollectivePerformance
    //   '/Users/bjornpjo/.cache/torch/hub/checkpoints'
    // );

    // const addEmbeddingToFileResult = await callQualityEvaluationServiceForAddingEmbedding(
    //   embedding,
    //   '/Users/bjornpjo/Downloads/randomembeds.npy'
    // );
    // console.log('addEmbeddingToFileResult:', addEmbeddingToFileResult);


    featureVectors.push(features);
    // fitnessValues.push(fitnessValue);
  }
  console.log('feature vectors:', featureVectors, "shape:", featureVectors.length, featureVectors[0].length);
  console.log('fitness values:', fitnessValues);
  const diversity = await getDiversityFromWebsocket(
    featureVectors,
    fitnessValues
  );
  console.log('audio diversity:', diversity);
  return diversity;
}

// callFeatureExtractionService();
// callQualityEvaluationService();

callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues(20);
// callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues();
