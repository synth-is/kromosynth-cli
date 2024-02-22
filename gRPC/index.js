/// genome creation and variation gRPC services (genomeEvaluation is not in use)
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { struct } from 'pb-util';
import parseArgs from 'minimist';
import crypto from 'crypto';
import {
  getNewAudioSynthesisGenome,
  getNewAudioSynthesisGenomeByMutation,
  getGenomeFromGenomeString,
  getClassScoresForGenome
} from 'kromosynth';
import NodeWebAudioAPI from 'node-web-audio-api';
const { AudioContext, OfflineAudioContext } = NodeWebAudioAPI;
let audioCtx;
import findFreePorts from "find-free-ports";
import fs from "fs";
import os from "os";
// https://flaviocopes.com/fix-dirname-not-defined-es-module-scope/ 😳
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_RATE = 16000;

const PROTO_PATH = __dirname + '/protos/gene.proto';
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
    genomeStrings,
    evolutionRunId, 
    generationNumber, 
    algorithmKey,
    probabilityMutatingWaveNetwork,
    probabilityMutatingPatch,
    audioGraphMutationParams,
    evolutionaryHyperparameters,
    patchFitnessTestDuration
  } = call.request;
  let error = null;
  let newGenome;
  try {
    const genomeStringsArray = struct.decode( genomeStrings ).genomeStrings;
    const audioGraphMutationParamsDecoded = struct.decode( audioGraphMutationParams );
    const evolutionaryHyperparametersDecoded = struct.decode( evolutionaryHyperparameters );
    const genomes = await Promise.all( genomeStringsArray.map( async genomeString => await getGenomeFromGenomeString( 
      genomeString, evolutionaryHyperparametersDecoded 
    ) ) );
    newGenome = await getNewAudioSynthesisGenomeByMutation(
      genomes,
      evolutionRunId, generationNumber, -1, algorithmKey, 
      getAudioContext(),
      probabilityMutatingWaveNetwork,
      probabilityMutatingPatch,
      audioGraphMutationParamsDecoded,
      evolutionaryHyperparametersDecoded,
      OfflineAudioContext,
      patchFitnessTestDuration
    );  
  } catch (e) {
    console.error("gRPC -> mutatedGenome", e);
    error = e;
  }
  
  // TODO conditional getNewAudioSynthesisGenomeByCrossover
  console.log("Created new genome by variation for evolution run", evolutionRunId);
  let genome_string;
  if( newGenome ) {
    genome_string = JSON.stringify( newGenome );
  } else {
    genome_string = "";
  }

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
    useGpuForTensorflow,
    antiAliasing,
    frequencyUpdatesApplyToAllPathcNetworkOutputs
  } = call.request;
  const genome = await getGenomeFromGenomeString( genomeString );
  const genomeClassScores = await getClassScoresForGenome(
    genome,
    Object.values(struct.decode( classScoringDurations )),
    Object.values(struct.decode( classScoringNoteDeltas )),
    Object.values(struct.decode( classScoringVelocities )),
    classificationGraphModel, modelUrl,
    useGpuForTensorflow,
    antiAliasing,
    true, // supplyAudioContextInstances
    true, // useOvertoneInharmonicityFactors
    frequencyUpdatesApplyToAllPathcNetworkOutputs,
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

function filepathToPort( filepath ) {
  // Using the crypto module to generate a hash of the filepath
  let hash = crypto.createHash('md5').update(filepath).digest("hex");

  // Converting the first 8 charachters of the hashed string into a number
  let shortHash = parseInt(hash.substring(0, 8), 16);

  let portLowerBound = 8192; // 1024;
  let portUpperBound = 65535;
  // Ensuring the port number falls within the dynamic or private port range
  let port = portLowerBound + shortHash % (portUpperBound - portLowerBound);

  return port;
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  let port;
  let hostname;
  if( argv.hostInfoFilePath ) {
    // automatically assign port and write the info to the specified file path
    // const freePort = await findFreePorts(1, {startPort: 50051});
    // port = freePort[0];
    console.log("--- argv.hostInfoFilePath:", argv.hostInfoFilePath);
    port = filepathToPort( argv.hostInfoFilePath );
    hostname = `${os.hostname()}:${port}`;
    console.log("--- hostname:", hostname);
    fs.writeFile(argv.hostInfoFilePath, hostname, () => console.log(`Wrote hostname to ${argv.hostInfoFilePath}`));
  } else {
    port = argv.port || process.env.PORT || '50051';
  }
  modelUrl = argv.modelUrl;
  const processTitle = argv.processTitle || 'kromosynth-gRPC';
  process.title = processTitle;
  process.on('SIGINT', () => process.exit(1)); // so it can be stopped with Ctrl-C
  
  const MAX_MESSAGE_SIZE = 100*1024*1024; // 100MB
  const server = new grpc.Server({
    'grpc.max_send_message_length': MAX_MESSAGE_SIZE,
    'grpc.max_receive_message_length': MAX_MESSAGE_SIZE
  });
  server.addService( gene_proto.Genome.service, {
    randomGenome: newGenome,
    genomeVariation: mutatedGenome,
    genomeEvaluation: evaluateGenome
  });

  console.log("Genome variation gRPC server starting...", "modelUrl:", modelUrl);
  if( hostname ) {
    server.bindAsync( hostname, grpc.ServerCredentials.createInsecure(), (error, port) => {
      server.start();
      console.log("Listenig on host:port", hostname, port);
    } );
  } else {
    server.bindAsync( `0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
      server.start();
      console.log("Listenig on port", port);
    } );  
  }
}

main();