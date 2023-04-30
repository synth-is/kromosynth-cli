import { getClassScoresForGenome, getGenomeFromGenomeString } from 'kromosynth';

export async function evaluate(
  genomeString, 
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  classificationGraphModel,
  modelUrl,
  useGpuForTensorflow,
  supplyAudioContextInstances
) {
  const genome = await getGenomeFromGenomeString( genomeString );
  const genomeClassScores = await getClassScoresForGenome(
    genome,
    classScoringDurations,
    classScoringNoteDeltas,
    classScoringVelocities,
    classificationGraphModel,
    modelUrl,
    useGpuForTensorflow,
    supplyAudioContextInstances
  )
  .catch( async e => {
    console.error("mapElites -> getClassScoresForGenome: ", e);
  } );
  return genomeClassScores;
}