import { callGeneVariationService } from '../service/gRPC/gene_client.js';
import { readGenomeAndMetaFromDisk } from '../util/qd-common-elite-map-persistence.js';

const genomeString = await readGenomeAndMetaFromDisk(
  "01JA6KRYPX52QN3WD3RQ6PGFFQ_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09",
  "01JA6KSNH6PAQFA8J7NEG6MB60",
  "/fp/projects01/ec29/bthj/evoruns/singleMapBDs/01JA6KRYPX52QN3WD3RQ6PGFFQ_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09/"
);
JSON.parse(genomeString);
const genomeStrings = [genomeString];
const evolutionRunId = "test";
const generationNumber = 1;
const algorithmKey = "test";
const probabilityMutatingWaveNetwork = 0.5;
const probabilityMutatingPatch = 0.5;
const patchFitnessTestDuration = 0.1;
const audioGraphMutationParams = {
  mutationDistance: 0.5,
  splitMutationChance: 0.2,
  addOscillatorChance: 0.1,
  addAudioBufferSourceChance: 0.1,
  addPartialAndEnvelopeChance: 0.1,
  addConnectionChance: 0.1,
  mutateConnectionWeightsChance: 0.2,
  mutateNodeParametersChance: 0.2
};
const evolutionaryHyperparameters = {
  waveNetwork: {
    neatParameters: {
      pMutateAddConnection: 0.1,
      pMutateAddNode: 0.1,
      pMutateDeleteSimpleNeuron: 0.06,
      pMutateDeleteConnection: 0.06,
      pMutateConnectionWeights: 0.72,
      pMutateChangeActivations: 0.02,
      pNodeMutateActivationRate: 0.2,
      connectionWeightRange: 3,
      disallowRecurrence: true
    },
    iecOptions: { initialMutationCount: 5, postMutationCount: 5 },
    activationFunctionProbabilities: {
      triangle: 0.25,
      sawtooth: 0.25,
      StepFunction: 0.25,
      Sine: 0.25,
      Sine2: 0.25,
      cos: 0,
      arctan: 0,
      spike: 0,
      BipolarSigmoid: 0,
      PlainSigmoid: 0,
      Gaussian: 0,
      Linear: 0,
      NullFn: 0
    }
  },
  audioGraph: {
    mutationParams: {
      mutationDistance: 0.5,
      splitMutationChance: 0.2,
      addOscillatorChance: 0.1,
      addAudioBufferSourceChance: 0.1,
      addPartialAndEnvelopeChance: 0.1,
      addConnectionChance: 0.1,
      mutateConnectionWeightsChance: 0.2,
      mutateNodeParametersChance: 0.2
    },
    defaultParameters: {
      connectionMutationRate: [0.05, 0.8],
      nodeMutationRate: [0.05, 0.8],
      addOscillatorFMMutationRate: 0.1,
      addConnectionFMMutationRate: 0.5,
      addOscillatorNetworkOutputVsOscillatorNodeRate: 1,
      addAudioBufferSourceProperChance: 0.3,
      addAudioBufferSourceWavetableChance: 0.3,
      addAudioBufferSourceAdditiveChance: 0.4,
      includeNoise: true,
      initialOscillatorChance: 0.5,
      initialAudioBufferSourceChance: 0.5
    }
  }
};

const gRPCHost = "c1-8.fox:9338";

const useGPU = false;

let genome;
for( let i=0; i < 100000; i++ ) {
  console.log("genome variation attempt:", i);
  genome = await callGeneVariationService(
    genomeStrings,
    evolutionRunId, generationNumber, algorithmKey,
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    patchFitnessTestDuration,
    gRPCHost,
    useGPU
  );
}

console.log("genome", genome);

// server:
// cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/
// apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --max-old-space-size=8192 --modelUrl file:///fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/grpc-test-host-1