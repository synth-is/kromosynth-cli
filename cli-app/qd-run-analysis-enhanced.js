import fs from 'fs';
import {
  calculateCosineSimilarity, getCommitIdsFilePathFromRunConfig, getCommitCount, getEliteMapFromRunConfig
} from './qd-run-analysis.js';
import { getEvoRunDirPath } from './util/qd-common.js';
import { readCompressedOrPlainJSON } from './util/qd-common-elite-map-persistence.js';

/**
 * Memory-efficient implementation of enhanced diversity metrics
 * Designed to handle tens of thousands of feature vectors
 */

// Main function with sampling and streaming calculation
export async function getEnhancedDiversityMetrics(evoRunConfig, evoRunId, useDirectFeatureReading = false, options = {}) {
  console.log('Starting enhanced diversity metrics calculation...');
  const startTime = process.hrtime();
  
  // Default options
  const defaultOptions = {
    maxVectors: 5000,               // Maximum number of vectors to process (sampling)
    distanceSamplingRatio: 0.1,     // For pairwise calculations, sample this ratio of all possible pairs
    skipExpensiveMetrics: false,    // Skip metrics that require O(n²) calculations
    memoryEfficientMode: true       // Use algorithms optimized for memory efficiency
  };
  
  // Merge with user options
  const opts = { ...defaultOptions, ...options };
  
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const cellFeaturesPath = `${evoRunDirPath}cellFeatures`;
  let featureExtractionType;
  let featureVectors = [];
  
  if (useDirectFeatureReading) {
    console.log('Reading features directly from cellFeatures directory...');
    
    if (!fs.existsSync(cellFeaturesPath)) {
      throw new Error(`cellFeatures directory not found at ${cellFeaturesPath}`);
    }

    const featureFiles = fs.readdirSync(cellFeaturesPath)
      .filter(filename => filename.startsWith('features_'));

    console.log(`Found ${featureFiles.length} feature files`);

    for (let i = 0; i < featureFiles.length; i++) {
      try {
        const filename = featureFiles[i];
        const filePath = `${cellFeaturesPath}/${filename}`;
        
        // Handle both .json.gz and .json files
        let features;
        if (filename.endsWith('.json.gz')) {
          features = readCompressedOrPlainJSON(filePath, null);
        } else {
          const content = fs.readFileSync(filePath, 'utf8');
          features = JSON.parse(content);
        }

        // Get feature extraction type from first valid file if not yet set
        if (!featureExtractionType && Object.keys(features).length > 0) {
          featureExtractionType = Object.keys(features)[0];
        }

        if (features[featureExtractionType]?.features) {
          featureVectors.push(features[featureExtractionType].features);
        }
      } catch (error) {
        console.warn(`Warning: Could not read features from file ${i + 1}:`, error.message);
      }

      // Print progress every 100 files
      if ((i + 1) % 100 === 0) {
        console.log(`Processed ${i + 1} out of ${featureFiles.length} feature files...`);
      }
    }

  } else {
    console.log('Collecting genome IDs from elite maps...');
    
    const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
    const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
    const discoveredGenomeIds = new Set();

    // First pass: collect all unique genome IDs
    for (let iterationIndex = 0; iterationIndex < commitCount; iterationIndex++) {
      console.log(`Collecting genome IDs from iteration ${iterationIndex}...`);
      
      const eliteMap = await getEliteMapFromRunConfig(evoRunConfig, evoRunId, iterationIndex);
      
      if (!eliteMap.classConfigurations?.length || 
          !eliteMap.classConfigurations[0].featureExtractionType) {
        throw new Error("No classConfigurations found in eliteMap");
      }

      featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType;
      
      for (const oneCellKey of Object.keys(eliteMap.cells)) {
        if (eliteMap.cells[oneCellKey].elts.length) {
          discoveredGenomeIds.add(eliteMap.cells[oneCellKey].elts[0].g);
        }
      }
    }

    console.log(`Total unique elite genomes discovered: ${discoveredGenomeIds.size}`);

    // Second pass: collect features
    let processedCount = 0;
    for (const oneGenomeId of discoveredGenomeIds) {
      const gzipPath = `${cellFeaturesPath}/features_${evoRunId}_${oneGenomeId}.json.gz`;
      const plainPath = `${cellFeaturesPath}/features_${evoRunId}_${oneGenomeId}.json`;
      
      try {
        // Use the utility function to read either gzipped or plain JSON
        const features = readCompressedOrPlainJSON(gzipPath, plainPath);
        
        if (features && features[featureExtractionType]?.features) {
          featureVectors.push(features[featureExtractionType].features);
        }
      } catch (error) {
        console.warn(`Warning: Could not read features for genome ${oneGenomeId}:`, error.message);
      }

      processedCount++;
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount} out of ${discoveredGenomeIds.size} genomes...`);
      }
    }
  }
  
  console.log(`Collected ${featureVectors.length} feature vectors`);
  
  if (featureVectors.length === 0) {
    throw new Error("No valid feature vectors found");
  }
  
  // Sample vectors if there are too many
  if (featureVectors.length > opts.maxVectors) {
    console.log(`Sampling ${opts.maxVectors} vectors from ${featureVectors.length} total vectors...`);
    featureVectors = sampleFeatureVectors(featureVectors, opts.maxVectors);
  }
  
  // Performance tracking helper
  const timeFunction = (fn, label) => {
    const startFn = process.hrtime();
    const result = fn();
    const diffFn = process.hrtime(startFn);
    const timeMs = (diffFn[0] * 1e9 + diffFn[1]) / 1e6;
    console.log(`${label} completed in ${timeMs.toFixed(2)}ms`);
    return { result, timeMs };
  };
  
  const performanceStats = {};
  const results = {};
  
  // Calculate average pairwise distance using streaming approach
  console.log('Calculating average pairwise distance (streaming)...');
  const { result: avgDistance, timeMs: avgDistanceTime } = timeFunction(() => 
    calculateAveragePairwiseDistanceStreaming(featureVectors, opts.distanceSamplingRatio), 
    "Average pairwise distance calculation"
  );
  results.averagePairwiseDistance = avgDistance;
  performanceStats.averagePairwiseDistanceTime = avgDistanceTime;
  
  // Calculate approximate distance distribution using sampling
  console.log('Calculating distance distribution statistics (sampled)...');
  const { result: distanceStats, timeMs: distanceStatsTime } = timeFunction(() => 
    calculateSampledDistanceStats(featureVectors, opts.distanceSamplingRatio), 
    "Distance statistics calculation"
  );
  results.distanceStats = distanceStats;
  performanceStats.distanceStatsTime = distanceStatsTime;
  
  // Only perform expensive metrics if not skipped
  if (!opts.skipExpensiveMetrics) {
    // K-means with limited iterations and sample size
    console.log('Performing k-means clustering analysis (optimized)...');
    const { result: clusterMetrics, timeMs: clusterTime } = timeFunction(() => ({
      k3: calculateOptimizedClusterQuality(featureVectors, 3, opts.memoryEfficientMode),
      k5: calculateOptimizedClusterQuality(featureVectors, 5, opts.memoryEfficientMode),
      k7: calculateOptimizedClusterQuality(featureVectors, 7, opts.memoryEfficientMode)
    }), "K-means clustering");
    results.clusterMetrics = clusterMetrics;
    performanceStats.clusterTime = clusterTime;
  }
  
  // Feature space coverage using grid-based approach
  console.log('Calculating feature space coverage...');
  const { result: featureSpaceCoverage, timeMs: coverageTime } = timeFunction(() => 
    calculateFeatureSpaceCoverage(featureVectors), 
    "Feature space coverage analysis"
  );
  results.featureSpaceCoverage = featureSpaceCoverage;
  performanceStats.coverageTime = coverageTime;
  
  // Analyze feature contributions (fast)
  console.log('Analyzing feature contributions to diversity...');
  const { result: featureContributions, timeMs: contributionsTime } = timeFunction(() => 
    analyzeFeatureContributions(featureVectors), 
    "Feature contribution analysis"
  );
  results.featureContributions = featureContributions;
  performanceStats.contributionsTime = contributionsTime;
  
  // Dimensionality reduction using a more efficient algorithm
  console.log('Performing dimensionality reduction for visualization...');
  const { result: visualizationData, timeMs: visualizationTime } = timeFunction(() => 
    createMemoryEfficientDimensionalityReducedView(featureVectors), 
    "Dimensionality reduction"
  );
  results.visualizationData = visualizationData;
  performanceStats.visualizationTime = visualizationTime;
  
  // Calculate approximate nearest neighbor stats
  console.log('Analyzing approximate nearest neighbor statistics...');
  const { result: nearestNeighborStats, timeMs: nnTime } = timeFunction(() => 
    calculateApproximateNearestNeighborStats(featureVectors), 
    "Nearest neighbor analysis"
  );
  results.nearestNeighborStats = nearestNeighborStats;
  performanceStats.nnTime = nnTime;
  
  // Calculate diversity entropy using grid sampling
  console.log('Calculating diversity entropy...');
  const { result: entropyScore, timeMs: entropyTime } = timeFunction(() => 
    calculateGridBasedDiversityEntropy(featureVectors), 
    "Diversity entropy calculation"
  );
  results.entropyScore = entropyScore;
  performanceStats.entropyTime = entropyTime;

  // Calculate Gini coefficient
  console.log('Calculating Gini coefficient...');
  const { result: giniCoefficient, timeMs: giniTime } = timeFunction(() =>
    calculateMemoryEfficientGiniCoefficient(featureVectors, opts.distanceSamplingRatio),
    "Gini coefficient calculation"
  );
  results.giniCoefficient = giniCoefficient;
  performanceStats.giniTime = giniTime;
  
  // Calculate overall timing
  const diff = process.hrtime(startTime);
  const totalTimeMs = (diff[0] * 1e9 + diff[1]) / 1e6;
  console.log(`Total execution time: ${totalTimeMs.toFixed(2)}ms`);
  
  // Additional metadata
  results.totalFeaturesProcessed = featureVectors.length;
  results.originalFeatureCount = featureVectors.length;
  results.featureExtractionType = featureExtractionType;
  results.method = useDirectFeatureReading ? 'direct_feature_reading' : 'elite_map_traversal';
  results.options = opts;
  
  // Include performance stats
  results.performanceStats = {
    ...performanceStats,
    totalTimeMs: parseFloat(totalTimeMs.toFixed(2))
  };
  
  // Save results
  const resultsStringified = JSON.stringify(results);
  const resultsFilePath = `${evoRunDirPath}enhanced-diversity-metrics.json`;
  fs.writeFileSync(resultsFilePath, resultsStringified);
  
  return results;
}

/**
 * Randomly sample a subset of feature vectors
 */
function sampleFeatureVectors(featureVectors, maxVectors) {
  if (featureVectors.length <= maxVectors) {
    return featureVectors;
  }
  
  const sampledVectors = [];
  const indices = new Set();
  
  // Select random indices without replacement
  while (indices.size < maxVectors) {
    indices.add(Math.floor(Math.random() * featureVectors.length));
  }
  
  // Build sampled vector array
  for (const index of indices) {
    sampledVectors.push(featureVectors[index]);
  }
  
  return sampledVectors;
}

/**
 * Calculate average pairwise distance using a streaming approach with sampling
 * to avoid storing all pairs in memory
 */
function calculateAveragePairwiseDistanceStreaming(featureVectors, samplingRatio = 1.0) {
  const n = featureVectors.length;
  const totalPairs = (n * (n - 1)) / 2;
  
  // Determine how many pairs to sample
  let pairsToSample = Math.floor(totalPairs * samplingRatio);
  if (pairsToSample <= 0) pairsToSample = 1;
  if (pairsToSample > totalPairs) pairsToSample = totalPairs;
  
  // If sampling all pairs, use full calculation
  if (pairsToSample === totalPairs && n < 10000) {
    return calculateFullAveragePairwiseDistance(featureVectors);
  }
  
  // Use sampling approach for large datasets
  console.log(`Sampling ${pairsToSample} pairs out of ${totalPairs} possible pairs (${(samplingRatio * 100).toFixed(2)}%)`);
  
  let sumDistances = 0;
  let countSampled = 0;
  
  // Randomly sample pairs
  while (countSampled < pairsToSample) {
    // Generate random pair indices
    const i = Math.floor(Math.random() * n);
    let j = Math.floor(Math.random() * n);
    // Ensure i != j
    while (j === i) {
      j = Math.floor(Math.random() * n);
    }
    
    // Calculate distance for this pair
    const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
    const distance = 1 - similarity;
    
    sumDistances += distance;
    countSampled++;
    
    // Log progress for large samples
    if (pairsToSample > 10000 && countSampled % 1000000 === 0) {
      console.log(`Processed ${countSampled} / ${pairsToSample} pairs...`);
    }
  }
  
  return sumDistances / countSampled;
}

/**
 * Calculate full average pairwise distance (for smaller datasets)
 */
function calculateFullAveragePairwiseDistance(featureVectors) {
  const n = featureVectors.length;
  let sumDistances = 0;
  let pairCount = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
      const distance = 1 - similarity;
      sumDistances += distance;
      pairCount++;
    }
    
    // Log progress
    if (n > 1000 && i % 100 === 0) {
      console.log(`Processing vector ${i} / ${n}...`);
    }
  }
  
  return sumDistances / pairCount;
}

/**
 * Calculate distance statistics using sampling
 */
function calculateSampledDistanceStats(featureVectors, samplingRatio = 0.1) {
  const n = featureVectors.length;
  const totalPairs = (n * (n - 1)) / 2;
  
  // Determine how many pairs to sample
  let pairsToSample = Math.min(100000, Math.floor(totalPairs * samplingRatio));
  if (pairsToSample <= 0) pairsToSample = 1;
  if (pairsToSample > totalPairs) pairsToSample = totalPairs;
  
  console.log(`Sampling ${pairsToSample} pairs for distance statistics...`);
  
  // Use a fixed-size array for distances to avoid memory issues
  const distances = new Array(pairsToSample);
  let pairIdx = 0;
  
  // Use reservoir sampling to maintain a representative sample
  let processed = 0;
  
  // For smaller datasets, process all pairs
  if (totalPairs <= pairsToSample) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
        const distance = 1 - similarity;
        distances[pairIdx++] = distance;
        
        if (pairIdx >= pairsToSample) break;
      }
      if (pairIdx >= pairsToSample) break;
    }
  } else {
    // Use reservoir sampling for larger datasets
    let samplesCollected = 0;
    
    // Initial fill
    outerLoop: for (let i = 0; i < n && samplesCollected < pairsToSample; i++) {
      for (let j = i + 1; j < n && samplesCollected < pairsToSample; j++) {
        const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
        const distance = 1 - similarity;
        distances[samplesCollected++] = distance;
        processed++;
        
        if (samplesCollected >= pairsToSample) break outerLoop;
      }
    }
    
    // Continue with reservoir sampling
    for (let i = 0; i < n && processed < totalPairs; i++) {
      const startJ = (i === 0) ? samplesCollected : i + 1;
      for (let j = startJ; j < n && processed < totalPairs; j++) {
        processed++;
        
        // Reservoir sampling: replace with decreasing probability
        const r = Math.floor(Math.random() * processed);
        if (r < pairsToSample) {
          const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
          const distance = 1 - similarity;
          distances[r] = distance;
        }
        
        // Log progress for very large datasets
        if (processed % 1000000 === 0) {
          console.log(`Processed ${processed} / ${totalPairs} pairs for distance statistics...`);
        }
      }
    }
  }
  
  // Calculate statistics on the sampled distances
  distances.sort((a, b) => a - b);
  
  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  
  // Calculate variance
  let variance = 0;
  for (const distance of distances) {
    variance += Math.pow(distance - mean, 2);
  }
  variance /= distances.length;
  
  // Calculate quartiles
  const median = distances[Math.floor(distances.length / 2)];
  const q1 = distances[Math.floor(distances.length / 4)];
  const q3 = distances[Math.floor(3 * distances.length / 4)];
  
  return {
    mean,
    median,
    variance,
    stdDev: Math.sqrt(variance),
    min: distances[0],
    max: distances[distances.length - 1],
    q1,
    q3,
    iqr: q3 - q1,
    samplesUsed: distances.length,
    totalPairs
  };
}

/**
 * Calculate approximate nearest neighbor statistics using a more efficient algorithm
 */
function calculateApproximateNearestNeighborStats(featureVectors, sampleSize = 1000) {
  const n = featureVectors.length;
  
  // If we have fewer vectors than the sample size, use all vectors
  const actualSampleSize = Math.min(n, sampleSize);
  
  // Randomly select vectors to find nearest neighbors for
  const sampleIndices = new Set();
  while (sampleIndices.size < actualSampleSize) {
    sampleIndices.add(Math.floor(Math.random() * n));
  }
  
  const nearestDistances = [];
  
  for (const i of sampleIndices) {
    let minDistance = Infinity;
    
    // For each sample point, check against all other points
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
        const distance = 1 - similarity;
        minDistance = Math.min(minDistance, distance);
      }
    }
    
    nearestDistances.push(minDistance);
  }
  
  // Calculate statistics on nearest neighbor distances
  const sum = nearestDistances.reduce((a, b) => a + b, 0);
  const mean = sum / nearestDistances.length;
  
  let variance = 0;
  for (const distance of nearestDistances) {
    variance += Math.pow(distance - mean, 2);
  }
  variance /= nearestDistances.length;
  
  return {
    averageNearestNeighborDistance: mean,
    varianceOfNearestNeighborDistances: variance,
    stdDevOfNearestNeighborDistances: Math.sqrt(variance),
    minNearestNeighborDistance: Math.min(...nearestDistances),
    maxNearestNeighborDistance: Math.max(...nearestDistances),
    sampleSize: actualSampleSize
  };
}

/**
 * Calculate diversity entropy using a grid-based approach
 */
function calculateGridBasedDiversityEntropy(featureVectors) {
  // Use dimensionality reduction to reduce computational complexity
  const reducedVectors = createMemoryEfficientDimensionalityReducedView(featureVectors);
  
  // Discretize the feature space into bins
  const binCount = Math.min(20, Math.ceil(Math.sqrt(featureVectors.length / 5)));
  const dimensions = reducedVectors[0].length;
  
  // Initialize bins using a sparse representation
  const bins = {};
  
  // Find min and max for each dimension
  const mins = new Array(dimensions).fill(Infinity);
  const maxes = new Array(dimensions).fill(-Infinity);
  
  for (const vector of reducedVectors) {
    for (let d = 0; d < dimensions; d++) {
      mins[d] = Math.min(mins[d], vector[d]);
      maxes[d] = Math.max(maxes[d], vector[d]);
    }
  }
  
  // Assign vectors to bins
  for (const vector of reducedVectors) {
    const binCoords = [];
    
    for (let d = 0; d < dimensions; d++) {
      const range = maxes[d] - mins[d];
      if (range === 0) {
        binCoords.push(0);
        continue;
      }
      
      const normalizedValue = (vector[d] - mins[d]) / range;
      const binIndex = Math.min(Math.floor(normalizedValue * binCount), binCount - 1);
      binCoords.push(binIndex);
    }
    
    const binKey = binCoords.join(',');
    bins[binKey] = (bins[binKey] || 0) + 1;
  }
  
  // Calculate Shannon entropy
  let entropy = 0;
  const totalVectors = reducedVectors.length;
  
  for (const bin in bins) {
    const probability = bins[bin] / totalVectors;
    entropy -= probability * Math.log2(probability);
  }
  
  // Calculate the maximum possible entropy (uniform distribution)
  const maxEntropy = Math.log2(Object.keys(bins).length || 1);
  
  return {
    entropy,
    normalizedEntropy: maxEntropy > 0 ? entropy / maxEntropy : 1,
    occupiedBins: Object.keys(bins).length,
    totalBins: Math.pow(binCount, dimensions),
    binSize: binCount
  };
}

/**
 * Memory-efficient dimensionality reduction
 */
function createMemoryEfficientDimensionalityReducedView(featureVectors, targetDimensions = 2) {
  // For very large datasets, sample a subset for projection
  const maxSampleSize = 5000;
  let vectorsToProject = featureVectors;
  
  if (featureVectors.length > maxSampleSize) {
    console.log(`Sampling ${maxSampleSize} vectors for dimensionality reduction...`);
    vectorsToProject = sampleFeatureVectors(featureVectors, maxSampleSize);
  }
  
  // Simple PCA-like approach, just project onto first targetDimensions
  const dimensions = vectorsToProject[0].length;
  
  // For efficiency with large datasets, just use first 2 dimensions
  // For a real implementation, use a proper PCA or t-SNE library
  return vectorsToProject.map(vector => {
    return vector.slice(0, targetDimensions);
  });
}

/**
 * Optimized k-means implementation with limited iterations and checks
 */
function calculateOptimizedClusterQuality(featureVectors, k, memoryEfficientMode = true) {
  // For very large datasets, sample a subset
  let vectorsToCluster = featureVectors;
  const maxSampleSize = 5000;
  
  if (memoryEfficientMode && featureVectors.length > maxSampleSize) {
    console.log(`Sampling ${maxSampleSize} vectors for k-means clustering...`);
    vectorsToCluster = sampleFeatureVectors(featureVectors, maxSampleSize);
  }
  
  // Run memory-efficient k-means
  const { clusters, centroids } = kMeansClusteringOptimized(vectorsToCluster, k);
  
  // Calculate intra-cluster distances (distances within each cluster)
  const intraClusterDistances = clusters.map(clusterIndices => {
    if (clusterIndices.length <= 1) return 0;
    
    // Sample pairs for large clusters
    const maxPairs = 1000;
    let sumDistances = 0;
    let pairCount = 0;
    
    if (clusterIndices.length <= 50) {
      // For small clusters, calculate all pairs
      for (let i = 0; i < clusterIndices.length; i++) {
        for (let j = i + 1; j < clusterIndices.length; j++) {
          const similarity = calculateCosineSimilarity(
            vectorsToCluster[clusterIndices[i]], 
            vectorsToCluster[clusterIndices[j]]
          );
          sumDistances += (1 - similarity);
          pairCount++;
        }
      }
    } else {
      // For large clusters, sample pairs
      const pairsToSample = Math.min(maxPairs, (clusterIndices.length * (clusterIndices.length - 1)) / 2);
      
      for (let s = 0; s < pairsToSample; s++) {
        const i = Math.floor(Math.random() * clusterIndices.length);
        let j = Math.floor(Math.random() * clusterIndices.length);
        while (j === i) j = Math.floor(Math.random() * clusterIndices.length);
        
        const similarity = calculateCosineSimilarity(
          vectorsToCluster[clusterIndices[i]], 
          vectorsToCluster[clusterIndices[j]]
        );
        sumDistances += (1 - similarity);
        pairCount++;
      }
    }
    
    return pairCount > 0 ? sumDistances / pairCount : 0;
  });
  
  // Calculate distance to centroid for each cluster
  const centroidDistances = clusters.map((clusterIndices, clusterIndex) => {
    if (clusterIndices.length === 0) return 0;
    
    let sumDistances = 0;
    for (const i of clusterIndices) {
      const similarity = calculateCosineSimilarity(
        vectorsToCluster[i], 
        centroids[clusterIndex]
      );
      sumDistances += (1 - similarity);
    }
    
    return sumDistances / clusterIndices.length;
  });
  
  // Calculate inter-cluster distances (between centroids)
  const interClusterDistances = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (clusters[i].length > 0 && clusters[j].length > 0) {
        const similarity = calculateCosineSimilarity(centroids[i], centroids[j]);
        interClusterDistances.push(1 - similarity);
      }
    }
  }
  
  // Calculate average inter-cluster distance
  const avgInterClusterDistance = interClusterDistances.length > 0 
    ? interClusterDistances.reduce((a, b) => a + b, 0) / interClusterDistances.length 
    : 0;
  
  return {
    clusterCount: k,
    clusterSizes: clusters.map(indices => indices.length),
    averageIntraClusterDistance: intraClusterDistances.reduce((a, b) => a + b, 0) / k,
    averageCentroidDistance: centroidDistances.reduce((a, b) => a + b, 0) / k,
    averageInterClusterDistance: avgInterClusterDistance,
    intraClusterDistances,
    centroidDistances,
    clusterQuality: avgInterClusterDistance > 0 
      ? avgInterClusterDistance / (intraClusterDistances.reduce((a, b) => a + b, 0) / k) 
      : 0,
    sampledVectors: vectorsToCluster.length
  };
}

/**
 * Memory-efficient k-means implementation that stores indices rather than vectors
 */
function kMeansClusteringOptimized(featureVectors, k, maxIterations = 20) {
  const n = featureVectors.length;
  const dimensions = featureVectors[0].length;
  
  // Initialize centroids by selecting k random vectors
  const centroids = [];
  const centroidIndices = new Set();
  
  while (centroidIndices.size < k) {
    centroidIndices.add(Math.floor(Math.random() * n));
  }
  
  // Initialize centroids with actual vectors
  for (const index of centroidIndices) {
    centroids.push([...featureVectors[index]]);
  }
  
  // Initialize clusters with indices rather than copying vectors
  let clusters = new Array(k).fill().map(() => []);
  let previousAssignments = new Array(n).fill(-1);
  
  // Run k-means algorithm
  for (let iter = 0; iter < maxIterations; iter++) {
    // Reset clusters
    clusters = new Array(k).fill().map(() => []);
    let changes = 0;
    
    // Assign vectors to nearest centroid
    for (let i = 0; i < n; i++) {
      let closestCentroid = 0;
      let minDistance = Infinity;
      
      for (let j = 0; j < k; j++) {
        const similarity = calculateCosineSimilarity(featureVectors[i], centroids[j]);
        const distance = 1 - similarity;
        
        if (distance < minDistance) {
          minDistance = distance;
          closestCentroid = j;
        }
      }
      
      // Add index to cluster
      clusters[closestCentroid].push(i);
      
      // Check if assignment changed
      if (previousAssignments[i] !== closestCentroid) {
        changes++;
        previousAssignments[i] = closestCentroid;
      }
    }
    
    // Log progress
    console.log(`K-means iteration ${iter + 1}: ${changes} vectors changed clusters`);
    
    // Check for convergence
    if (changes === 0) {
      break;
    }
    
    // Update centroids
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      
      const newCentroid = new Array(dimensions).fill(0);
      
      for (const vectorIndex of clusters[i]) {
        const vector = featureVectors[vectorIndex];
        for (let d = 0; d < dimensions; d++) {
          newCentroid[d] += vector[d];
        }
      }
      
      for (let d = 0; d < dimensions; d++) {
        newCentroid[d] /= clusters[i].length;
      }
      
      centroids[i] = newCentroid;
    }
  }
  
  return { clusters, centroids };
}

/**
 * Calculate feature space coverage - no changes needed as it's already efficient
 */
function calculateFeatureSpaceCoverage(featureVectors) {
  // Already using dimensionality reduction for efficiency
  const reducedVectors = createMemoryEfficientDimensionalityReducedView(featureVectors, 2);
  
  // Find min and max for each dimension
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const vector of reducedVectors) {
    minX = Math.min(minX, vector[0]);
    maxX = Math.max(maxX, vector[0]);
    minY = Math.min(minY, vector[1]);
    maxY = Math.max(maxY, vector[1]);
  }
  
  // Create a grid
  const gridSize = 20; // 20x20 grid
  const grid = new Array(gridSize).fill().map(() => new Array(gridSize).fill(0));
  
  // Populate grid
  for (const vector of reducedVectors) {
    const x = Math.floor(((vector[0] - minX) / (maxX - minX || 1)) * (gridSize - 1));
    const y = Math.floor(((vector[1] - minY) / (maxY - minY || 1)) * (gridSize - 1));
    
    // Ensure valid indices
    const safeX = Math.max(0, Math.min(gridSize - 1, x));
    const safeY = Math.max(0, Math.min(gridSize - 1, y));
    
    grid[safeX][safeY] = 1;
  }
  
  // Count occupied cells
  let occupiedCells = 0;
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (grid[i][j] > 0) occupiedCells++;
    }
  }
  
  // Calculate coverage percentage
  const totalCells = gridSize * gridSize;
  const coveragePercentage = (occupiedCells / totalCells) * 100;
  
  return {
    coveragePercentage,
    occupiedCells,
    totalCells,
    gridSize
  };
}

/**
 * Analyze feature contributions - already efficient
 */
function analyzeFeatureContributions(featureVectors) {
  const dimensions = featureVectors[0].length;
  const contributions = new Array(dimensions).fill(0);
  
  // Calculate variance along each dimension
  for (let d = 0; d < dimensions; d++) {
    let sum = 0;
    let sumSquares = 0;
    
    // Single pass variance calculation to save memory
    for (const vector of featureVectors) {
      sum += vector[d];
      sumSquares += vector[d] * vector[d];
    }
    
    const mean = sum / featureVectors.length;
    const variance = (sumSquares / featureVectors.length) - (mean * mean);
    contributions[d] = variance;
  }
  
  // Normalize contributions
  const totalContribution = contributions.reduce((a, b) => a + b, 0);
  const normalizedContributions = totalContribution > 0 
    ? contributions.map(c => c / totalContribution)
    : contributions.map(() => 1 / dimensions);
  
  return {
    dimensionContributions: normalizedContributions,
    topContributingDimensions: normalizedContributions
      .map((c, i) => ({ dimension: i, contribution: c }))
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5)
  };
}


/**
 * Memory-efficient calculation of Gini coefficient
 * Uses sampling for large datasets to avoid memory issues
 */
function calculateMemoryEfficientGiniCoefficient(featureVectors, samplingRatio = 0.1) {
  // Get sampled distances to use for Gini calculation
  console.log('Generating distance samples for Gini coefficient...');
  const n = featureVectors.length;
  const totalPairs = (n * (n - 1)) / 2;
  
  // Determine how many pairs to sample
  let pairsToSample = Math.min(100000, Math.floor(totalPairs * samplingRatio));
  if (pairsToSample <= 0) pairsToSample = 1;
  if (pairsToSample > totalPairs) pairsToSample = totalPairs;
  
  console.log(`Sampling ${pairsToSample} pairs for Gini coefficient...`);
  
  // Collect sampled distances
  const distances = new Array(pairsToSample);
  let samplesCollected = 0;
  
  // Use reservoir sampling for large datasets
  if (totalPairs <= pairsToSample) {
    // For small datasets, use all pairs
    for (let i = 0; i < n && samplesCollected < pairsToSample; i++) {
      for (let j = i + 1; j < n && samplesCollected < pairsToSample; j++) {
        const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
        const distance = 1 - similarity;
        distances[samplesCollected++] = distance;
      }
    }
  } else {
    // For large datasets, use reservoir sampling
    let processed = 0;
    
    // Initial fill
    outerLoop: for (let i = 0; i < n && samplesCollected < pairsToSample; i++) {
      for (let j = i + 1; j < n && samplesCollected < pairsToSample; j++) {
        const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
        const distance = 1 - similarity;
        distances[samplesCollected++] = distance;
        processed++;
        
        if (samplesCollected >= pairsToSample) break outerLoop;
      }
    }
    
    // Continue with reservoir sampling
    for (let i = 0; i < n && processed < totalPairs; i++) {
      const startJ = (i === 0) ? Math.ceil(samplesCollected / i) : i + 1;
      for (let j = startJ; j < n && processed < totalPairs; j++) {
        processed++;
        
        // Reservoir sampling: replace with decreasing probability
        const r = Math.floor(Math.random() * processed);
        if (r < pairsToSample) {
          const similarity = calculateCosineSimilarity(featureVectors[i], featureVectors[j]);
          const distance = 1 - similarity;
          distances[r] = distance;
        }
        
        // Log progress for very large datasets
        if (processed % 1000000 === 0) {
          console.log(`Processed ${processed} / ${totalPairs} pairs for Gini coefficient...`);
        }
        
        // Early stopping if we've processed enough pairs
        if (processed >= 10 * pairsToSample) {
          console.log(`Early stopping after ${processed} pairs for Gini coefficient...`);
          break;
        }
      }
    }
  }
  
  // Sort the distances for Gini calculation
  console.log('Calculating Gini coefficient from sampled distances...');
  distances.sort((a, b) => a - b);
  
  // Calculate Gini coefficient
  const n_samples = distances.length;
  let numerator = 0;
  const sum = distances.reduce((a, b) => a + b, 0);
  const mean = sum / n_samples;
  
  if (mean === 0) return 0; // Avoid division by zero
  
  for (let i = 0; i < n_samples; i++) {
    numerator += (2 * i - n_samples + 1) * distances[i];
  }
  
  const gini = numerator / (Math.pow(n_samples, 2) * mean);
  
  return {
    giniCoefficient: gini,
    interpretation: interpretGiniCoefficient(gini),
    samplesUsed: n_samples,
    mean: mean
  };
}

/**
 * Provide an interpretation of the Gini coefficient value
 */
function interpretGiniCoefficient(gini) {
  if (gini < 0.2) {
    return "Very equal distribution of diversity";
  } else if (gini < 0.3) {
    return "Relatively equal distribution";
  } else if (gini < 0.4) {
    return "Moderate inequality in diversity distribution";
  } else if (gini < 0.5) {
    return "Moderately high inequality";
  } else if (gini < 0.6) {
    return "High inequality in diversity distribution";
  } else {
    return "Very high inequality in diversity distribution";
  }
}


/**
 * Memory-efficient analysis of diversity changes over time
 */
export async function trackDiversityOverTime(evoRunConfig, evoRunId, stepSize = 10, options = {}) {
  console.log('Starting diversity tracking over time...');
  const startTime = process.hrtime();
  
  // Default options
  const defaultOptions = {
    maxVectorsPerIteration: 3000,     // Maximum vectors to process per iteration
    samplingRatio: 0.1,               // For pairwise calculations, sample this ratio
    skipIntermediate: false           // Skip intermediate iterations if too many
  };
  
  // Merge with user options
  const opts = { ...defaultOptions, ...options };
  
  const commitIdsFilePath = getCommitIdsFilePathFromRunConfig(evoRunConfig, evoRunId, true);
  const commitCount = getCommitCount(evoRunConfig, evoRunId, commitIdsFilePath);
  
  const diversityTimeSeries = [];
  const performanceStats = {
    iterationTimes: []
  };
  
  // If there are too many iterations, sample them
  let iterationsToProcess = [];
  for (let i = 0; i < commitCount; i += stepSize) {
    iterationsToProcess.push(i);
  }
  
  // If there are too many iterations and skipIntermediate is true, sample them
  if (opts.skipIntermediate && iterationsToProcess.length > 20) {
    console.log(`Too many iterations (${iterationsToProcess.length}), sampling important ones...`);
    
    // Always include first, last, and some evenly distributed iterations
    const sampledIterations = new Set([
      iterationsToProcess[0],                                             // First
      iterationsToProcess[iterationsToProcess.length - 1]                 // Last
    ]);
    
    // Add some evenly distributed iterations
    const step = Math.max(1, Math.floor(iterationsToProcess.length / 18));
    for (let i = step; i < iterationsToProcess.length - 1; i += step) {
      sampledIterations.add(iterationsToProcess[i]);
    }
    
    iterationsToProcess = Array.from(sampledIterations).sort((a, b) => a - b);
    console.log(`Sampled down to ${iterationsToProcess.length} iterations`);
  }
  
  // Process each selected iteration
  let featureExtractionType;
  for (const iterationIndex of iterationsToProcess) {
    console.log(`Calculating diversity for iteration ${iterationIndex}...`);
    const iterStartTime = process.hrtime();
    
    // Get elite map for this iteration
    const eliteMap = await getEliteMapFromRunConfig(evoRunConfig, evoRunId, iterationIndex);
    
    // Collect feature vectors using the same approach as in getEliteMapDiversityForAllIterations
    console.log(`Extracting feature vectors for iteration ${iterationIndex}...`);
    let featureVectors = [];
    const cellFeaturesPath = `${getEvoRunDirPath(evoRunConfig, evoRunId)}cellFeatures`;
    
    if (eliteMap.classConfigurations?.length && 
        (eliteMap.classConfigurations[0].featureExtractionType || eliteMap.classConfigurations[0].projectionFeatureType)) {
      featureExtractionType = eliteMap.classConfigurations[0].featureExtractionType || 
                              eliteMap.classConfigurations[0].projectionFeatureType;
      
      // Get genome IDs from the elite map and collect features
      for (const oneCellKey of Object.keys(eliteMap.cells)) {
        if (eliteMap.cells[oneCellKey].elts.length) {
          const genomeId = eliteMap.cells[oneCellKey].elts[0].g;
          const gzipPath = `${cellFeaturesPath}/features_${evoRunId}_${genomeId}.json.gz`;
          const plainPath = `${cellFeaturesPath}/features_${evoRunId}_${genomeId}.json`;
          
          try {
            const cellFeatures = readCompressedOrPlainJSON(gzipPath, plainPath);
            if (cellFeatures && cellFeatures[featureExtractionType]?.features) {
              featureVectors.push(cellFeatures[featureExtractionType].features);
            }
          } catch (error) {
            console.warn(`Could not read features for genome ${genomeId}: ${error.message}`);
          }
        }
      }
    } else {
      console.warn(`No feature extraction type found for iteration ${iterationIndex}`);
    }
    
    // Sample vectors if there are too many
    if (featureVectors.length > opts.maxVectorsPerIteration) {
      console.log(`Sampling ${opts.maxVectorsPerIteration} vectors from ${featureVectors.length} total vectors...`);
      featureVectors = sampleFeatureVectors(featureVectors, opts.maxVectorsPerIteration);
    }
    
    // Skip analysis if no feature vectors are available
    if (featureVectors.length === 0) {
      console.warn(`Skipping analysis for iteration ${iterationIndex}: No feature vectors available`);
      diversityTimeSeries.push({
        iteration: iterationIndex,
        averagePairwiseDistance: null,
        entropyScore: null,
        nearestNeighborStats: null,
        giniCoefficient: null,
        vectorCount: 0,
        error: "No feature vectors available"
      });
      
      performanceStats.iterationTimes.push({
        iteration: iterationIndex,
        totalTimeMs: getElapsedMs(iterStartTime),
        skipped: true,
        reason: "No feature vectors available"
      });
      
      continue;
    }

    // Calculate diversity metrics at this iteration
    console.log(`Computing metrics for iteration ${iterationIndex} (${featureVectors.length} vectors)...`);
    
    // Time each metric calculation
    const pairwiseDistanceStart = process.hrtime();
    const averagePairwiseDistance = calculateAveragePairwiseDistanceStreaming(
      featureVectors, opts.samplingRatio
    );
    const pairwiseDistanceTime = getElapsedMs(pairwiseDistanceStart);
    
    const entropyStart = process.hrtime();
    const entropyScore =calculateGridBasedDiversityEntropy(featureVectors);
    const entropyTime = getElapsedMs(entropyStart);
    
    const nnStart = process.hrtime();
    const nearestNeighborStats = calculateApproximateNearestNeighborStats(featureVectors);
    const nnTime = getElapsedMs(nnStart);

    // Calculate Gini coefficient
    const giniStart = process.hrtime();
    const giniCoefficient = calculateMemoryEfficientGiniCoefficient(featureVectors, opts.samplingRatio);
    const giniTime = getElapsedMs(giniStart);
    
    const metrics = {
      iteration: iterationIndex,
      averagePairwiseDistance,
      entropyScore,
      nearestNeighborStats,
      giniCoefficient,
      vectorCount: featureVectors.length
    };
    
    diversityTimeSeries.push(metrics);
    
    // Record performance for this iteration
    const iterTime = getElapsedMs(iterStartTime);
    performanceStats.iterationTimes.push({
      iteration: iterationIndex,
      totalTimeMs: iterTime,
      metricTimes: {
        pairwiseDistanceMs: pairwiseDistanceTime,
        entropyMs: entropyTime,
        nearestNeighborMs: nnTime,
        giniCoefficientMs: giniTime
      },
      featureVectorsProcessed: featureVectors.length
    });
    
    console.log(`Iteration ${iterationIndex} completed in ${iterTime.toFixed(2)}ms`);
    console.log(`  - Pairwise distance: ${pairwiseDistanceTime.toFixed(2)}ms`);
    console.log(`  - Entropy: ${entropyTime.toFixed(2)}ms`);
    console.log(`  - Nearest neighbor: ${nnTime.toFixed(2)}ms`);
    console.log(`  - Gini coefficient: ${giniTime.toFixed(2)}ms`);
    console.log(`  - Feature vectors processed: ${featureVectors.length}`);
  }
  
  console.log('Calculating diversity change rates...');
  // Calculate diversity change rates
  const diversityChangeRates = [];
  for (let i = 1; i < diversityTimeSeries.length; i++) {
    const current = diversityTimeSeries[i];
    const previous = diversityTimeSeries[i-1];
    
    // Calculate changes only if both values exist
    const distanceChange = current.averagePairwiseDistance !== null && previous.averagePairwiseDistance !== null
      ? current.averagePairwiseDistance - previous.averagePairwiseDistance
      : null;
    
    const entropyChange = current.entropyScore?.entropy !== undefined && previous.entropyScore?.entropy !== undefined
      ? current.entropyScore.entropy - previous.entropyScore.entropy
      : null;
    
    diversityChangeRates.push({
      fromIteration: previous.iteration,
      toIteration: current.iteration,
      distanceChange,
      entropyChange,
      isEstimated: distanceChange === null || entropyChange === null
    });
  }
  
  console.log('Calculating overall trend...');
  const overallTrend = calculateDiversityTrend(diversityTimeSeries);
  
  // Calculate overall timing
  const totalTime = getElapsedMs(startTime);
  console.log(`Total diversity tracking completed in ${totalTime.toFixed(2)}ms`);
  
  performanceStats.totalTimeMs = totalTime;
  
  const results = {
    diversityTimeSeries,
    diversityChangeRates,
    overallTrend,
    performanceStats,
    featureExtractionType,
    options: opts
  };
  
  // Save results
  console.log('Saving results to file...');
  const resultsStringified = JSON.stringify(results);
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const resultsFilePath = `${evoRunDirPath}diversity-time-series_step-${stepSize}.json`;
  fs.writeFileSync(resultsFilePath, resultsStringified);
  
  return results;
}

/**
 * Calculate diversity trend from time series data
 */
function calculateDiversityTrend(diversityTimeSeries) {
  // Calculate linear regression to find trend
  const x = diversityTimeSeries.map((_, i) => i);
  const y = diversityTimeSeries.map(d => d.averagePairwiseDistance);
  
  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  
  // Calculate slope
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < x.length; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += Math.pow(x[i] - meanX, 2);
  }
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  
  return {
    slope,
    intercept,
    interpretation: slope > 0 ? "increasing" : slope < 0 ? "decreasing" : "stable"
  };
}

/**
 * Helper function to get elapsed time in milliseconds
 */
function getElapsedMs(startTime) {
  const diff = process.hrtime(startTime);
  return (diff[0] * 1e9 + diff[1]) / 1e6;
}