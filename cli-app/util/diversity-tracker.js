import { promises as fs } from 'fs';
import path from 'path';
import WebSocket from "ws";

export default class DiversityTracker {
  constructor(websocketUrl, dataDir) {
    this.websocket = new WebSocket(websocketUrl);
    this.websocket.onmessage = this.handleMessage.bind(this);
    this.metrics = {};
    this.comparisons = {};
    this.clusterAnalysis = {};
    this.performanceSpread = {};
    this.dataDir = dataDir;
    this.metricsFile = path.join(dataDir, 'diversity_metrics.json');
    this.comparisonsFile = path.join(dataDir, 'diversity_comparisons.json');
    this.clusterAnalysisFile = path.join(dataDir, 'cluster_analysis.json');
    this.performanceSpreadFile = path.join(dataDir, 'performance_spread.json');
  }

  async sendMetricsRequest(generation, featureVectors, genotypes, stage) {
    const data = {
      generation: generation,
      feature_vectors: featureVectors,
      genotypes: genotypes,
      stage: stage
    };
    await this.sendMessage('/diversity_metrics', data);
  }

  async sendClusterAnalysisRequest(generation, featureVectors, stage) {
    const data = {
      generation: generation,
      feature_vectors: featureVectors,
      stage: stage
    };
    await this.sendMessage('/cluster_analysis', data);
  }

  async sendPerformanceSpreadRequest(generation, featureVectors, fitnessValues, stage) {
    const data = {
      generation: generation,
      feature_vectors: featureVectors,
      fitness_values: fitnessValues,
      stage: stage
    };
    await this.sendMessage('/performance_spread', data);
  }

  async storeMetrics(generation, metrics, stage) {
    if (!this.metrics[generation]) {
      this.metrics[generation] = {};
    }
    this.metrics[generation][stage] = metrics;

    if (this.metrics[generation]['before'] && this.metrics[generation]['after'] &&
        this.clusterAnalysis[generation] && this.clusterAnalysis[generation]['before'] && this.clusterAnalysis[generation]['after'] &&
        this.performanceSpread[generation] && this.performanceSpread[generation]['before'] && this.performanceSpread[generation]['after']) {
      await this.compareMetrics(generation);
    }

    await this.persistMetrics();
  }

  async storeClusterAnalysis(generation, analysis, stage) {
    if (!this.clusterAnalysis[generation]) {
      this.clusterAnalysis[generation] = {};
    }
    this.clusterAnalysis[generation][stage] = analysis;
    await this.persistClusterAnalysis();
  }

  async storePerformanceSpread(generation, spread, stage) {
    if (!this.performanceSpread[generation]) {
      this.performanceSpread[generation] = {};
    }
    this.performanceSpread[generation][stage] = spread;
    await this.persistPerformanceSpread();
  }

  async compareMetrics(generation) {
    const before = this.metrics[generation]['before'];
    const after = this.metrics[generation]['after'];
    const clusterBefore = this.clusterAnalysis[generation]['before'];
    const clusterAfter = this.clusterAnalysis[generation]['after'];
    const spreadBefore = this.performanceSpread[generation]['before'];
    const spreadAfter = this.performanceSpread[generation]['after'];
    
    this.comparisons[generation] = {
      behavioral_diversity: {
        mean_change: (after.behavioral_diversity.mean - before.behavioral_diversity.mean) / before.behavioral_diversity.mean,
        std_change: (after.behavioral_diversity.std - before.behavioral_diversity.std) / before.behavioral_diversity.std
      },
      genotypic_diversity: {
        mean_change: (after.genotypic_diversity.mean - before.genotypic_diversity.mean) / before.genotypic_diversity.mean,
        std_change: (after.genotypic_diversity.std - before.genotypic_diversity.std) / before.genotypic_diversity.std
      },
      novelty_scores: {
        mean_change: (Math.mean(after.novelty_scores) - Math.mean(before.novelty_scores)) / Math.mean(before.novelty_scores)
      },
      cluster_analysis: {
        cluster_count_change: clusterAfter.n_clusters - clusterBefore.n_clusters,
        size_distribution_change: this.compareDistributions(clusterBefore.cluster_sizes, clusterAfter.cluster_sizes)
      },
      performance_spread: {
        mean_change: (spreadAfter.mean - spreadBefore.mean) / spreadBefore.mean,
        std_change: (spreadAfter.std - spreadBefore.std) / spreadBefore.std,
        min_change: (spreadAfter.min - spreadBefore.min) / spreadBefore.min,
        max_change: (spreadAfter.max - spreadBefore.max) / spreadBefore.max
      }
    };

    await this.persistComparisons();
  }

  compareDistributions(before, after) {
    // Normalize the distributions
    const normalizedBefore = this.normalizeDistribution(before);
    const normalizedAfter = this.normalizeDistribution(after);

    // Calculate the mixture distribution
    const mixture = normalizedBefore.map((value, index) => (value + normalizedAfter[index]) / 2);

    // Calculate the Jensen-Shannon divergence
    const klDivBefore = this.kullbackLeiblerDivergence(normalizedBefore, mixture);
    const klDivAfter = this.kullbackLeiblerDivergence(normalizedAfter, mixture);

    return (klDivBefore + klDivAfter) / 2;
  }

  normalizeDistribution(distribution) {
    const sum = distribution.reduce((acc, val) => acc + val, 0);
    return distribution.map(val => val / sum);
  }

  kullbackLeiblerDivergence(p, q) {
    return p.reduce((sum, pVal, i) => {
      const qVal = q[i];
      return sum + (pVal === 0 ? 0 : pVal * Math.log(pVal / qVal));
    }, 0);
  }


  getComparison(generation) {
    return this.comparisons[generation];
}

  getAllComparisons() {
      return this.comparisons;
  }

  async requestVisualization() {
      const metricsHistory = this.prepareMetricsHistory();
      await this.sendMessage('/visualize_metrics', { metrics_history: metricsHistory });
  }

  prepareMetricsHistory() {
      const history = {};
      for (const [generation, stages] of Object.entries(this.metrics)) {
          for (const [stage, metrics] of Object.entries(stages)) {
              for (const [metricName, value] of Object.entries(metrics)) {
                  if (!history[metricName]) history[metricName] = [];
                  history[metricName].push({ generation: parseInt(generation), stage, value });
              }
          }
      }
      return history;
  }

  async sendMessage(endpoint, data) {
      if (this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({...data, path: endpoint}));
      } else {
          console.error('WebSocket is not open. ReadyState:', this.websocket.readyState);
      }
  }

  handleMessage(event) {
    const response = JSON.parse(event.data);
    if (response.status === 'OK') {
      if (response.diversity_metrics) {
        console.log('Received diversity metrics:', response.diversity_metrics);
        this.storeMetrics(response.generation, response.diversity_metrics, response.stage);
      } else if (response.cluster_analysis) {
        console.log('Received cluster analysis:', response.cluster_analysis);
        this.storeClusterAnalysis(response.generation, response.cluster_analysis, response.stage);
      } else if (response.performance_spread) {
        console.log('Received performance spread:', response.performance_spread);
        this.storePerformanceSpread(response.generation, response.performance_spread, response.stage);
      } else if (response.message) {
        console.log('Visualization message:', response.message);
      }
    } else {
      console.error('Error:', response.error);
    }
  }

  async persistMetrics() {
      try {
          await fs.mkdir(this.dataDir, { recursive: true });
          await fs.writeFile(this.metricsFile, JSON.stringify(this.metrics, null, 2));
      } catch (error) {
          console.error('Error persisting metrics:', error);
      }
  }

  async persistComparisons() {
      try {
          await fs.mkdir(this.dataDir, { recursive: true });
          await fs.writeFile(this.comparisonsFile, JSON.stringify(this.comparisons, null, 2));
      } catch (error) {
          console.error('Error persisting comparisons:', error);
      }
  }

  async loadPersistedData() {
      try {
          const metricsData = await fs.readFile(this.metricsFile, 'utf8');
          this.metrics = JSON.parse(metricsData);
      } catch (error) {
          if (error.code !== 'ENOENT') {
              console.error('Error loading metrics:', error);
          }
      }

      try {
          const comparisonsData = await fs.readFile(this.comparisonsFile, 'utf8');
          this.comparisons = JSON.parse(comparisonsData);
      } catch (error) {
          if (error.code !== 'ENOENT') {
              console.error('Error loading comparisons:', error);
          }
      }
  }
}


// Usage example
/*

// Initialize the DiversityTracker
const tracker = new DiversityTracker('ws://localhost:8765', './diversity_data');

(async () => {
  await tracker.loadPersistedData(); // Load any persisted data

  // Simulate an evolutionary algorithm run
  for (let generation = 0; generation < 10; generation++) {
    console.log(`Processing generation ${generation}`);

    // Simulate feature vectors, genotypes, and fitness values before remapping
    const featureVectorsBefore = Array.from({ length: 100 }, () => Array.from({ length: 10 }, () => Math.random()));
    const genotypesBefore = Array.from({ length: 100 }, () => Array.from({ length: 20 }, () => Math.random()));
    const fitnessValuesBefore = Array.from({ length: 100 }, () => Math.random());

    // Before remapping
    await tracker.sendMetricsRequest(generation, featureVectorsBefore, genotypesBefore, 'before');
    await tracker.sendClusterAnalysisRequest(generation, featureVectorsBefore, 'before');
    await tracker.sendPerformanceSpreadRequest(generation, featureVectorsBefore, fitnessValuesBefore, 'before');

    // Simulate remapping or other operations that might change the population
    // For this example, we'll just create new random data to simulate changes
    const featureVectorsAfter = Array.from({ length: 100 }, () => Array.from({ length: 10 }, () => Math.random()));
    const genotypesAfter = Array.from({ length: 100 }, () => Array.from({ length: 20 }, () => Math.random()));
    const fitnessValuesAfter = Array.from({ length: 100 }, () => Math.random());

    // After remapping
    await tracker.sendMetricsRequest(generation, featureVectorsAfter, genotypesAfter, 'after');
    await tracker.sendClusterAnalysisRequest(generation, featureVectorsAfter, 'after');
    await tracker.sendPerformanceSpreadRequest(generation, featureVectorsAfter, fitnessValuesAfter, 'after');

    // Get comparison for this generation
    const comparison = tracker.getComparison(generation);
    console.log(`Comparison for generation ${generation}:`, comparison);
  }

  // Get all comparisons
  const allComparisons = tracker.getAllComparisons();
  console.log('All comparisons:', allComparisons);

  // Request visualization of all metrics
  await tracker.requestVisualization();

  console.log('Diversity tracking completed.');
})();

*/