import WebSocket from "ws";

const featureExtractionServerHost = 'ws://localhost:8081';
const qualityEvaluationServerHost = 'ws://localhost:8082';
const diversityEvaluationServerHost = 'ws://localhost:8083';

const SAMPLE_RATE = 16000;

// Function to generate a random audio buffer (mock data)
function generateRandomSoundBuffer(length) {
  const buffer = new ArrayBuffer(length);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with random values between -1.0 and 1.0
    view[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// send websocket message to server, with audio buffer and receive features
function getFeaturesFromWebsocket(
  audioBufferChannelData,
) {
  const webSocket = new WebSocket(featureExtractionServerHost);
  webSocket.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      webSocket.send(audioBufferChannelData);
    });
    webSocket.on("message", (message) => {
      const features = JSON.parse(message);
      resolve(features);
    });
    webSocket.on("error", (error) => {
      reject(error);
    });
  });
}

// send websocket message to server, with audio buffer and receive quality
function getQualityFromWebsocket(
  audioBufferChannelData,
) {
  const webSocket = new WebSocket(qualityEvaluationServerHost);
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

// send websocket message to server, with feature vectors and fitness values and receive diversity
function getDiversityFromWebsocket(
  featureVectors,
  fitnessValues,
) {
  const webSocket = new WebSocket(diversityEvaluationServerHost);
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      const diversityMessage = {
        "feature_vectors": featureVectors,
        "fitness_values": fitnessValues,
      };
      webSocket.send(JSON.stringify(diversityMessage));
    });
    webSocket.on("message", (message) => {
      const diversity = JSON.parse(message);
      resolve(diversity);
    });
    webSocket.on("error", (error) => {
      reject(error);
    });
  });
}

async function callFeatureExtractionService( audioBuffer ) {
  const _audioBuffer = audioBuffer || generateRandomSoundBuffer(SAMPLE_RATE);
  // console.log('audio buffer:',_audioBuffer);
  const features = await getFeaturesFromWebsocket(_audioBuffer);
  // console.log('audio features:', features);
  return features.features;
}

async function callQualityEvaluationService( audioBuffer ) {
  const _audioBuffer = audioBuffer || generateRandomSoundBuffer(SAMPLE_RATE);
  // console.log('audio buffer:', _audioBuffer);
  const quality = await getQualityFromWebsocket(_audioBuffer);
  // console.log('audio quality:', quality);
  return quality.fitness;
}

async function callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues( numberOfEvaluationCandidates = 1 ) {
  // get numberOfEvaluationCandidates feature vectors and fitness values by calling callFeatureExtractionServiceWithARandomSoundBuffer and callQualityEvaluationServiceWithARandomSoundBuffer
  const featureVectors = [];
  const fitnessValues = [];
  for (let i = 0; i < numberOfEvaluationCandidates; i++) {
    const audioBuffer = generateRandomSoundBuffer(SAMPLE_RATE);
    const featureVector = await callFeatureExtractionService( audioBuffer );
    const fitnessValue = await callQualityEvaluationService( audioBuffer );
    featureVectors.push(featureVector);
    fitnessValues.push(fitnessValue);
  }
  // console.log('feature vectors:', featureVectors);
  // console.log('fitness values:', fitnessValues);
  const diversity = await getDiversityFromWebsocket(
    featureVectors,
    fitnessValues,
    diversityEvaluationServerHost
  );
  console.log('audio diversity:', diversity);
  return diversity;
}

// callFeatureExtractionService();
// callQualityEvaluationService();

callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues(30);
