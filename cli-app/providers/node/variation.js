import {
  callRandomGeneService,
  callGeneVariationService,
} from '../../service/websocket/ws-genome-variation.js';
export class NodeVariationProvider {
  callRandomGeneService(...args) {
    return callRandomGeneService(...args);
  }
  callGeneVariationService(...args) {
    return callGeneVariationService(...args);
  }
}