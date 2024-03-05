import WebSocket from "ws";

const featureExtractionServerHost = 'ws://localhost:31051';
const qualityEvaluationServerHost = 'ws://localhost:32051';
const diversityEvaluationServerHost = 'ws://localhost:33051';

// const SAMPLE_RATE = 16000;
const SAMPLE_RATE = 48000;

// Function to generate a random audio buffer (mock data)
function generateRandomSoundBuffer(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with random values between -1.0 and 1.0
    view[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function generateSoundBufferWithSineWave(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with a sine wave
    view[i] = Math.sin(i / 1000);
  }
  return buffer;
}

function generateSoundBufferWithSquareWave(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with a square wave
    view[i] = Math.sin(i / 1000) > 0 ? 1 : -1;
  }
  return buffer;
}

function generateSoundBufferWithTriangleWave(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with a triangle wave
    view[i] = Math.asin(Math.sin(i / 1000));
  }
  return buffer;
}

function generateSoundBufferWithSawtoothWave(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with a sawtooth wave
    view[i] = Math.atan(Math.tan(i / 1000));
  }
  return buffer;
}

function generateSoundBufferWithSilence(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with silence
    view[i] = 0;
  }
  return buffer;
}

function generateSoundBufferWithSpikesAndGaps(length) {
  // each Float32Array element is 4 bytes
  const arrayBufferLength = length * 4;
  const buffer = new ArrayBuffer(arrayBufferLength);
  const view = new Float32Array(buffer);
  console.log('audio buffer length:', view.length);
  for (let i = 0; i < view.length; i++) {
    // Fill the buffer with a sine wave
    // - introduce spikes to test the robustness of the feature extraction service
    view[i] = Math.sin(i / 1000);
    if (i % 1000 === 0) {
      view[i] += .5;
    }
    // add a spike to the sound at random intervals, adding a value between .05 and .5
    if (Math.random() > 0.99) {
      view[i] += Math.random() * .5;
    }
    // introduce random gaps in the sound, over random lengths of time
    if (Math.random() > 0.99) {
      const gapLength = Math.floor(Math.random() * 1000);
      for (let j = 0; j < gapLength; j++) {
        view[i + j] = 0;
      }
      i += gapLength;
    }
    // introduce hum in the sound, over random lengths of time
    // if (Math.random() > 0.99) {
    //   const humLength = Math.floor(Math.random() * 1000);
    //   for (let j = 0; j < humLength; j++) {
    //     view[i + j] += Math.sin(j / 100);
    //   }
    //   i += humLength;
    // }

    // introduce clipping in the sound, over random lengths of time
    // if (Math.random() > 0.99) {
    //   const clippingLength = Math.floor(Math.random() * 1000);
    //   for (let j = 0; j < clippingLength; j++) {
    //     view[i + j] = 1;
    //   }
    //   i += clippingLength;
    // }

    // introduce noise in the sound, over random lengths of time
    if (Math.random() > 0.59) {
      const noiseLength = Math.floor(Math.random() * 100);
      for (let j = 0; j < noiseLength; j++) {
        // view[i + j] += Math.random() * .5;
        view[i + j] += Math.random() * 2 - 1;
      }
      i += noiseLength;
    }

  }
  return buffer;
}

// send websocket message to server, with audio buffer and receive features
function getFeaturesFromWebsocket(
  audioBufferChannelData,
) {
  // const webSocket = new WebSocket(featureExtractionServerHost);
  // const webSocket = new WebSocket(featureExtractionServerHost + "/mfcc");
  // const webSocket = new WebSocket(featureExtractionServerHost + "/vggish?ckpt_dir=/Users/bjornpjo/.cache/torch/hub/checkpoints&sample_rate=16000");
  // const webSocket = new WebSocket(featureExtractionServerHost + "/pann?ckpt_dir=/Users/bjornpjo/.cache/torch/hub/checkpoints&sample_rate=16000");
  // const webSocket = new WebSocket(featureExtractionServerHost + "/clap?ckpt_dir=/Users/bjornpjo/.cache/torch/hub/checkpoints&sample_rate=48000");
  const webSocket = new WebSocket(featureExtractionServerHost + "/encodec?ckpt_dir=/Users/bjornpjo/.cache/torch/hub/checkpoints&sample_rate=24000");
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
        "should_fit": true,
        "evorun_dir": "/tmp/"
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
    const audioBuffer = generateRandomSoundBuffer(SAMPLE_RATE*10);
    // const audioBuffer = generateSoundBufferWithSpikesAndGaps(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSineWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSquareWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithTriangleWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSawtoothWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSilence(SAMPLE_RATE*5.0);
    
    const featureVector = await callFeatureExtractionService( audioBuffer );
    const fitnessValue = await callQualityEvaluationService( audioBuffer );
    featureVectors.push(featureVector);
    fitnessValues.push(fitnessValue);
  }
  console.log('feature vectors:', featureVectors);
  console.log('fitness values:', fitnessValues);
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

callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues(2);
