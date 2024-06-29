import WebSocket from "ws";

///// waveform generation

// Function to generate a random audio buffer (mock data)
export function generateRandomSoundBuffer(length) {
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

export function generateSoundBufferWithSineWave(length) {
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

export function generateSoundBufferWithSquareWave(length) {
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

export function generateSoundBufferWithTriangleWave(length) {
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

export function generateSoundBufferWithSawtoothWave(length) {
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

export function generateSoundBufferWithSilence(length) {
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

export function generateSoundBufferWithSpikesAndGaps(length) {
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


///// feature extraction
const featureExtractionServerHost = 'ws://localhost:31051';

export async function callFeatureExtractionService( audioBuffer ) {
  const _audioBuffer = audioBuffer || generateRandomSoundBuffer(SAMPLE_RATE);
  // console.log('audio buffer:',_audioBuffer);
  const features = await getFeaturesFromWebsocket(_audioBuffer);
  console.log('audio features:', features);
  return features;
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
  // const webSocket = new WebSocket(featureExtractionServerHost + "/encodec?ckpt_dir=/Users/bjornpjo/.cache/torch/hub/checkpoints&sample_rate=24000");
  
  // const webSocket = new WebSocket(featureExtractionServerHost + "/manual?features=spectral_centroid,spectral_rolloff,zero_crossing_rate,chroma_stft,mel_spectrogram,rms,spectral_bandwidth,spectral_contrast,spectral_flatness,spectral_flux");
  const webSocket = new WebSocket(featureExtractionServerHost + "/manual?features=spectral_centroid,spectral_flatness");
  
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


///// projection

const diversityEvaluationServerHost = 'ws://localhost:33051';


// send websocket message to server, with feature vectors and fitness values and receive diversity
export function getDiversityFromWebsocket(
  featureVectors,
  projectionMethod,
  // fitnessValues,
) {
  const diversityEvaluationURL = diversityEvaluationServerHost + "/" + projectionMethod;
  const webSocket = new WebSocket(diversityEvaluationURL);
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      const diversityMessage = {
        "feature_vectors": featureVectors,
        // "fitness_values": fitnessValues,
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
