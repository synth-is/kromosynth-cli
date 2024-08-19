
import { getAudioContext } from '../util/rendering-common.js';
import { readWavFile } from "../util/file-common.js";
import { 
  generateRandomSoundBuffer, generateSoundBufferWithSpikesAndGaps, generateSoundBufferWithSineWave, generateSoundBufferWithSquareWave, generateSoundBufferWithTriangleWave, generateSoundBufferWithSawtoothWave, generateSoundBufferWithSilence,
  callQualityEvaluationService, callQualityEvaluationServiceForFeatureVectors,
  callQualityEvaluationServiceForEmbedding, callQualityEvaluationServiceForAddingEmbedding,
  callFeatureExtractionService,
   getDiversityFromWebsocket
} from "./test-common.js";




const SAMPLE_RATE = 16000;
// const SAMPLE_RATE = 48000;


async function callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues( numberOfEvaluationCandidates = 1 ) {
  // get numberOfEvaluationCandidates feature vectors and fitness values by calling callFeatureExtractionServiceWithARandomSoundBuffer and callQualityEvaluationServiceWithARandomSoundBuffer
  const featureVectors = [];
  const fitnessValues = [];
  for (let i = 0; i < numberOfEvaluationCandidates; i++) {
    const audioBuffer = generateRandomSoundBuffer(SAMPLE_RATE*10);
    // const audioBuffer = generateSoundBufferWithSpikesAndGaps(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSineWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSquareWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithTriangleWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSawtoothWave(SAMPLE_RATE*5);
    // const audioBuffer = generateSoundBufferWithSilence(SAMPLE_RATE*5.0);

    // const audioBuffer = await readWavFile('/Users/bjornpjo/Downloads/nsynth-valid/customRef/samples/customRef1/vocal_synthetic_003-038-100.wav');
    
    const featureResponse = await callFeatureExtractionService( audioBuffer );
    const { features, embedding } = featureResponse;
    
    /// instruments, instrumentation and general sound events:
    // const fitnessValue = await callQualityEvaluationService( audioBuffer, "?classifiers=nsynth,yamnet,mtg_jamendo_instrument,music_loop_instrument_role,mood_acoustic,mood_electronic,voice_instrumental,voice_gender,timbre,nsynth_acoustic_electronic,nsynth_bright_dark,nsynth_reverb" );
    // const fitnessValue = await callQualityEvaluationService( audioBuffer, "?classifiers=nsynth,yamnet,mtg_jamendo_instrument,music_loop_instrument_role,nsynth_acoustic_electronic,nsynth_bright_dark,nsynth_reverb" );
    /// only instruments:
    // const fitnessValue = await callQualityEvaluationService( audioBuffer, "?classifiers=nsynth,mtg_jamendo_instrument" );
    
    const fitnessValue = await callQualityEvaluationServiceForFeatureVectors( features );
    
    // const fitnessValue = await callQualityEvaluationServiceForEmbedding(
    //   embedding,
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/bass/embeds.npy',
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/brass/embeds.npy', //'/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/family-split/brass/embeds.npy',
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/source-split/acoustic/embeds.npy',
    //   // '/Users/bjornpjo/Downloads/nsynth-valid/embeds/vggish/source-split/acoustic/embeds.npy',
    //   '/Users/bjornpjo/Downloads/nsynth-valid/customRef/embeddings/customRef1/embeds.npy',
    //   '/Users/bjornpjo/Downloads/nsynth-valid/customRef/embeddings/customEvalDump/embeds.npy',
    //   false, // measureCollectivePerformance
    //   '/Users/bjornpjo/.cache/torch/hub/checkpoints'
    // );

    // const addEmbeddingToFileResult = await callQualityEvaluationServiceForAddingEmbedding(
    //   embedding,
    //   '/Users/bjornpjo/Downloads/randomembeds.npy'
    // );
    // console.log('addEmbeddingToFileResult:', addEmbeddingToFileResult);


    // featureVectors.push(features);
    fitnessValues.push(fitnessValue);
  }
  // console.log('feature vectors:', featureVectors, "shape:", featureVectors.length, featureVectors[0].length);

  console.log('fitness values:', fitnessValues);
  return fitnessValues

  // const diversity = await getDiversityFromWebsocket(
  //   featureVectors,
  //   fitnessValues
  // );
  // console.log('audio diversity:', diversity);
  // return diversity;
}

// callFeatureExtractionService();
// callQualityEvaluationService();

callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues(1);
// callDiversityEvaluationServiceWithFeatureVectorsAndFitnessValues();
