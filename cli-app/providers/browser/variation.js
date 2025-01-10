// TODO - example:

export class BrowserVariationProvider {
  constructor() {
    this.worker = new Worker('variation-worker.js');
  }

  async createVariation(genome, config) {
    return new Promise((resolve) => {
      this.worker.postMessage({genome, config});
      this.worker.onmessage = (e) => resolve(e.data);
    });
  }
}