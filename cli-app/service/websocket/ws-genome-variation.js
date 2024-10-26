import WebSocket from 'ws';

const clients = {};

function getClient(host) {
  return new WebSocket(host);
}

export function callRandomGeneService(
  evolutionRunId,
  generationNumber,
  evolutionaryHyperparameters,
  wsHost,
  oneCPPNPerFrequency
) {
  console.log("callRandomGeneService WebSocket:", wsHost);
  return new Promise((resolve, reject) => {
    const ws = getClient(wsHost);
    
    const payload = {
      type: 'RandomGenome',
      data: {
        evolution_run_id: evolutionRunId,
        generation_number: generationNumber,
        evolutionary_hyperparameters: evolutionaryHyperparameters,
        one_cppn_per_frequency: oneCPPNPerFrequency
      }
    };

    ws.on('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (message) => {
      const response = JSON.parse(message);
      if (response.error) {
        ws.close();
        reject(new Error(response.error));
      } else {
        ws.close();
        resolve(response.genome_string);
      }
    });

    ws.on('error', (error) => {
      ws.close();
      reject(error);
    });
  });
}

export function callGeneVariationService(
  genomeStrings,
  evolutionRunId,
  generationNumber,
  algorithmKey,
  probabilityMutatingWaveNetwork,
  probabilityMutatingPatch,
  audioGraphMutationParams,
  evolutionaryHyperparameters,
  patchFitnessTestDuration,
  wsHost,
  useGPU
) {
  console.log("callGeneVariationService WebSocket:", wsHost, ", useGPU:", useGPU);
  return new Promise((resolve, reject) => {
    const ws = getClient(wsHost);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('callGeneVariationService timed out'));
    }, 60000);

    const payload = {
      type: 'GenomeVariation',
      data: {
        genomeStrings,
        evolutionRunId,
        generationNumber,
        algorithmKey,
        probabilityMutatingWaveNetwork,
        probabilityMutatingPatch,
        audioGraphMutationParams,
        evolutionaryHyperparameters,
        patchFitnessTestDuration,
        useGPU
      }
    };

    ws.on('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (message) => {
      clearTimeout(timeout);
      const response = JSON.parse(message);
      if (response.error) {
        ws.close();
        reject(new Error(response.error));
      } else {
        ws.close();
        resolve(response.genome_string);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      ws.close();
      reject(error);
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
  wsHost
) {
  return new Promise((resolve, reject) => {
    const ws = getClient(wsHost);

    const payload = {
      type: 'GenomeEvaluation',
      data: {
        genomeString,
        classScoringDurations,
        classScoringNoteDeltas,
        classScoringVelocities,
        classificationGraphModel,
        useGpuForTensorflow,
        antiAliasing,
        frequencyUpdatesApplyToAllPathcNetworkOutputs
      }
    };

    ws.on('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (message) => {
      const response = JSON.parse(message);
      if (response.error) {
        ws.close();
        reject(new Error(response.error));
      } else {
        ws.close();
        resolve(response.genomeClassScores);
      }
    });

    ws.on('error', (error) => {
      ws.close();
      reject(error);
    });
  });
}

export function clearServiceConnectionList(host) {
  delete clients[host];
}