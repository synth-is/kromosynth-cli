import NodeWebAudioAPI from 'node-web-audio-api';
const { OfflineAudioContext } = NodeWebAudioAPI;
import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getGenomeFromGenomeString
} from 'kromosynth';
import { getAudioContext } from "../kromosynth.js";

export function randomGene(evolutionRunId, generationNumber, evolutionaryHyperparameters) {
  return getNewAudioSynthesisGenome(
    evolutionRunId,
    generationNumber,
    undefined,
    evolutionaryHyperparameters
  );
}

export async function geneVariation( 
  genomeJSONString,
  evolutionRunId, generationNumber, algorithmKey,
  probabilityMutatingWaveNetwork,
  probabilityMutatingPatch,
  audioGraphMutationParams,
  evolutionaryHyperparameters,
  patchFitnessTestDuration
) {
  const genome = await getGenomeFromGenomeString( genomeJSONString );
  return await getNewAudioSynthesisGenomeByMutation(
    genome,
    evolutionRunId, generationNumber, -1, algorithmKey, getAudioContext(),
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    OfflineAudioContext,
    patchFitnessTestDuration
  );
  // TODO conditional getNewAudioSynthesisGenomeByCrossover
}