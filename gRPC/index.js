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
  let error = null;
  let newGenome;
  try {
    const genome = await getGenomeFromGenomeString( genomeString );
    newGenome = await getNewAudioSynthesisGenomeByMutation(
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
    antiAliasing
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

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  let port;
  let hostname;
  if( argv.hostInfoFilePath ) {
    // automatically assign port and write the info to the specified file path
    // const freePort = await findFreePorts(1, {startPort: 50051});
    // port = freePort[0];
    console.log("--- argv.hostInfoFilePath:", argv.hostInfoFilePath);
    port = 50051;
    argv.hostInfoFilePath.substring(argv.hostInfoFilePath.lastIndexOf("host-")+5).split("-").reverse().forEach( (i, idx) => port += parseInt(i) * (idx+1*10) );
    hostname = `${os.hostname()}:${port}`;
    console.log("--- hostname:", hostname);
    fs.writeFile(argv.hostInfoFilePath, hostname, () => console.log(`Wrote hostname to ${argv.hostInfoFilePath}`));
  } else {
    port = argv.port || process.env.PORT || '50051';
  }
  console.log("port:",port);
  modelUrl = argv.modelUrl;
  console.log("modelUrl:",modelUrl);
  const processTitle = argv.processTitle || 'kromosynth-gRPC';
  process.title = processTitle;
  process.on('SIGINT', () => process.exit(1)); // so it can be stopped with Ctrl-C
  
  const server = new grpc.Server();
  server.addService( gene_proto.Genome.service, {
    randomGenome: newGenome,
    genomeVariation: mutatedGenome,
    genomeEvaluation: evaluateGenome
  });
  if( hostname ) {
    server.bindAsync( hostname, grpc.ServerCredentials.createInsecure(), (error, port) => {
      server.start();
      console.log("Listenig on host:port", hostname);
    } );
  } else {
    server.bindAsync( `0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
      server.start();
      console.log("Listenig on port", port);
    } );  
  }
}

main();