import { getGenomeFromGenomeString, getNewAudioSynthesisGenomeByMutation } from "kromosynth";
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext } = NodeWebAudioAPI;

let audioCtx;
const SAMPLE_RATE = 16000;

// On child process fork message, mutate the genome and return the result to the main thread
process.on('message', async (msg) => {
  const {
    genomeStrings,
    evolutionRunId,
    generationNumber,
    algorithmKey,
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    patchFitnessTestDuration
  } = msg;
  const genomes = await Promise.all( genomeStrings.map( async genomeString => await getGenomeFromGenomeString( genomeString ) ) );
  getNewAudioSynthesisGenomeByMutation(
    genomes,
    evolutionRunId, generationNumber, -1, algorithmKey,
    getAudioContext(),
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    OfflineAudioContext,
    patchFitnessTestDuration
  ).then( newGenome => {
    const newGenomeString = JSON.stringify(newGenome);
    process.send({newGenomeString});
  });
});

function getAudioContext() {
	if( ! audioCtx ) audioCtx = new AudioContext({sampleRate: SAMPLE_RATE});
	return audioCtx;
}