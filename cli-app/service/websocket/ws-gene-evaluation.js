import { reverse } from "lodash-es";
import WebSocket from "ws";
import { augmentGenomeEvaluationHostPath } from "../../util/qd-common.js";
import { readEliteMapMetaFromDisk } from "../../util/qd-common-elite-map-persistence.js";

export function isServerAvailable( serverUrl ) {
  return new Promise( resolve => {
    const ws = new WebSocket(serverUrl);
    ws.onopen = () => {
      ws.close(1000);
      resolve(true);
    };
    ws.onerror = () => {
      ws.close(1000);
      resolve(false);
    };
  });
}

export async function renderAndEvaluateGenomesViaWebsockets(
  genome,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingWebsocketServerHost, renderSampleRateForClassifier,
  geneEvaluationWebsocketServerHost, featureExtractionHost, ckptDir,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  const predictionsAggregate = {};
  const evaluationPromises = [];
  for( let duration of classScoringDurations ) {
    for( let noteDelta of classScoringNoteDeltas ) {
      for( let velocity of classScoringVelocities ) {
        evaluationPromises.push(
          new Promise( async (resolve, reject) => {
            const audioBufferChannelData = await getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
              genome,
              duration,
              noteDelta,
              velocity,
              useGPU,
              antiAliasing,
              frequencyUpdatesApplyToAllPathcNetworkOutputs,
              geneRenderingWebsocketServerHost, renderSampleRateForClassifier,
            );
            // if audioBufferChannelData is not an instance of Float32Array, then it is an error message
            if( !(audioBufferChannelData instanceof Float32Array) ) {
              console.error('audioBufferChannelData error:', audioBufferChannelData);
            }
            if( audioBufferChannelData ) {

              let predictions;
              if( featureExtractionHost ) {
                // since featureExtractionHost is configured, we will extract features from the audio buffer and send those to the geneEvaluationWebsocketServerHost
                const { features } = await getFeaturesFromWebsocket(
                  audioBufferChannelData,
                  featureExtractionHost,
                  ckptDir,
                  renderSampleRateForClassifier
                );
                const featuresWsRequest = { features };
                const evaluationHostPath = augmentGenomeEvaluationHostPath( 
                  geneEvaluationWebsocketServerHost, zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
                  dynamicComponents, featureIndices
                );
                predictions = await getAudioClassPredictionsFromWebsocket(
                  JSON.stringify( featuresWsRequest ),
                  evaluationHostPath
                );
              } else {
                predictions = await getAudioClassPredictionsFromWebsocket(
                  audioBufferChannelData,
                  geneEvaluationWebsocketServerHost
                );
              }
              if( predictions ) {
                for( const classKey in predictions.taggedPredictions ) {
                  let isCurrentBestClassCandidate = false;
                  if( !predictionsAggregate[classKey] || 
                      predictionsAggregate[classKey].score < predictions.taggedPredictions[classKey] 
                  ) {
                    isCurrentBestClassCandidate = true;
                  }
                  if( isCurrentBestClassCandidate ) {
                    const classPrediction = {
                      score: predictions.taggedPredictions[classKey],
                      duration,
                      noteDelta,
                      velocity
                    };
                    predictionsAggregate[classKey] = classPrediction;
                  }
                }
              }
            }
            resolve();
          })
        );
      }
    }
  }
  await Promise.all( evaluationPromises );
  return predictionsAggregate;
}

// send websocket message to server, with genome and meta
export function getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
  genome,
  duration,
  noteDelta,
  velocity,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingWebsocketServerHost, renderSampleRateForClassifier,
  sampleCountToActivate,
  sampleOffset,
) {
  return new Promise((resolve, reject) => {
    const payload = {
      genomeString: genome,
      duration,
      noteDelta,
      velocity,
      useGPU,
      antiAliasing,
      frequencyUpdatesApplyToAllPathcNetworkOutputs,
      sampleRate: renderSampleRateForClassifier,
      sampleCountToActivate,
      sampleOffset,
    };
    const ws = getClient( geneRenderingWebsocketServerHost );
    let timeout;
    ws.on('open', () => {
      ws.send( JSON.stringify( payload ) );
      timeout = setTimeout(() => {
        reject(new Error('WebSocket request timed out'));
      }, 120000); // Set timeout to 60 seconds
    });
    ws.on('message', (message) => {
      clearTimeout(timeout); // Clear the timeout when a message is received
      // is this a buffer or a string?
      if( message instanceof Buffer ) {
        const buffer = new Uint8Array( message );
        const channelData = new Float32Array( buffer.buffer );
        // console.log('channelData', channelData);
        ws.close(1000); // close the websocket connection
        resolve( channelData );
      } else {
        ws.close(1000); // close the websocket connection
        reject( message );
      }
    });
    ws.on('error', (error) => {
      clearTimeout(timeout); // Clear the timeout on error
      delete clients[geneRenderingWebsocketServerHost];
      reject( error );
    });
    ws.on('close', function handleClose(code, reason) { // this actually catches the case when the server encounters WS_ERR_UNSUPPORTED_MESSAGE_LENGTH
      clearTimeout(timeout); // Clear the timeout on close
      console.log(`WebSocket connection closed with code: ${code}`);
      reject( code );
    });
  });
}

// send websocket message to server, with audio buffer
export function getAudioClassPredictionsFromWebsocket( 
  audioBufferChannelDataOrFeatureVector,
  geneEvaluationWebsocketServerHost
) {

  // TODO: error handling

  return new Promise((resolve, reject) => {
    const ws = getClient( geneEvaluationWebsocketServerHost );
    ws.on('open', () => {
      ws.send( audioBufferChannelDataOrFeatureVector );
    });
    ws.on('message', (message) => {
      try {
        const predictions = JSON.parse( message );
        ws.close(1000); // close the websocket connection
        resolve( predictions );
      } catch( error ) {
        console.error("getAudioClassPredictionsFromWebsocket: could not parse message: " + message, error);
        ws.close(1000); // close the websocket connection
        resolve( {} );
      }
    });
    ws.on('error', (error) => {
      delete clients[geneEvaluationWebsocketServerHost];
      reject( error );
    });
  });
}

// send websocket message to server, with audio buffer an receive features
export function getFeaturesFromWebsocket( 
  audioBufferChannelData,
  evaluationFeatureHost,
  ckptDir = "",
  sampleRate = ""
) {
  // if evaluationFeatureHost contains query parameters, add ckptDir and sampleRate as query parameters, if not, then add those as the only query parameters
  let evaluationFeatureHostWithQueryParams;
  if( evaluationFeatureHost.includes('?') ) {
    evaluationFeatureHostWithQueryParams = `${evaluationFeatureHost}&ckpt_dir=${ckptDir}&sample_rate=${sampleRate}`;
  } else {
    evaluationFeatureHostWithQueryParams = `${evaluationFeatureHost}?ckpt_dir=${ckptDir}&sample_rate=${sampleRate}`;
  }
  console.log('getFeaturesFromWebsocket', evaluationFeatureHostWithQueryParams);
  const ws = getClient( evaluationFeatureHostWithQueryParams );
  ws.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
  return new Promise((resolve, reject) => {
    let timeout;
    ws.on('open', () => {
      ws.send( audioBufferChannelData );
      timeout = setTimeout(() => {
        reject(new Error('WebSocket request timed out'));
      }, 120000); // Set timeout to 60 seconds
    });
    ws.on('message', (message) => {
      clearTimeout(timeout); // Clear the timeout when a message is received
      const features = JSON.parse( message );
      ws.close(1000); // close the websocket connection
      resolve( features );
    });
    ws.on('error', (error) => {
      clearTimeout(timeout); // Clear the timeout on error
      delete clients[evaluationFeatureHost];
      reject( error );
    });
  });
}

// send websocket message to server, with audio buffer and receive quality
export function getQualityFromWebsocket(  // TODO: rename to getQualityFromWebsocketForAudioBuffer
  audioBufferChannelData,
  evaluationQualityHost
) {
  console.log('getQualityFromWebsocket', evaluationQualityHost);
  const ws = getClient( evaluationQualityHost );
  ws.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send( audioBufferChannelData );
    });
    ws.on('message', (message) => {
      const quality = JSON.parse( message );
      ws.close(1000); // close the websocket connection
      resolve( quality );
    });
    ws.on('error', (error) => {
      delete clients[evaluationQualityHost];
      reject( error );
    });
  });
}

// send websocket message to server, with embedding and receive quality
export function getQualityFromWebsocketForEmbedding(
  embedding,
  evaluationQualityHost,
  zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
  dynamicComponents, featureIndices
) {
  if( embedding.length === 1 ) {
    console.error('getQualityFromWebsocketForEmbedding: embedding length is 1');
  }
  const qualityURL = augmentGenomeEvaluationHostPath( 
    evaluationQualityHost, zScoreNormalisationReferenceFeaturesPaths, zScoreNormalisationTrainFeaturesPath,
    dynamicComponents, featureIndices
  );
  // console.log('qualityURL:', qualityURL);
  const ws = getClient( qualityURL );
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send( JSON.stringify(embedding) );
    });
    ws.on('message', (message) => {
      if( message.status === 'ERROR' ) {
        console.error('getQualityFromWebsocketForEmbedding error:', message);
        ws.close(1000); // close the websocket connection
        reject( message );
      } else {
        const messageString = message.toString();
        const sanitizedMessage = messageString.replace(/NaN/g, 'null');
        const quality = JSON.parse(sanitizedMessage);
        ws.close(1000); // close the websocket connection
        resolve( quality );
      }
    });
    ws.on('error', (error) => {
      delete clients[evaluationQualityHost];
      reject( error );
    });
  });
}

export function addToQualityQueryEmbeddigs(
  embedding,
  candidateId, replacementId, // genome ids
  querySetEmbedsPath,
  evaluationQualityHost
) {
  console.log('addToQualityQueryEmbeddigs', evaluationQualityHost);
  const ws = getClient( `${evaluationQualityHost}/add-to-query-embeddings?eval_embds_path=${querySetEmbedsPath}&candidate_id=${candidateId}&replacement_id=${replacementId?replacementId:''}` );
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send( JSON.stringify(embedding) );
    });
    ws.on('message', (message) => {
      const quality = JSON.parse( message );
      ws.close(1000); // close the websocket connection
      resolve( quality );
    });
    ws.on('error', (error) => {
      delete clients[evaluationQualityHost];
      reject( error );
    });
  });
}

// send websocket message to server, with feature vectors and fitness values and receive diversity
export function getDiversityFromWebsocket( 
  featureVectors,
  fitnessValues,
  evaluationDiversityHost,
  evoRunDirPath, evolutionRunId,
  shouldFit,
  pcaComponents,
  shouldCalculateSurprise, shouldUseAutoEncoderForSurprise,
  shouldCalculateNovelty,
  dynamicComponents, featureIndices,
  tripletMarginMultiplier, useFeaturesDistance, featuresDistanceMetric, randomSeed,
  learningRate, trainingEpochs, tripletFormationStrategy 
) {
  console.log('getDiversityFromWebsocket', evaluationDiversityHost);
  const ws = getClient( evaluationDiversityHost );
  return new Promise((resolve, reject) => {
    let timeout;
    if( dynamicComponents && featureIndices ) {
      featureVectors = featureVectors.map(vector => featureIndices.map(index => vector[index]));
    }
    ws.on('open', () => {
      const diversityMessage = {
        "feature_vectors": featureVectors,
        "fitness_values": fitnessValues,
        "evorun_dir": evoRunDirPath,
        "should_fit": shouldFit,
        "calculate_surprise": shouldCalculateSurprise,
        "use_autoencoder_for_surprise": shouldUseAutoEncoderForSurprise,
        "calculate_novelty": shouldCalculateNovelty,
        "pca_components": pcaComponents,
        "dynamic_components": dynamicComponents,
        "selection_strategy": "improved", // choice of "improved" or "original"; "original" seems to eventually result in zero length feature indices, when using dynamic components
        "triplet_margin_multiplier": tripletMarginMultiplier || 1.0,
        "use_distance": useFeaturesDistance || false,
        "distance_metric": featuresDistanceMetric || "cosine",
        "random_seed": randomSeed || 42,
        "learning_rate": learningRate || 0.001,
        "training_epochs": trainingEpochs || 100,
        "triplet_formation_strategy": tripletFormationStrategy || "random",
      };
      ws.send( JSON.stringify( diversityMessage ), { timeout: 120000 } );
      timeout = setTimeout(() => {
        reject(new Error('WebSocket request timed out'));
      }, 1200000); // Set timeout to 10 minutes; e.g. UMAP can take a long time to train
    });
    ws.on('message', (message) => {
      clearTimeout(timeout); // Clear the timeout when a message is received
      const diversity = JSON.parse( message );
      ws.close(1000); // close the websocket connection
      resolve( diversity );
    });
    ws.on('error', (error) => {
      clearTimeout(timeout); // Clear the timeout on error
      delete clients[evaluationDiversityHost];
      reject( error );
    });
  });
}

// create singleton websocket clients
const clients = {};
function getClient( host ) {
  // if( !clients[host] ) {
  //   clients[host] = new WebSocket( host );
  // }
  // return clients[host];

  return new WebSocket( host );
}
