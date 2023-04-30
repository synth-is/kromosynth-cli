import { evaluate } from '../gene-evaluation.js';

// On child process fork message, evaluate the genome and return the result to the main thread
process.on('message', (msg) => {
  const {
    genomeString,
    classScoringDurations,
    classScoringNoteDeltas,
    classScoringVelocities,
    classificationGraphModel,
    modelUrl,
    useGpuForTensorflow,
    supplyAudioContextInstances
  } = msg;
  evaluate(
    genomeString,
    classScoringDurations,
    classScoringNoteDeltas,
    classScoringVelocities,
    classificationGraphModel,
    modelUrl,
    useGpuForTensorflow,
    supplyAudioContextInstances
  
  ).then( genomeClassScores => {
    process.send({...genomeClassScores});
  } );
});