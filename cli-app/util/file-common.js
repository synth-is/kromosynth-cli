import fs from 'fs';
import waveFileModule from 'wavefile';
const { WaveFile } = waveFileModule;

export function readWavFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const wav = new WaveFile();
        wav.fromBuffer(data);
        let audioData = wav.getSamples(false, Float32Array, 0);
        // check if the audio is stereo and mix it down to mono, by checking if there is an array of two Float32Arrays
        if (audioData.length === 2 && audioData[0] instanceof Float32Array && audioData[1] instanceof Float32Array) {
          audioData = mixDownToMono(audioData[0], audioData[1]);
        }
        resolve(audioData);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function mixDownToMono(leftChannel, rightChannel) {
  if (leftChannel.length !== rightChannel.length) {
      throw new Error('Left and right channels must have the same length');
  }
  
  const mono = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i++) {
      mono[i] = (leftChannel[i] + rightChannel[i]) / 2;
  }
  return mono;
}
