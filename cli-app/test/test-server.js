// import { server as WebSocket } from 'websocket';
// import { createServer } from 'http';
import { getAudioContext, getNewOfflineAudioContext } from '../util/rendering-common.js';
// import fetch from 'node-fetch';
import { getAudioBufferFromGenomeAndMeta } from 'kromosynth';
// import { log } from 'console';
import fs from 'fs';

// // Create a plain HTTP server (not serving any additional files)
// const server = createServer();

// const wsServer = new WebSocket({ httpServer: server });

// wsServer.on('request', (request) => {
//   const connection = request.accept(null, request.origin);

//   connection.on('message', async (message) => {
//     if (message.type === 'utf8') {
//       const data = JSON.parse(message.utf8Data);

//       if (data.type === 'get_audio_data') {
//         // Process the request for audio data here
//         let audioData;
//         try {
//           audioData = await generateAudioData(data);
//         } catch( error ) {
//           console.error(error);
//         }
//         if( audioData ) {
//           // Convert the audio data to PCM (assuming audioData is already in the proper format)
//           const pcmData = convertToPCM(audioData);
//           console.log('pcmData:', pcmData);
//           // Send the audio data back to the client
//           const buffer = Buffer.from(pcmData);
//           connection.sendBytes(buffer);
//         } else {
//           connection.sendBytes(Buffer.from([]));
//         }
//       } else {
//         console.log('Unknown message type:', data.type);
//       }
//     }
//   });

//   connection.on('close', () => {
//     console.log('Connection closed');
//   });
// });

// // const PORT = 3000;
// // server.listen(PORT, () => {
// //   console.log(`WebSocket server listening on port ${PORT}`);
// // });

async function testRenderGenome() {
  // read genome from JSON file on disk
  const genomeString = fs.readFileSync('/Users/bjornpjo/Downloads/testGenome1.json', 'utf8');
  const genome = JSON.parse(genomeString);
  const duration = 1;
  const noteDelta = 0;
  const velocity = 1;
  const reverse = false;
  const useOvertoneInharmonicityFactors = false;
  const audioBuffer = await getAudioBufferFromGenomeAndMeta(
    genome,
    duration, noteDelta, velocity, reverse,
    false, // asDataArray
    getNewOfflineAudioContext( duration ),
    getAudioContext(),
    useOvertoneInharmonicityFactors
  );
  console.log('audio buffer:', audioBuffer);
  return audioBuffer;
}
testRenderGenome();

// // Function to generate or fetch audio data
// async function generateAudioData( audioRenderRequest ) {
//   const {
//     genomeStringUrl,
//     duration,
//     noteDelta,
//     velocity,
//     reverse,
//     useOvertoneInharmonicityFactors,
//     overrideGenomeDurationNoteDeltaAndVelocity
//   } = audioRenderRequest;
//   // ... Generate or fetch the audio data ...
//   const genomeString = await downloadString(genomeStringUrl);
//   console.log('genomeStringUrl:', genomeStringUrl);
//   // console.log('genome string:', genomeString);
//   const genome = JSON.parse(genomeString);

//   let _duration, _noteDelta, _velocity;
//   if( overrideGenomeDurationNoteDeltaAndVelocity) {

//   } else {
//     _duration = duration;
//     _noteDelta = noteDelta;
//     _velocity = velocity;
//   }

//   // const audioContext = await getAudioContext();
//   const audioBuffer = await getAudioBufferFromGenomeAndMeta(
//     genome,
//     duration, noteDelta, velocity, reverse,
//     false, // asDataArray
//     getNewOfflineAudioContext( duration ),
//     getAudioContext(),
//     useOvertoneInharmonicityFactors
//   );
//   console.log('audio buffer:', audioBuffer);
//   return audioBuffer;
// }

// function convertToPCM(audioBuffer) {
//   const numChannels = audioBuffer.numberOfChannels;
//   console.log('numChannels:', numChannels);
//   const numSamples = audioBuffer.length;
//   console.log('numSamples:', numSamples);
//   const pcmData = new Int16Array(numChannels * numSamples * 2);
//   console.log('pcmData.length:', pcmData.length);

//   for (let channel = 0; channel < numChannels; channel++) {
//     const channelData = audioBuffer.getChannelData(channel);

//     log('channelData:', channelData);

//     for (let sample = 0; sample < numSamples; sample++) {
//       const pcmSample = Math.max(-1, Math.min(1, channelData[sample])) * 0x7FFF; // Convert to 16-bit PCM

//       const index = (sample * numChannels + channel) * 2; // Multiply by 2 for 16-bit PCM
//       pcmData[index] = pcmSample;
//       pcmData[index + 1] = pcmSample >> 8; // Shift the high byte to the second position
//     }
//   }

//   return pcmData;
// }

// async function downloadString(url) {
//   try {
//     const response = await fetch(url);
//     if (!response.ok) {
//       throw new Error(`Request failed with status code ${response.status}`);
//     }
//     return await response.text();
//   } catch (error) {
//     throw new Error(`Error downloading string: ${error.message}`);
//   }
// }