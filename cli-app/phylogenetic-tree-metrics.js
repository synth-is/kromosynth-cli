/**
 * Implementation of phylogenetic tree size metrics for QD sound discovery analysis
 * Based on the paper "The Untapped Potential of Tree Size in Reconstructing
 * Evolutionary and Epidemiological Dynamics"
 */

// Helper function to build a full tree structure from lineage data
function buildPhylogeneticTree(lineageData) {
  // Create nodes map with id as key
  const nodes = new Map();
  
  // First pass: create all nodes
  lineageData.forEach(genome => {
    if (!nodes.has(genome.id)) {
      nodes.set(genome.id, {
        id: genome.id,
        eliteClass: genome.eliteClass,
        terrain: genome.terrain,
        score: genome.s,
        generation: genome.gN,
        children: [],
        terrainAppearances: genome.terrainAppearances || [],
        parents: genome.parents || []
      });
    }
  });
  
  // Second pass: establish parent-child relationships
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
  
  // Find root nodes (nodes without parents)
  const rootNodes = Array.from(nodes.values()).filter(node => 
    !node.parents || node.parents.length === 0
  );
  
  return {
    nodes,
    rootNodes
  };
}

/**
 * Calculate N: Number of Extant Lineages
 * This metric counts the number of unique solutions in the final generation
 */
export function calculateExtantLineages(lineageData, maxGeneration = null) {
  // If maxGeneration is not provided, find the highest generation
  if (maxGeneration === null) {
    maxGeneration = Math.max(...lineageData.map(genome => genome.gN));
  }
  
  // Get unique genome IDs in the final generation
  const extantGenomes = new Set();
  
  lineageData.forEach(genome => {
    // Check if this genome is from the final generation we're interested in
    if (genome.gN === maxGeneration) {
      extantGenomes.add(genome.id);
    }
  });
  
  return extantGenomes.size;
}

/**
 * Calculate M: Total Samples Collected
 * This counts the total number of elite solutions across all generations
 */
export function calculateTotalSamples(lineageData) {
  return lineageData.length;
}

/**
 * Calculate M̃: Number of Unique Lineages Sampled
 * This counts distinct lineages accounting for ancestral relationships
 * We consider genomes that represent new evolutionary paths rather than minor variations
 */
export function calculateUniqueLineages(lineageData) {
  const tree = buildPhylogeneticTree(lineageData);
  
  // Count paths through the tree that lead to leaves (terminal nodes)
  const leaves = Array.from(tree.nodes.values()).filter(node => 
    node.children.length === 0
  );
  
  // Unique lineages can be estimated by counting the leaf nodes
  return leaves.length;
}

/**
 * Calculate metrics related to evolutionary events (births, deaths, extinctions)
 */
export function calculateEvolutionaryEvents(lineageData) {
  // Build the phylogenetic tree
  const tree = buildPhylogeneticTree(lineageData);
  
  // Track elites by cell over time
  const cellEliteHistory = {};
  
  // Sort lineage data by generation
  const sortedLineage = [...lineageData].sort((a, b) => a.gN - b.gN);
  
  let birthCount = 0;  // new elite in previously empty cell
  let deathCount = 0;  // replacement of existing elite
  let extinctionCount = 0; // lineages that have no further descendants
  
  // Process elite history to identify births and deaths
  sortedLineage.forEach(genome => {
    // Track each elite appearance by cell
    genome.terrainAppearances.forEach(appearance => {
      const cellKey = `${appearance.terrain}_${appearance.eliteClass}`;
      
      if (!cellEliteHistory[cellKey]) {
        cellEliteHistory[cellKey] = [];
        birthCount++; // First elite in this cell = birth
      } else if (cellEliteHistory[cellKey].length > 0) {
        // If the last elite in this cell is different from the current one
        if (cellEliteHistory[cellKey][cellEliteHistory[cellKey].length - 1].genomeId !== genome.id) {
          deathCount++; // Replacement = death
        }
      }
      
      cellEliteHistory[cellKey].push({
        genomeId: genome.id,
        generation: appearance.generation
      });
    });
  });
  
  // Identify extinctions (nodes with no children)
  Array.from(tree.nodes.values()).forEach(node => {
    if (node.children.length === 0) {
      extinctionCount++;
    }
  });
  
  return {
    birthCount,
    deathCount,
    extinctionCount
  };
}

/**
 * Calculate tree shape metrics
 */
export function calculateTreeShapeMetrics(lineageData) {
  const tree = buildPhylogeneticTree(lineageData);
  
  // Sackin index: average depth of leaves (indicates balance/imbalance)
  function calculateSackinIndex(rootNode) {
    // Helper function to calculate depth of all leaves
    function calculateLeafDepths(node, currentDepth = 0, leafDepths = []) {
      if (node.children.length === 0) {
        leafDepths.push(currentDepth);
      } else {
        node.children.forEach(child => {
          calculateLeafDepths(child, currentDepth + 1, leafDepths);
        });
      }
      return leafDepths;
    }
    
    // Calculate for each root node
    const allLeafDepths = [];
    tree.rootNodes.forEach(root => {
      const leafDepths = calculateLeafDepths(root);
      allLeafDepths.push(...leafDepths);
    });
    
    // Average depth
    return allLeafDepths.reduce((sum, depth) => sum + depth, 0) / allLeafDepths.length;
  }
  
  // Colless index: measure of tree imbalance
  function calculateCollessIndex(rootNode) {
    // Helper function to count descendants for each node
    function countDescendants(node, counts = new Map()) {
      if (node.children.length === 0) {
        counts.set(node, 1);
        return 1;
      }
      
      let sum = 0;
      node.children.forEach(child => {
        sum += countDescendants(child, counts);
      });
      
      counts.set(node, sum);
      return sum;
    }
    
    // Helper to calculate imbalance
    function calculateImbalance(node, counts) {
      if (node.children.length <= 1) return 0;
      
      let imbalance = 0;
      for (let i = 0; i < node.children.length; i++) {
        for (let j = i + 1; j < node.children.length; j++) {
          imbalance += Math.abs(
            counts.get(node.children[i]) - counts.get(node.children[j])
          );
        }
        
        // Add imbalance of children
        imbalance += calculateImbalance(node.children[i], counts);
      }
      
      return imbalance;
    }
    
    // Calculate for each root node and normalize
    let totalImbalance = 0;
    tree.rootNodes.forEach(root => {
      const counts = new Map();
      countDescendants(root, counts);
      totalImbalance += calculateImbalance(root, counts);
    });
    
    // Normalize by the number of internal nodes
    const internalNodes = Array.from(tree.nodes.values()).filter(
      node => node.children.length > 0
    ).length;
    
    return internalNodes > 0 ? totalImbalance / internalNodes : 0;
  }
  
  // Branch lengths: average evolutionary distance
  function calculateBranchLengths() {
    let totalBranchLength = 0;
    let branchCount = 0;
    
    // Calculate branch length as generation difference
    Array.from(tree.nodes.values()).forEach(node => {
      if (node.parents && node.parents.length > 0) {
        // For each parent, find the parent node
        node.parents.forEach(parentInfo => {
          const parentNode = tree.nodes.get(parentInfo.genomeId);
          if (parentNode) {
            // Branch length = generation difference
            const length = Math.abs(node.generation - parentNode.generation);
            totalBranchLength += length;
            branchCount++;
          }
        });
      }
    });
    
    return branchCount > 0 ? totalBranchLength / branchCount : 0;
  }
  
  return {
    sackinIndex: calculateSackinIndex(),
    collessIndex: calculateCollessIndex(),
    averageBranchLength: calculateBranchLengths()
  };
}

/**
 * Calculate metrics for terrain transitions (unique to your QD sound discovery)
 * This analyzes how genomes move between different terrains/environments
 */
export function calculateTerrainTransitionMetrics(lineageData) {
  // Build transition matrix between terrains
  const terrainTransitions = new Map();
  const terrainOccurrences = new Map();
  const genomesWithMultipleTerrains = new Set();
  
  lineageData.forEach(genome => {
    // Skip if no terrain appearances
    if (!genome.terrainAppearances || genome.terrainAppearances.length <= 1) return;
    
    // Get unique terrains this genome appears in
    const terrains = new Set(genome.terrainAppearances.map(t => t.terrain));
    
    // If genome appears in multiple terrains, count it
    if (terrains.size > 1) {
      genomesWithMultipleTerrains.add(genome.id);
    }
    
    // Count terrain occurrences
    terrains.forEach(terrain => {
      if (!terrainOccurrences.has(terrain)) {
        terrainOccurrences.set(terrain, 0);
      }
      terrainOccurrences.set(terrain, terrainOccurrences.get(terrain) + 1);
    });
    
    // Track transitions between terrains (all possible pairs)
    const terrainArray = Array.from(terrains);
    for (let i = 0; i < terrainArray.length; i++) {
      for (let j = i + 1; j < terrainArray.length; j++) {
        const pair = [terrainArray[i], terrainArray[j]].sort().join('->');
        
        if (!terrainTransitions.has(pair)) {
          terrainTransitions.set(pair, 0);
        }
        terrainTransitions.set(pair, terrainTransitions.get(pair) + 1);
      }
    }
  });
  
  // Calculate terrain adaptability - percentage of genomes that succeed in multiple terrains
  const terrainAdaptability = genomesWithMultipleTerrains.size / lineageData.length;
  
  return {
    terrainTransitions: Object.fromEntries(terrainTransitions),
    terrainOccurrences: Object.fromEntries(terrainOccurrences),
    terrainAdaptability,
    multiTerrainGenomeCount: genomesWithMultipleTerrains.size
  };
}

/**
 * Calculate density-dependence metrics
 * Compare distribution patterns to determine if diversification is density-dependent
 */
export function calculateDensityDependence(lineageData) {
  // Group genomes by generation
  const genomesByGeneration = {};
  
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Get sorted generations
  const generations = Object.keys(genomesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Track diversity over time
  const diversityByGeneration = {};
  
  generations.forEach(gen => {
    // Count unique elite classes in this generation
    const uniqueClasses = new Set();
    genomesByGeneration[gen].forEach(genome => {
      uniqueClasses.add(genome.eliteClass);
    });
    
    diversityByGeneration[gen] = uniqueClasses.size;
  });
  
  // Analyze if diversity growth pattern follows density-dependent pattern
  // For density-dependent processes, growth rate should decrease as diversity increases
  const growthRates = [];
  
  for (let i = 1; i < generations.length; i++) {
    const prevGen = generations[i-1];
    const currentGen = generations[i];
    
    const prevDiversity = diversityByGeneration[prevGen];
    const currentDiversity = diversityByGeneration[currentGen];
    
    // Calculate growth rate (avoid division by zero)
    if (prevDiversity > 0) {
      const growthRate = (currentDiversity - prevDiversity) / prevDiversity;
      growthRates.push({
        fromGeneration: prevGen,
        toGeneration: currentGen,
        prevDiversity,
        currentDiversity,
        growthRate
      });
    }
  }
  
  // Calculate correlation between diversity and growth rate
  // Negative correlation suggests density-dependence
  let correlation = 0;
  if (growthRates.length > 1) {
    const diversities = growthRates.map(r => r.prevDiversity);
    const rates = growthRates.map(r => r.growthRate);
    
    correlation = calculateCorrelation(diversities, rates);
  }
  
  return {
    diversityByGeneration,
    growthRates,
    densityDependenceCorrelation: correlation,
    // Negative correlation suggests density-dependence
    isDensityDependent: correlation < -0.5
  };
}

// Helper function to calculate Pearson correlation
function calculateCorrelation(x, y) {
  const n = x.length;
  
  // Calculate means
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  
  // Calculate correlation coefficient
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    numerator += xDiff * yDiff;
    denomX += xDiff * xDiff;
    denomY += yDiff * yDiff;
  }
  
  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Master function to calculate all phylogenetic tree metrics
 */
export function calculateAllPhylogeneticMetrics(lineageData) {
  return {
    // Core tree size metrics
    extantLineages: calculateExtantLineages(lineageData),
    totalSamples: calculateTotalSamples(lineageData),
    uniqueLineages: calculateUniqueLineages(lineageData),
    
    // Evolutionary events
    events: calculateEvolutionaryEvents(lineageData),
    
    // Tree shape metrics
    shape: calculateTreeShapeMetrics(lineageData),
    
    // QD-specific metrics
    terrainTransitions: calculateTerrainTransitionMetrics(lineageData),
    
    // Density-dependence analysis
    densityDependence: calculateDensityDependence(lineageData)
  };
}