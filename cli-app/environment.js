export class Environment {
  static variation = null;
  static evaluation = null;
  static persistence = null;

  static async initialize(type = 'node') {
    if (type === 'node') {
      const { NodeVariationProvider } = await import('./providers/node/variation.js');
      const { NodeEvaluationProvider } = await import('./providers/node/evaluation.js');
      const { NodePersistenceProvider } = await import('./providers/node/persistence.js');
      this.variation = new NodeVariationProvider();
      this.persistence = new NodePersistenceProvider();
      this.evaluation = new NodeEvaluationProvider();
    } else {
      const { BrowserVariationProvider } = await import('./providers/browser/variation.js');
      const { BrowserPersistenceProvider } = await import('./providers/browser/persistence.js');
      const { BrowserEvaluationProvider } = await import('./providers/browser/evaluation.js');
      this.variation = new BrowserVariationProvider();
      this.persistence = new BrowserPersistenceProvider();
      this.evaluation = new BrowserEvaluationProvider();
    }
  }
}