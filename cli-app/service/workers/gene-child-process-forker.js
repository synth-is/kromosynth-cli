import { fork } from 'child_process';

export function callRandomGeneWorker(
  evolutionRunId, generationNumber, evolutionaryHyperparameters
) {
  // Fork a new process with a call to the gene evaluation worker
  return new Promise( (resolve, reject) => {
    const childProcess = fork('./service/workers/random-gene-worker.js');
    childProcess.on('message', resolve);
    childProcess.on('error', reject);
    childProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
    childProcess.send({
      evolutionRunId, generationNumber, evolutionaryHyperparameters
    });
  });
}

export function callGeneVariationWorker(
  genomeString,
  evolutionRunId,
  generationNumber,
  algorithmKey,
  probabilityMutatingWaveNetwork,
  probabilityMutatingPatch,
  audioGraphMutationParams,
  evolutionaryHyperparameters,
  patchFitnessTestDuration
) {
  // Fork a new process with a call to the gene evaluation worker
  return new Promise( (resolve, reject) => {
    const childProcess = fork('./service/workers/gene-variation-worker.js');
    childProcess.on('message', resolve);
    childProcess.on('error', reject);
    childProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
    childProcess.send({
      genomeString,
      evolutionRunId,
      generationNumber,
      algorithmKey,
      probabilityMutatingWaveNetwork,
      probabilityMutatingPatch,
      audioGraphMutationParams,
      evolutionaryHyperparameters,
      patchFitnessTestDuration
    });
  });
}

export function callGeneEvaluationWorker(
  genomeString,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  classificationGraphModel,
  modelUrl,
  useGpuForTensorflow,
  supplyAudioContextInstances
) {
  // Fork a new process with a call to the gene evaluation worker
  return new Promise( (resolve, reject) => {
    const childProcess = fork('./service/workers/gene-evaluation-worker.js');
    childProcess.on('message', resolve);
    childProcess.on('error', reject);
    childProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
    childProcess.send({
      genomeString,
      classScoringDurations,
      classScoringNoteDeltas,
      classScoringVelocities,
      classificationGraphModel,
      modelUrl,
      useGpuForTensorflow,
      supplyAudioContextInstances
    });
  });
}