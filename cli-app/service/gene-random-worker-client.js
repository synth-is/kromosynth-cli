import { Worker } from "worker_threads";

export function callRandomGeneService(
  evolutionRunId, generationNumber, evolutionaryHyperparameters
) {
  return new Promise((resolve, reject) => {
    const worker = new  Worker(
      "./service/gene-random-worker.js",
      {evolutionRunId, generationNumber, evolutionaryHyperparameters}
    );
    worker.on( "message", resolve ) ;
    worker.on( "error", reject );
    worker.on( "exit", (code) => {
      if( code !== 0 )
        reject(new Error(`Worker stopped with exit code ${code}`));
    })
  });
}