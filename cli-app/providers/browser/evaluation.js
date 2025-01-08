// TODO - example:

export class BrowserEvaluationProvider {
  constructor() {
    this.worker = new Worker('evaluation-worker.js');
  }

  async evaluateGenome(genomeString, config) {
    // Web Worker implementation
    return new Promise((resolve) => {
      this.worker.postMessage({genome: genomeString, config});
      this.worker.onmessage = (e) => resolve(e.data);
    });
  }
}