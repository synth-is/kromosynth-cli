import { readGenomeAndMetaFromDisk } from '../util/qd-common.js';
import {
	getAudioContext, getNewOfflineAudioContext
} from '../util/rendering-common.js';
import { getAudioBufferFromGenomeAndMeta } from 'kromosynth';
import toWav from 'audiobuffer-to-wav';
import fs from 'fs';

process.on('message', async (message) => {
  try {
    // console.log('Received message:', message);
    const { 
      evoRunId, oneEvorunPath,
      fileName, subFolder, ancestorData,
      overwriteExistingFiles,
      useOvertoneInharmonicityFactors,
      useGpu,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs,
      sampleRate
    } = message;

    const fileNamePath = subFolder + fileName;
    if( !fs.existsSync(fileNamePath) || overwriteExistingFiles ) {
      console.log("Rendering", fileName);
      const { genomeId, duration, noteDelta, velocity } = ancestorData;
      const genomeString = await readGenomeAndMetaFromDisk( evoRunId, genomeId, oneEvorunPath );
      const genomeAndMeta = JSON.parse( genomeString );
      // console.log("Genome and meta:", genomeAndMeta);
      const audioBuffer = await getAudioBufferFromGenomeAndMeta(
        genomeAndMeta,
        duration, noteDelta, velocity, false,
        false, // asDataArray
        getNewOfflineAudioContext( duration, sampleRate ),
        getAudioContext( sampleRate ),
        useOvertoneInharmonicityFactors,
        useGpu,
        antiAliasing,
        frequencyUpdatesApplyToAllPathcNetworkOutputs
      );
      // console.log("Audio buffer:", audioBuffer);
      const wav = toWav(audioBuffer);
      fs.writeFileSync( fileNamePath, Buffer.from(new Uint8Array(wav)) );
      console.log("Wrote file:", fileNamePath);
      process.send({ status: 'saved', fileNamePath }, () => {
        console.log("Sent message to parent");
        process.exit(0);
      });
    } else {
      console.log("File exists, not rendering:", fileNamePath);
      process.send({ status: 'skipped existing file', fileNamePath }, () => {
        process.exit(0);
      });
    }
  } catch(err) {
    console.error("Error in worker:", err);
    // process.send({ status: 'error', error: err.message }, () => {
    //   process.exit(1);
    // });
    process.exit(1);
  }
});