import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { struct } from 'pb-util';
// https://flaviocopes.com/fix-dirname-not-defined-es-module-scope/ 😳
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_MESSAGE_SIZE = 100*1024*1024; // 100MB

const PROTO_PATH = __dirname + '/../../../gRPC/protos/gene.proto';
let clients = {};

export function callRandomGeneService(
  evolutionRunId, generationNumber, evolutionaryHyperparameters, gRPCHost,
  oneCPPNPerFrequency
) {
  console.log("callRandomGeneService gRPC:", gRPCHost);
  return new Promise((resolve, reject) => {
    const payload = {
      evolution_run_id: evolutionRunId,
      generation_number: generationNumber,
      evolutionary_hyperparameters: struct.encode( evolutionaryHyperparameters ),
      one_cppn_per_frequency: oneCPPNPerFrequency
    };
    getClient( gRPCHost ).RandomGenome( payload, (err, response) => {
      if( err ) {
        reject( err );
      } else {
        resolve( response.genome_string );
      }
    });
  });
}

export function callGeneVariationService(
  genomeStrings,
  evolutionRunId, generationNumber, algorithmKey,
  probabilityMutatingWaveNetwork,
  probabilityMutatingPatch,
  audioGraphMutationParams,
  evolutionaryHyperparameters,
  patchFitnessTestDuration,
  gRPCHost
) {
  console.log("callGeneVariationService gRPC:", gRPCHost);
  return new Promise((resolve, reject) => {
    const payload = {
      genomeStrings: struct.encode( {genomeStrings} ),
      evolutionRunId, 
      generationNumber, 
      algorithmKey,
      probabilityMutatingWaveNetwork,
      probabilityMutatingPatch,
      audioGraphMutationParams: struct.encode( audioGraphMutationParams ),
      evolutionaryHyperparameters: struct.encode( evolutionaryHyperparameters ),
      patchFitnessTestDuration
    };
    getClient( gRPCHost ).GenomeVariation( payload, (err, response) => {
      if( err ) {
        reject( err );
      } else {
        resolve( response.genome_string );
      }
    });
  });
}

export function callGeneEvaluationService(
  genomeString,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  classificationGraphModel,
  useGpuForTensorflow,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  gRPCHost
) {
  return new Promise((resolve, reject) => {
    const payload = {
      genomeString,
      classScoringDurations: struct.encode( classScoringDurations ),
      classScoringNoteDeltas: struct.encode( classScoringNoteDeltas ),
      classScoringVelocities: struct.encode( classScoringVelocities ),
      classificationGraphModel,
      useGpuForTensorflow,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs
    };
    getClient( gRPCHost ).GenomeEvaluation( payload, (err, response) => {
      if( err ) {
        reject( err );
      } else {
        resolve( struct.decode(response.genomeClassScores) );
      }
    });
  });
}

export function clearServiceConnectionList( host ) {
  clients[host] = undefined;
}

function getClient( gRPCHost ) {
  const _host = gRPCHost || 'localhost:50051';
  if( ! clients[_host] ) {
    const packageDefinition = protoLoader.loadSync(
      PROTO_PATH,
      {keepCase: true,
       longs: String,
       enums: String,
       defaults: true,
       oneofs: true
      }
    );
    const gene_proto = grpc.loadPackageDefinition(packageDefinition).kromosynthgene;

    clients[_host] = new gene_proto.Genome(_host, grpc.credentials.createInsecure(), {
      
      'grpc.max_send_message_length': MAX_MESSAGE_SIZE,
      'grpc.max_receive_message_length': MAX_MESSAGE_SIZE
    });
  }
  return clients[_host];
}