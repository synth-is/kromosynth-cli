import { fork } from 'child_process';

let randomGeneChildProcesses;
let geneVariationChildProcesses;
let geneEvaluationChildProcesses;

export function callRandomGeneWorker(
  threadCount, threadNumber,
  evolutionRunId, generationNumber, evolutionaryHyperparameters
) {
  if( ! randomGeneChildProcesses ) randomGeneChildProcesses = new Array(threadCount);
  // Fork a new process with a call to the gene evaluation worker
  return new Promise( (resolve, reject) => {
    let childProcess;
    if( randomGeneChildProcesses[threadNumber] ) {
      childProcess = randomGeneChildProcesses[threadNumber];
    } else {
      childProcess = fork('./service/workers/random-gene-worker.js');
      randomGeneChildProcesses[threadNumber] = childProcess;
    }
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
  threadCount, threadNumber,
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
  if( ! geneVariationChildProcesses ) geneVariationChildProcesses = new Array(threadCount);
  // Fork a new process with a call to the gene evaluation worker
  return new Promise( (resolve, reject) => {
    let childProcess;
    if( geneVariationChildProcesses[threadNumber] ) {
      childProcess = geneVariationChildProcesses[threadNumber];
    } else {
      childProcess = fork('./service/workers/gene-variation-worker.js');
      geneVariationChildProcesses[threadNumber] = childProcess;
    }
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
  threadCount, threadNumber,
  genomeString,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  classificationGraphModel,
  modelUrl,
  useGpuForTensorflow,
  supplyAudioContextInstances
) {
  if( ! geneEvaluationChildProcesses ) geneEvaluationChildProcesses = new Array(threadCount);
  // Fork a new process with a call to the gene evaluation worker
  return new Promise( (resolve, reject) => {
    let childProcess;
    if( geneEvaluationChildProcesses[threadNumber] ) {
      childProcess = geneEvaluationChildProcesses[threadNumber];
    } else {
      childProcess = fork('./service/workers/gene-evaluation-worker.js');
      geneEvaluationChildProcesses[threadNumber] = childProcess;
    }
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