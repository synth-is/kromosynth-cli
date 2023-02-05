import { getClassScoresForGenome } from 'kromosynth';

export async function evaluate(
  genome, 
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  classificationGraphModel,
  useGpuForTensorflow,
  supplyAudioContextInstances
) {
  const genomeClassScores = await getClassScoresForGenome(
    genome,
    classScoringDurations,
    classScoringNoteDeltas,
    classScoringVelocities,
    classificationGraphModel,
    useGpuForTensorflow,
    supplyAudioContextInstances
  )
  .catch( async e => {
    console.error("mapElites -> getClassScoresForGenome: ", e);
  } );
  return genomeClassScores;
}