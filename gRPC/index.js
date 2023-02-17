import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { struct } from 'pb-util';
import parseArgs from 'minimist';
import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getGenomeFromGenomeString,
  getClassScoresForGenome
} from 'kromosynth';
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext } = NodeWebAudioAPI;
let audioCtx;

const SAMPLE_RATE = 48000;

const PROTO_PATH = '../protos/gene.proto';
const packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true}
);
const gene_proto = grpc.loadPackageDefinition(packageDefinition).kromosynthgene;

function newGenome( call, callback ) {
  const evolutionRunId = call.request.evolution_run_id;
  const generationNumber = call.request.generation_number;
  const evolutionaryHyperparameters = struct.decode(call.request.evolutionary_hyperparameters);

  const genome = getNewAudioSynthesisGenome(
    evolutionRunId,
    generationNumber,
    undefined,
    evolutionaryHyperparameters
  );
  console.log("Created new gene for evolution run", evolutionRunId);
  const genome_string = JSON.stringify( genome );

  return callback( null, { genome_string } );
}

async function mutatedGenome( call, callback ) {
  const {
    genomeString,
    evolutionRunId, 
    generationNumber, 
    algorithmKey,
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    patchFitnessTestDuration
  } = call.request;
  const genome = await getGenomeFromGenomeString( genomeString );
  const newGenome = await getNewAudioSynthesisGenomeByMutation(
    genome,
    evolutionRunId, generationNumber, -1, algorithmKey, 
    getAudioContext(),
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    struct.decode( audioGraphMutationParams ),
    struct.decode( evolutionaryHyperparameters ),
    OfflineAudioContext,
    patchFitnessTestDuration
  );
  // TODO conditional getNewAudioSynthesisGenomeByCrossover
  console.log("Created new genome by variation for evolution run", evolutionRunId);
  const genome_string = JSON.stringify( newGenome );

  return callback( null, {genome_string} );
}

let modelUrl;
async function evaluateGenome( call, callback ) {
  let error = null;
  const {
    genomeString,
    classScoringDurations,
    classScoringNoteDeltas,
    classScoringVelocities,
    classificationGraphModel,
    useGpuForTensorflow
  } = call.request;
  const genome = await getGenomeFromGenomeString( genomeString );
  const genomeClassScores = await getClassScoresForGenome(
    genome,
    Object.values(struct.decode( classScoringDurations )),
    Object.values(struct.decode( classScoringNoteDeltas )),
    Object.values(struct.decode( classScoringVelocities )),
    classificationGraphModel, modelUrl,
    useGpuForTensorflow,
    true // supplyAudioContextInstances
  )
  .catch( e => {
    console.error("mapElites -> getClassScoresForGenome: ", e);
    error = e;
  } );

  return callback( error, {
    genomeClassScores: struct.encode( genomeClassScores )
  } );
}


function getAudioContext() {
	if( ! audioCtx ) audioCtx = new AudioContext({sampleRate: SAMPLE_RATE});
	return audioCtx;
}

function main() {
  const argv = parseArgs(process.argv.slice(2));
  console.log("process.env.PORT:",process.env.PORT);
  const port = argv.port || process.env.PORT || '50051';
  console.log("port:",port);
  modelUrl = argv.modelUrl;
  console.log("modelUrl:",modelUrl);
  const processTitle = argv.processTitle || 'kromosynth-gRPC';
  process.title = processTitle;
  
  const server = new grpc.Server();
  server.addService( gene_proto.Genome.service, {
    randomGenome: newGenome,
    genomeVariation: mutatedGenome,
    genomeEvaluation: evaluateGenome
  });
  server.bindAsync( `0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
    server.start();
    console.log("Listenig on port", port);
  } );
}

main();