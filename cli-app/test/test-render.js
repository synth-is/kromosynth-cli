import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getGenomeFromGenomeString,
  getClassScoresForGenome,
  getAudioBufferFromGenomeAndMeta
} from 'kromosynth';
import waveFileModule from 'wavefile';
const { WaveFile } = waveFileModule;
import fs from 'fs';

let audioCtx;
export const SAMPLE_RATE = 48000;

export function getAudioContext( sampleRate = SAMPLE_RATE) {
	if( ! audioCtx ) audioCtx = new AudioContext({sampleRate});
	
	// https://github.com/ircam-ismm/node-web-audio-api/issues/23#issuecomment-1636134712
	// audioCtx.destination.channelCount = 2;
	// audioCtx.destination.channelInterpretation = 'discrete';
	// await audioCtx.resume();
// console.log('audioCtx', audioCtx);
	return audioCtx;
}

export function getNewOfflineAudioContext( duration, sampleRate = SAMPLE_RATE ) {
	const offlineAudioContext = new OfflineAudioContext({
		numberOfChannels: 2,
		length: Math.round(sampleRate * duration),
		// length: SAMPLE_RATE * duration,
		sampleRate
	});
	// offlineAudioContext.destination.channelCount = 1;
	// offlineAudioContext.destination.channelInterpretation = 'discrete';
	return offlineAudioContext;
}

async function spawnGenomeAndRenderSound() {
  const evolutionRunId = Date.now();
  const generationNumber = 0;
  const duration = 1;
  const noteDelta = 0;
  const velocity = 1;
  const reverse = false;
  const useOvertoneInharmonicityFactors = true;

  const genome = getNewAudioSynthesisGenome(
    evolutionRunId,
    generationNumber,
    undefined, // parentIndex
    undefined, // evolutionaryHyperparameters
    true // oneCPPNPerFrequency
  );


  // const mutatedGenome = await getNewAudioSynthesisGenomeByMutation(
  //   [genome],
  //   evolutionRunId,
  //   generationNumber,
  //   undefined, // parentIndex
  //   "test-render", // algorithmKey
  //   getAudioContext( ),
  //   0.5, // probabilityMutatingWaveNetwork
  //   0.5, // probabilityMutatingPatch
  //   undefined, // asNEATMutationParams
  //   undefined, // evoParams
  //   OfflineAudioContext,
  //   1 // patchFitnessTestDuration
  // );

  const mutationCount = 66;
  let mutatedGenome = genome;
  for ( let i=0; i<mutationCount; i++ ) {
    mutatedGenome = await getNewAudioSynthesisGenomeByMutation(
      [mutatedGenome],
      evolutionRunId,
      generationNumber,
      undefined, // parentIndex
      "test-render", // algorithmKey
      getAudioContext( ),
      0.8, // probabilityMutatingWaveNetwork
      0.2, // probabilityMutatingPatch
      undefined, // asNEATMutationParams
      undefined, // evoParams
      OfflineAudioContext,
      1 // patchFitnessTestDuration
    );
    if( ! mutatedGenome ) break;
  }

  console.log("mutatedGenome", mutatedGenome);

  if( mutatedGenome ) {
    const genomeAndMeta = {genome: mutatedGenome, duration, noteDelta, velocity, reverse, useOvertoneInharmonicityFactors};
    const useGPU = false;
    const antiAliasing = true;
    const frequencyUpdatesApplyToAllPathcNetworkOutputs = false;
  
    const audioData = await getAudioBufferFromGenomeAndMeta(
      genomeAndMeta,
      duration, noteDelta, velocity, reverse,
      true, // asDataArray
      getNewOfflineAudioContext( duration ),
      getAudioContext( ),
      useOvertoneInharmonicityFactors,
      useGPU,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs
    );
    console.log("audioData.length", audioData.length);
    const wav = new WaveFile();
    wav.fromScratch(1, SAMPLE_RATE, '32f', audioData);
    const buffer = wav.toBuffer();
    console.log("buffer.length", buffer.length);
    fs.writeFileSync(`/Users/bjornpjo/Downloads/test_${Date.now()}.wav`, buffer);
  }
}

await spawnGenomeAndRenderSound();
process.exit();