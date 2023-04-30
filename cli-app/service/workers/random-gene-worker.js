import { getNewAudioSynthesisGenome } from "kromosynth";

// On child process fork message, create a random genome and return the result to the main thread
process.on('message', (msg) => {
  const {
    evolutionRunId,
    generationNumber,
    evolutionaryHyperparameters
  } = msg;
  const genome = getNewAudioSynthesisGenome(
    evolutionRunId,
    generationNumber,
    undefined,
    evolutionaryHyperparameters
  );
  process.send({genomeString: JSON.stringify(genome)});
});