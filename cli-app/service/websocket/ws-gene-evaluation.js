import { reverse } from "lodash-es";
import WebSocket from "ws";

export async function renderAndEvaluateGenomesViaWebsockets(
  genome,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  useGPU,
  antiAliasing,
  frequencyUpdatesApplyToAllPathcNetworkOutputs,
  geneRenderingWebsocketServerHost, renderSampleRateForClassifier,
  geneEvaluationWebsocketServerHost
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
            if( audioBufferChannelData ) {
              const predictions = await getAudioClassPredictionsFromWebsocket(
                audioBufferChannelData,
                geneEvaluationWebsocketServerHost
              );
              if( predictions ) {
                for( const classKey in predictions.taggedPredictions ) {
                  let isCurrentBestClassCandidate = false;
                  if( !predictionsAggregate[classKey] || 
                      predictionsAggregate[classKey].score < predictions.taggedPredictions[classKey].score 
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
  geneRenderingWebsocketServerHost, renderSampleRateForClassifier
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
      sampleRate: renderSampleRateForClassifier
    };
    const ws = getClient( geneRenderingWebsocketServerHost );
    ws.on('open', () => {
      ws.send( JSON.stringify( payload ) );
    });
    ws.on('message', (message) => {

      // is this a buffer or a string?
      if( message instanceof Buffer ) {
        const buffer = new Uint8Array( message );
        const channelData = new Float32Array( buffer.buffer );
        // console.log('channelData', channelData);
        resolve( channelData );
      } else {
        reject( message );
      }
    });
    ws.on('error', (error) => {
      delete clients[geneRenderingWebsocketServerHost];
      reject( error );
    });
    ws.on('close', function handleClose(code, reason) { // this actually catches the case when the server encounters WS_ERR_UNSUPPORTED_MESSAGE_LENGTH
      console.log(`WebSocket connection closed with code: ${code}`);
      reject( code );
    });
    
  });
}

// send websocket message to server, with audio buffer
export function getAudioClassPredictionsFromWebsocket( 
  audioBufferChannelData,
  geneEvaluationWebsocketServerHost
) {

  // TODO: error handling

  return new Promise((resolve, reject) => {
    const ws = getClient( geneEvaluationWebsocketServerHost );
    ws.on('open', () => {
      ws.send( audioBufferChannelData );
    });
    ws.on('message', (message) => {
      const predictions = JSON.parse( message );
      resolve( predictions );
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
  evaluationFeatureHost
) {
  const ws = getClient( evaluationFeatureHost );
  ws.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send( audioBufferChannelData );
    });
    ws.on('message', (message) => {
      const features = JSON.parse( message );
      resolve( features );
    });
    ws.on('error', (error) => {
      delete clients[evaluationFeatureHost];
      reject( error );
    });
  });
}

// send websocket message to server, with audio buffer an receive quality
export function getQualityFromWebsocket( 
  audioBufferChannelData,
  evaluationQualityHost
) {
  const ws = getClient( evaluationQualityHost );
  ws.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send( audioBufferChannelData );
    });
    ws.on('message', (message) => {
      const quality = JSON.parse( message );
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
  evoRunDirPath,
  shouldFit
) {
  const ws = getClient( evaluationDiversityHost );
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      const diversityMessage = {
        "feature_vectors": featureVectors,
        "fitness_values": fitnessValues,
        "evorun_dir": evoRunDirPath,
        "should_fit": shouldFit
      };
      ws.send( JSON.stringify( diversityMessage ) );
    });
    ws.on('message', (message) => {
      const diversity = JSON.parse( message );
      resolve( diversity );
    });
    ws.on('error', (error) => {
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
