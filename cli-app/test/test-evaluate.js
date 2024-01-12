import WebSocket from "ws";

const evaluationServerHost = 'ws://localhost:8081';

const webSocket = new WebSocket(evaluationServerHost);
webSocket.binaryType = "arraybuffer"; // Set binary type for receiving array buffers

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

// send websocket message to server, with audio buffer
export async function getAudioClassPredictionsFromWebsocket(
  featureMap,
  audioBufferChannelData,
  geneEvaluationWebsocketServerHost
) {
  return new Promise((resolve, reject) => {
    webSocket.on("open", () => {
      webSocket.send(JSON.stringify(featureMap));
      webSocket.send(audioBufferChannelData);
    });
    webSocket.on("message", (message) => {
      const predictions = JSON.parse(message);
      resolve(predictions);
    });
    webSocket.on("error", (error) => {
      delete clients[geneEvaluationWebsocketServerHost];
      reject(error);
    });
  });

}

// generate feature map (mock data)
function generateFeatureMap() {
  return {
    "class1": [0.1, 0.2, 0.3],
    "class2": [0.4, 0.5, 0.6],
    "class3": [0.7, 0.8, 0.9],
  };
}

export async function callEvaluationServiceWithARandomSoundBuffer() {
  const featureMap = generateFeatureMap();
  const audioBuffer = generateRandomSoundBuffer();
  const predictions = await getAudioClassPredictionsFromWebsocket(
    featureMap,
    audioBuffer,
    evaluationServerHost
  );
  console.log('predictions:', predictions);
  return predictions;
}

callEvaluationServiceWithARandomSoundBuffer();
