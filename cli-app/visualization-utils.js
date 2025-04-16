/**
 * Visualization utilities for phylogenetic tree metrics
 * This module provides functions to generate visualization data structures
 * that can be used with D3.js or other visualization libraries
 */

/**
 * Generate a tree structure for visualization 
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Tree structure for visualization
 */
export function generateTreeVisualizationData(lineageData) {
  // Create nodes and establish parent-child relationships
  const nodes = new Map();
  
  // First pass: Create all nodes
  lineageData.forEach(genome => {
    if (!nodes.has(genome.id)) {
      nodes.set(genome.id, {
        id: genome.id,
        name: `${genome.eliteClass} (G${genome.gN})`,
        eliteClass: genome.eliteClass,
        terrain: genome.terrain, 
        score: genome.s,
        generation: genome.gN,
        terrainAppearances: genome.terrainAppearances || [],
        children: []
      });
    }
  });
  
  // Second pass: Connect parents to children
  lineageData.forEach(genome => {
    const node = nodes.get(genome.id);
    
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        if (nodes.has(parent.genomeId)) {
          const parentNode = nodes.get(parent.genomeId);
          parentNode.children.push(node);
        }
      });
    }
  });
  
  // Find root nodes (no parents)
  const rootNodes = Array.from(nodes.values()).filter(node => {
    let hasParent = false;
    nodes.forEach(potentialParent => {
      if (potentialParent.children.includes(node)) {
        hasParent = true;
      }
    });
    return !hasParent;
  });
  
  // Format for d3.hierarchy
  function formatForD3(node) {
    return {
      name: node.name,
      id: node.id,
      attributes: {
        eliteClass: node.eliteClass,
        terrain: node.terrain,
        score: node.score,
        generation: node.generation,
        terrainCount: node.terrainAppearances.length
      },
      children: node.children.map(child => formatForD3(child))
    };
  }
  
  // Return a single tree or forest depending on # of roots
  if (rootNodes.length === 1) {
    return formatForD3(rootNodes[0]);
  } else {
    return {
      name: "Forest",
      children: rootNodes.map(root => formatForD3(root))
    };
  }
}

/**
 * Generate data for terrain transition visualization
 * @param {Object} terrainTransitions - Transition metrics from calculateTerrainTransitionMetrics
 * @returns {Object} Nodes and links for visualization
 */
export function generateTerrainTransitionGraph(terrainTransitions) {
  const { terrainOccurrences, terrainTransitions: transitions } = terrainTransitions;
  
  // Create nodes and links
  const nodes = Object.entries(terrainOccurrences).map(([terrain, count]) => ({
    id: terrain,
    label: terrain,
    value: count,
    group: terrain
  }));
  
  const links = Object.entries(transitions).map(([transitionKey, count]) => {
    const [source, target] = transitionKey.split('->');
    return {
      source,
      target,
      value: count
    };
  });
  
  return { nodes, links };
}

/**
 * Generate data for lineage-through-time plot
 * Shows how lineages accumulate over time
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Array} Data for lineage-through-time plot
 */
export function generateLineageThroughTimePlot(lineageData) {
  // Sort genomes by generation
  const sortedGenomes = [...lineageData].sort((a, b) => a.gN - b.gN);
  
  // Count cumulative lineages by generation
  const lineagesByGeneration = {};
  const genomesByGeneration = {};
  
  sortedGenomes.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = new Set();
    }
    genomesByGeneration[genome.gN].add(genome.id);
  });
  
  // Sort generations
  const generations = Object.keys(genomesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Count cumulative lineages
  let cumulativeCount = 0;
  const lineageThroughTime = [];
  
  generations.forEach(gen => {
    cumulativeCount += genomesByGeneration[gen].size;
    lineageThroughTime.push({
      generation: gen,
      cumulativeLineages: cumulativeCount,
      newLineages: genomesByGeneration[gen].size
    });
  });
  
  return lineageThroughTime;
}

/**
 * Generate data for density-dependence visualization
 * @param {Object} densityDependence - Results from calculateDensityDependence
 * @returns {Array} Data for density vs growth rate plot
 */
export function generateDensityDependencePlot(densityDependence) {
  const { growthRates, diversityByGeneration } = densityDependence;
  
  // Create data points for visualization
  return growthRates.map(rate => ({
    generation: rate.toGeneration,
    diversity: rate.prevDiversity,
    growthRate: rate.growthRate,
    // Make growthRate more readable for visualization
    scaledGrowthRate: rate.growthRate * 100
  }));
}

/**
 * Generate tree size distribution for histogram visualization
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Tree size distribution data
 */
export function generateTreeSizeDistribution(lineageData) {
  // Group genomes by generation
  const genomesByGeneration = {};
  
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Count elites per class (bin) at final generation
  const maxGeneration = Math.max(...Object.keys(genomesByGeneration).map(Number));
  const finalGenGenomes = genomesByGeneration[maxGeneration] || [];
  
  // Count genomes per elite class
  const genomesPerClass = {};
  finalGenGenomes.forEach(genome => {
    if (!genomesPerClass[genome.eliteClass]) {
      genomesPerClass[genome.eliteClass] = 0;
    }
    genomesPerClass[genome.eliteClass]++;
  });
  
  // Create histogram data
  const histogramData = Object.entries(genomesPerClass).map(([eliteClass, count]) => ({
    eliteClass,
    count
  }));
  
  // Count frequency of each bin size
  const sizeCounts = {};
  Object.values(genomesPerClass).forEach(count => {
    if (!sizeCounts[count]) {
      sizeCounts[count] = 0;
    }
    sizeCounts[count]++;
  });
  
  // Create distribution data
  const distribution = Object.entries(sizeCounts).map(([size, frequency]) => ({
    size: parseInt(size),
    frequency
  })).sort((a, b) => a.size - b.size);
  
  return {
    histogramData,
    distribution
  };
}

/**
 * Generate branch length distribution
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Array} Branch length distribution data
 */
export function generateBranchLengthDistribution(lineageData) {
  const branchLengths = [];
  
  // Calculate branch lengths (generation differences)
  lineageData.forEach(genome => {
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        const parentGenome = lineageData.find(g => g.id === parent.genomeId);
        if (parentGenome) {
          const length = Math.abs(genome.gN - parentGenome.gN);
          branchLengths.push({
            from: parentGenome.id,
            to: genome.id,
            length,
            fromGeneration: parentGenome.gN,
            toGeneration: genome.gN
          });
        }
      });
    }
  });
  
  // Create distribution
  const lengths = branchLengths.map(b => b.length);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  
  // Create bins
  const binSize = Math.max(1, Math.ceil((max - min) / 10));
  const bins = {};
  
  for (let i = min; i <= max; i += binSize) {
    bins[i] = 0;
  }
  
  // Count frequencies
  lengths.forEach(length => {
    const binStart = Math.floor(length / binSize) * binSize;
    if (bins[binStart] !== undefined) {
      bins[binStart]++;
    } else {
      bins[binStart] = 1;
    }
  });
  
  // Format for visualization
  return Object.entries(bins).map(([binStart, count]) => ({
    binStart: parseInt(binStart),
    binEnd: parseInt(binStart) + binSize - 1,
    count,
    frequency: count / lengths.length
  }));
}

/**
 * Create a complete metrics visualization package
 * @param {Array} lineageData - The lineage data from QD run
 * @param {Object} metrics - The metrics data from calculateAllPhylogeneticMetrics
 * @returns {Object} All visualization data structures
 */
export function createVisualizationPackage(lineageData, metrics) {
  return {
    treeStructure: generateTreeVisualizationData(lineageData),
    terrainTransitions: generateTerrainTransitionGraph(metrics.terrainTransitions),
    lineageThroughTime: generateLineageThroughTimePlot(lineageData),
    densityDependence: generateDensityDependencePlot(metrics.densityDependence),
    treeSizeDistribution: generateTreeSizeDistribution(lineageData),
    branchLengthDistribution: generateBranchLengthDistribution(lineageData)
  };
}