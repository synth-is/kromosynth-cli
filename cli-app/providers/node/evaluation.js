import { 
  renderAndEvaluateGenomesViaWebsockets,
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet,
  getFeaturesFromWebsocket, getDiversityFromWebsocket, 
  getQualityFromWebsocket, getQualityFromWebsocketForEmbedding, addToQualityQueryEmbeddigs,
  getAudioClassPredictionsFromWebsocket,
  isServerAvailable
} from '../../service/websocket/ws-gene-evaluation.js';
import {
  callGeneEvaluationService,
  clearServiceConnectionList
} from '../../service/gRPC/gene_client.js';
export class NodeEvaluationProvider {
  async renderAndEvaluateGenomesViaWebsockets(...args) {
    return renderAndEvaluateGenomesViaWebsockets(...args);
  }
  getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(...args) {
    return getAudioBufferChannelDataForGenomeAndMetaFromWebsocet(...args);
  }
  getFeaturesFromWebsocket(...args) {
    return getFeaturesFromWebsocket(...args);
  }
  getDiversityFromWebsocket(...args) {
    return getDiversityFromWebsocket(...args);
  }
  getQualityFromWebsocket(...args) {
    return getQualityFromWebsocket(...args);
  }
  getQualityFromWebsocketForEmbedding(...args) {
    return getQualityFromWebsocketForEmbedding(...args);
  }
  addToQualityQueryEmbeddigs(...args) {
    return addToQualityQueryEmbeddigs(...args);
  }
  getAudioClassPredictionsFromWebsocket(...args) {
    return getAudioClassPredictionsFromWebsocket(...args);
  }
  isServerAvailable(...args) {
    return isServerAvailable(...args);
  }

  callGeneEvaluationService(...args) {
    return callGeneEvaluationService(...args);
  }
  clearServiceConnectionList(...args) {
    return clearServiceConnectionList(...args);
  }
}