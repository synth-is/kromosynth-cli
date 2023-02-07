import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { struct } from 'pb-util';
import parseArgs from 'minimist';
import { randomGene } from '../gene-factory.js';

const PROTO_PATH = './gene.proto';
const packageDefinition = protoLoader.loadSync(
  PROTO_PATH,
  {keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true}
);
const gene_proto = grpc.loadPackageDefinition(packageDefinition).kromosynthgene;

function newGene(call, callback) {
  const evolutionRunId = call.request.evolution_run_id;
  const generationNumber = call.request.generation_number;
  const evolutionaryHyperparameters = struct.decode(call.request.evolutionary_hyperparameters);
  const genome = randomGene( evolutionRunId, generationNumber, evolutionaryHyperparameters );
  console.log( "genome" );
  console.log( genome );
  callback( null, {todo: "TODO"} );
}

function main() {
  const argv = parseArgs(process.argv.slice(2));
  const port = argv.port || '50051';
  
  const server = new grpc.Server();
  server.addService( gene_proto.Gene.service, {
    randomGene: newGene
  });
  server.bind( `0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure() ); // TODO: or bindAsync?
  server.start();
}

main();