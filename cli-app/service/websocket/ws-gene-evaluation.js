import { reverse } from "lodash-es";
import WebSocket from "ws";

export async function renderAndEvaluateGenomesViaWebsockets(
  genome,
  classScoringDurations,
  classScoringNoteDeltas,
  classScoringVelocities,
  geneRenderingWebsocketServerHost,
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
              geneRenderingWebsocketServerHost
            );
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
export async function getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(
  genome,
  duration,
  noteDelta,
  velocity,
  geneRenderingWebsocketServerHost
) {

  // TODO: error handling

  console.log("getAudioBufferForGenomeAndMetaFromWebsocet");

  return new Promise((resolve, reject) => {
    const payload = {
      genomeString: genome,
      duration,
      noteDelta,
      velocity
    };
    const ws = getClient( geneRenderingWebsocketServerHost );
    ws.on('open', () => {
      ws.send( JSON.stringify( payload ) );
    });
    ws.on('message', (message) => {

      const buffer = new Uint8Array( message );
      const channelData = new Float32Array( buffer.buffer );

      resolve( channelData );
    });
    ws.on('error', (error) => {
      delete clients[geneRenderingWebsocketServerHost];
      reject( error );
    });
  });
}

// send websocket message to server, with audio buffer
export async function getAudioClassPredictionsFromWebsocket( 
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

// create singleton websocket clients
const clients = {};
function getClient( host ) {
  // if( !clients[host] ) {
  //   clients[host] = new WebSocket( host );
  // }
  // return clients[host];

  return new WebSocket( host );
}
