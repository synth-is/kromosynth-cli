import { workerData, parentPort } from 'worker_threads';
import { randomGene } from './gene-factory.js';

const {
  evolutionRunId, generationNumber, evolutionaryHyperparameters
} = workerData;
const genome = randomGene( evolutionRunId, generationNumber, evolutionaryHyperparameters );
parentPort.postMessage( genome );