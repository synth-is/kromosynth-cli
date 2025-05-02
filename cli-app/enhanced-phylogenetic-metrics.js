/**
 * Enhanced Phylogenetic Tree Metrics
 * Based on "The Untapped Potential of Tree Size in Reconstructing
 * Evolutionary and Epidemiological Dynamics"
 * 
 * This module extends the existing phylogenetic-tree-metrics.js to provide
 * more comprehensive analysis of evolutionary lineages in quality diversity search.
 */

/**
 * Calculate distribution of tree sizes (number of nodes/solutions)
 * This helps understand patterns of diversification across different runs
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Size distribution metrics
 */
export function calculateTreeSizeDistribution(lineageData) {
  // Group genomes by generation to track size over time
  const genomesByGeneration = {};
  
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Sort generations
  const generations = Object.keys(genomesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Calculate cumulative counts and distribution properties
  const cumulativeCounts = [];
  let maxSize = 0;
  let meanSize = 0;
  
  generations.forEach(gen => {
    const genSize = genomesByGeneration[gen].length;
    maxSize = Math.max(maxSize, genSize);
    
    cumulativeCounts.push({
      generation: gen,
      size: genSize,
      cumulativeSize: genomesByGeneration[gen].length
    });
  });
  
  // Calculate mean size across generations
  if (generations.length > 0) {
    const totalSize = cumulativeCounts.reduce((sum, gen) => sum + gen.size, 0);
    meanSize = totalSize / generations.length;
  }
  
  // Calculate variance and standard deviation
  let variance = 0;
  if (generations.length > 1) {
    const sumOfSquaredDiffs = cumulativeCounts.reduce((sum, gen) => {
      return sum + Math.pow(gen.size - meanSize, 2);
    }, 0);
    variance = sumOfSquaredDiffs / (generations.length - 1);
  }
  const stdDev = Math.sqrt(variance);
  
  return {
    distribution: cumulativeCounts,
    maxSize,
    meanSize,
    variance,
    stdDev,
    // Calculate coefficient of variation (useful metric for comparing distributions)
    coefficientOfVariation: meanSize > 0 ? stdDev / meanSize : 0
  };
}

/**
 * Calculate enhanced branch length metrics
 * Goes beyond simple averages to look at distribution patterns
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Enhanced branch length metrics
 */
export function calculateEnhancedBranchLengthMetrics(lineageData) {
  const branchLengths = [];
  const branchLengthsByGeneration = {};
  
  // Calculate branch lengths (generation differences)
  lineageData.forEach(genome => {
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        const parentGenome = lineageData.find(g => g.id === parent.genomeId);
        if (parentGenome) {
          const length = Math.abs(genome.gN - parentGenome.gN);
          
          branchLengths.push(length);
          
          // Track branch lengths by generation for temporal analysis
          if (!branchLengthsByGeneration[genome.gN]) {
            branchLengthsByGeneration[genome.gN] = [];
          }
          branchLengthsByGeneration[genome.gN].push(length);
        }
      });
    }
  });
  
  // Skip further calculations if no branch lengths found
  if (branchLengths.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      variance: 0,
      stdDev: 0,
      temporalTrend: []
    };
  }
  
  // Calculate statistics
  const mean = branchLengths.reduce((sum, length) => sum + length, 0) / branchLengths.length;
  
  // Calculate median
  const sortedLengths = [...branchLengths].sort((a, b) => a - b);
  const median = sortedLengths.length % 2 === 0
    ? (sortedLengths[sortedLengths.length / 2 - 1] + sortedLengths[sortedLengths.length / 2]) / 2
    : sortedLengths[Math.floor(sortedLengths.length / 2)];
  
  // Calculate variance and standard deviation
  const variance = branchLengths.reduce((sum, length) => sum + Math.pow(length - mean, 2), 0) / branchLengths.length;
  const stdDev = Math.sqrt(variance);
  
  // Calculate distribution by branch length
  const distribution = {};
  branchLengths.forEach(length => {
    if (!distribution[length]) {
      distribution[length] = 0;
    }
    distribution[length]++;
  });
  
  // Calculate temporal trend of branch lengths
  const generations = Object.keys(branchLengthsByGeneration).map(Number).sort((a, b) => a - b);
  const temporalTrend = generations.map(gen => {
    const lengths = branchLengthsByGeneration[gen];
    const genMean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
    
    return {
      generation: gen,
      meanBranchLength: genMean,
      branchCount: lengths.length
    };
  });
  
  return {
    count: branchLengths.length,
    mean,
    median,
    variance,
    stdDev,
    distribution,
    temporalTrend
  };
}

/**
 * Analyze branching rates over time to identify innovation patterns
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Branching rate analysis
 */
export function analyzeBranchingPatterns(lineageData) {
  // Group genomes by generation
  const genomesByGeneration = {};
  
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Sort generations
  const generations = Object.keys(genomesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Calculate branching rates
  const branchingRates = [];
  let totalGenomes = 0;
  
  generations.forEach((gen, index) => {
    const currentGenCount = genomesByGeneration[gen].length;
    totalGenomes += currentGenCount;
    
    // Calculate branching rate (can only do this after first generation)
    if (index > 0) {
      const prevGen = generations[index - 1];
      const prevGenCount = genomesByGeneration[prevGen].length;
      
      // Branching rate = new genomes / previous genomes
      const branchingRate = prevGenCount > 0 ? currentGenCount / prevGenCount : 0;
      
      branchingRates.push({
        generation: gen,
        branchingRate,
        newGenomes: currentGenCount,
        totalAccumulated: totalGenomes
      });
    }
  });
  
  // Calculate LTT (Lineage Through Time) data
  const ltt = generations.map((gen, index) => {
    return {
      generation: gen,
      lineageCount: totalGenomes - generations.slice(0, index).reduce(
        (sum, g) => sum + genomesByGeneration[g].length, 0
      )
    };
  });
  
  return {
    branchingRates,
    ltt,
    maxBranchingRate: Math.max(...branchingRates.map(b => b.branchingRate))
  };
}

/**
 * Analyze density-dependence in the evolutionary process
 * Enhanced implementation that more directly follows the paper's methodology
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Density dependence analysis
 */
export function analyzeDensityDependenceEnhanced(lineageData) {
  // Group genomes by generation
  const genomesByGeneration = {};
  
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Sort generations
  const generations = Object.keys(genomesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Track diversity and growth rates
  const diversityByGeneration = {};
  const growthRates = [];
  
  // For each generation, calculate diversity (number of unique classes/bins)
  generations.forEach(gen => {
    // Count unique elite classes in this generation
    const uniqueClasses = new Set();
    genomesByGeneration[gen].forEach(genome => {
      uniqueClasses.add(genome.eliteClass);
    });
    
    diversityByGeneration[gen] = uniqueClasses.size;
  });
  
  // Calculate growth rates between generations
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
  // Negative correlation strongly suggests density-dependence
  let correlation = 0;
  if (growthRates.length > 1) {
    const diversities = growthRates.map(r => r.prevDiversity);
    const rates = growthRates.map(r => r.growthRate);
    
    correlation = calculateCorrelation(diversities, rates);
  }
  
  // Compare to time-dependent model (which would have more constant growth)
  // In a time-dependent model, growth rates would be less correlated with diversity
  const timeDepModel = simulateTimeDependent(generations, diversityByGeneration[generations[0]]);
  
  return {
    diversityByGeneration,
    growthRates,
    densityDependenceCorrelation: correlation,
    // Negative correlation below -0.5 strongly suggests density-dependence
    isDensityDependent: correlation < -0.5,
    // Contrast with time-dependent model
    timeDepModelDiversity: timeDepModel.diversity,
    modelComparison: {
      actualFinalDiversity: diversityByGeneration[generations[generations.length - 1]],
      timeDepFinalDiversity: timeDepModel.diversity[timeDepModel.diversity.length - 1],
      // Higher difference suggests stronger density-dependence
      diversityGap: timeDepModel.diversity[timeDepModel.diversity.length - 1] - 
                    diversityByGeneration[generations[generations.length - 1]]
    }
  };
}

/**
 * Simulate a time-dependent diversification model
 * Used to contrast with density-dependent patterns
 * @param {Array} generations - Array of generation numbers
 * @param {Number} initialDiversity - Starting diversity
 * @returns {Object} Time-dependent model results
 */
function simulateTimeDependent(generations, initialDiversity) {
  const diversity = [initialDiversity];
  const growthRates = [];
  
  // Simple exponential growth model (time-dependent but not density-dependent)
  const baseGrowthRate = 0.05; // Constant growth rate
  
  for (let i = 1; i < generations.length; i++) {
    const prevDiversity = diversity[i-1];
    const newDiversity = Math.round(prevDiversity * (1 + baseGrowthRate));
    diversity.push(newDiversity);
    
    growthRates.push({
      generation: generations[i],
      growthRate: baseGrowthRate
    });
  }
  
  return {
    diversity,
    growthRates
  };
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * @param {Array} x - First array of values
 * @param {Array} y - Second array of values
 * @returns {Number} Correlation coefficient
 */
function calculateCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  
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
 * Compare two runs to identify differences in evolutionary dynamics
 * @param {Array} lineageData1 - Lineage data from first run
 * @param {Array} lineageData2 - Lineage data from second run
 * @returns {Object} Comparison results
 */
export function compareEvolutionaryDynamics(lineageData1, lineageData2) {
  // Calculate tree metrics for both runs
  const metrics1 = {
    treeSize: calculateTreeSizeDistribution(lineageData1),
    branchLengths: calculateEnhancedBranchLengthMetrics(lineageData1),
    branchingPatterns: analyzeBranchingPatterns(lineageData1),
    densityDependence: analyzeDensityDependenceEnhanced(lineageData1)
  };
  
  const metrics2 = {
    treeSize: calculateTreeSizeDistribution(lineageData2),
    branchLengths: calculateEnhancedBranchLengthMetrics(lineageData2),
    branchingPatterns: analyzeBranchingPatterns(lineageData2),
    densityDependence: analyzeDensityDependenceEnhanced(lineageData2)
  };
  
  // Calculate effect sizes for key differences
  const treeSizeEffectSize = calculateEffectSize(
    metrics1.treeSize.meanSize, 
    metrics2.treeSize.meanSize,
    metrics1.treeSize.stdDev,
    metrics2.treeSize.stdDev
  );
  
  const branchLengthEffectSize = calculateEffectSize(
    metrics1.branchLengths.mean,
    metrics2.branchLengths.mean,
    metrics1.branchLengths.stdDev,
    metrics2.branchLengths.stdDev
  );
  
  // Compare the runs on key metrics
  return {
    treeSizeComparison: {
      run1Mean: metrics1.treeSize.meanSize,
      run2Mean: metrics2.treeSize.meanSize,
      difference: metrics1.treeSize.meanSize - metrics2.treeSize.meanSize,
      effectSize: treeSizeEffectSize,
      significantDifference: Math.abs(treeSizeEffectSize) > 0.8 // Large effect
    },
    branchLengthComparison: {
      run1Mean: metrics1.branchLengths.mean,
      run2Mean: metrics2.branchLengths.mean,
      difference: metrics1.branchLengths.mean - metrics2.branchLengths.mean,
      effectSize: branchLengthEffectSize,
      significantDifference: Math.abs(branchLengthEffectSize) > 0.8
    },
    densityDependenceComparison: {
      run1IsDensityDependent: metrics1.densityDependence.isDensityDependent,
      run2IsDensityDependent: metrics2.densityDependence.isDensityDependent,
      run1Correlation: metrics1.densityDependence.densityDependenceCorrelation,
      run2Correlation: metrics2.densityDependence.densityDependenceCorrelation,
    },
    branchingRateComparison: {
      run1MaxRate: metrics1.branchingPatterns.maxBranchingRate,
      run2MaxRate: metrics2.branchingPatterns.maxBranchingRate,
      difference: metrics1.branchingPatterns.maxBranchingRate - metrics2.branchingPatterns.maxBranchingRate
    },
    diversityComparison: {
      // Compare final diversity levels
      run1FinalDiversity: Object.values(metrics1.densityDependence.diversityByGeneration).pop(),
      run2FinalDiversity: Object.values(metrics2.densityDependence.diversityByGeneration).pop(),
      // Difference in how quickly diversity accumulates
      run1DiversityAccumulation: calculateDiversityAccumulationRate(metrics1.densityDependence.diversityByGeneration),
      run2DiversityAccumulation: calculateDiversityAccumulationRate(metrics2.densityDependence.diversityByGeneration)
    }
  };
}

/**
 * Calculate effect size (Cohen's d) between two measurements
 * @param {Number} mean1 - Mean of first group
 * @param {Number} mean2 - Mean of second group
 * @param {Number} sd1 - Standard deviation of first group
 * @param {Number} sd2 - Standard deviation of second group
 * @returns {Number} Effect size
 */
function calculateEffectSize(mean1, mean2, sd1, sd2) {
  // Pooled standard deviation
  const pooledSD = Math.sqrt(((sd1 * sd1) + (sd2 * sd2)) / 2);
  
  // Cohen's d
  return (mean1 - mean2) / pooledSD;
}

/**
 * Calculate rate at which diversity accumulates over generations
 * @param {Object} diversityByGeneration - Object mapping generations to diversity
 * @returns {Number} Rate of diversity accumulation
 */
function calculateDiversityAccumulationRate(diversityByGeneration) {
  const generations = Object.keys(diversityByGeneration).map(Number).sort((a, b) => a - b);
  
  if (generations.length < 2) return 0;
  
  const firstGen = generations[0];
  const lastGen = generations[generations.length - 1];
  
  const initialDiversity = diversityByGeneration[firstGen];
  const finalDiversity = diversityByGeneration[lastGen];
  
  // Rate = (final - initial) / generations
  const generationSpan = lastGen - firstGen;
  return generationSpan > 0 ? (finalDiversity - initialDiversity) / generationSpan : 0;
}

/**
 * Calculate extinction metrics to identify unproductive areas
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Extinction analysis
 */
export function analyzeExtinctions(lineageData) {
  // Group genomes by generation
  const genomesByGeneration = {};
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Sort generations
  const generations = Object.keys(genomesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Track extinct lineages
  const extinctLineages = [];
  const genomeHasDescendants = new Map();
  
  // First pass: identify which genomes have descendants
  lineageData.forEach(genome => {
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        genomeHasDescendants.set(parent.genomeId, true);
      });
    }
  });
  
  // Second pass: identify extinct lineages (those without descendants)
  lineageData.forEach(genome => {
    if (!genomeHasDescendants.has(genome.id)) {
      extinctLineages.push({
        id: genome.id,
        eliteClass: genome.eliteClass,
        generation: genome.gN,
        score: genome.s
      });
    }
  });
  
  // Calculate extinction rate over time
  const extinctionsByGeneration = {};
  extinctLineages.forEach(lineage => {
    if (!extinctionsByGeneration[lineage.generation]) {
      extinctionsByGeneration[lineage.generation] = 0;
    }
    extinctionsByGeneration[lineage.generation]++;
  });
  
  // Calculate extinction rate
  const extinctionRates = generations.map(gen => {
    const totalInGeneration = genomesByGeneration[gen].length;
    const extinctionsInGeneration = extinctionsByGeneration[gen] || 0;
    
    return {
      generation: gen,
      extinctionCount: extinctionsInGeneration,
      extinctionRate: totalInGeneration > 0 ? extinctionsInGeneration / totalInGeneration : 0
    };
  });
  
  // Calculate features associated with extinctions
  const classExtinctionRates = {};
  
  // Group extinct lineages by elite class
  extinctLineages.forEach(lineage => {
    if (!classExtinctionRates[lineage.eliteClass]) {
      classExtinctionRates[lineage.eliteClass] = {
        count: 0,
        totalGenomes: 0
      };
    }
    classExtinctionRates[lineage.eliteClass].count++;
  });
  
  // Count total genomes per class
  lineageData.forEach(genome => {
    if (!classExtinctionRates[genome.eliteClass]) {
      classExtinctionRates[genome.eliteClass] = {
        count: 0,
        totalGenomes: 0
      };
    }
    classExtinctionRates[genome.eliteClass].totalGenomes++;
  });
  
  // Calculate extinction rates per class
  Object.keys(classExtinctionRates).forEach(eliteClass => {
    const data = classExtinctionRates[eliteClass];
    data.rate = data.totalGenomes > 0 ? data.count / data.totalGenomes : 0;
  });
  
  return {
    extinctLineagesCount: extinctLineages.length,
    totalLineagesCount: lineageData.length,
    overallExtinctionRate: lineageData.length > 0 ? extinctLineages.length / lineageData.length : 0,
    extinctionRateOverTime: extinctionRates,
    classExtinctionRates,
    // Identify classes with highest extinction rates
    highRiskClasses: Object.entries(classExtinctionRates)
      .filter(([_, data]) => data.totalGenomes >= 5) // Only consider classes with enough samples
      .sort((a, b) => b[1].rate - a[1].rate)
      .slice(0, 5)
      .map(([eliteClass, data]) => ({
        eliteClass,
        extinctionRate: data.rate,
        sampleSize: data.totalGenomes
      }))
  };
}

/**
 * Analyze adaptability across different terrains/environmental conditions
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Terrain adaptability analysis
 */
export function analyzeTerrainAdaptabilityEnhanced(lineageData) {
  // Count genomes that appear in multiple terrains
  const genomeTerrainCounts = new Map();
  
  // First pass: count terrains per genome
  lineageData.forEach(genome => {
    if (genome.terrainAppearances && genome.terrainAppearances.length > 0) {
      // Extract unique terrains this genome appears in
      const uniqueTerrains = new Set(genome.terrainAppearances.map(t => t.terrain));
      genomeTerrainCounts.set(genome.id, uniqueTerrains.size);
    } else {
      genomeTerrainCounts.set(genome.id, 1); // Default to 1 if no terrain appearances data
    }
  });
  
  // Calculate distribution of terrain appearances
  const terrainCountDistribution = {};
  genomeTerrainCounts.forEach((count) => {
    if (!terrainCountDistribution[count]) {
      terrainCountDistribution[count] = 0;
    }
    terrainCountDistribution[count]++;
  });
  
  // Track transitions between terrains
  const terrainTransitions = {};
  const terrainOccurrences = {};
  
  lineageData.forEach(genome => {
    if (genome.terrainAppearances && genome.terrainAppearances.length > 1) {
      // Get unique terrains
      const terrains = Array.from(new Set(genome.terrainAppearances.map(t => t.terrain)));
      
      // Count occurrences
      terrains.forEach(terrain => {
        if (!terrainOccurrences[terrain]) {
          terrainOccurrences[terrain] = 0;
        }
        terrainOccurrences[terrain]++;
      });
      
      // Count transitions (all possible combinations)
      for (let i = 0; i < terrains.length; i++) {
        for (let j = i + 1; j < terrains.length; j++) {
          const transition = [terrains[i], terrains[j]].sort().join('->');
          
          if (!terrainTransitions[transition]) {
            terrainTransitions[transition] = 0;
          }
          terrainTransitions[transition]++;
        }
      }
    } else if (genome.terrainAppearances && genome.terrainAppearances.length === 1) {
      // Count single-terrain occurrences
      const terrain = genome.terrainAppearances[0].terrain;
      if (!terrainOccurrences[terrain]) {
        terrainOccurrences[terrain] = 0;
      }
      terrainOccurrences[terrain]++;
    }
  });
  
  // Calculate adaptability score (% of genomes that appear in multiple terrains)
  const multiTerrainGenomes = Array.from(genomeTerrainCounts.values()).filter(count => count > 1).length;
  const terrainAdaptability = lineageData.length > 0 ? multiTerrainGenomes / lineageData.length : 0;
  
  return {
    terrainOccurrences,
    terrainTransitions,
    terrainAdaptability,
    multiTerrainGenomeCount: multiTerrainGenomes,
    terrainCountDistribution,
    // Identify most adaptable genomes (appearing in most terrains)
    mostAdaptableGenomes: Array.from(genomeTerrainCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => {
        const genome = lineageData.find(g => g.id === id);
        return {
          id,
          terrainCount: count,
          eliteClass: genome?.eliteClass,
          score: genome?.s
        };
      })
  };
}

/**
 * Master function to calculate all enhanced phylogenetic tree metrics
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Comprehensive metrics
 */
export function calculateEnhancedPhylogeneticMetrics(lineageData) {
  return {
    // Core tree size metrics
    treeSize: calculateTreeSizeDistribution(lineageData),
    
    // Branch length analysis
    branchLengths: calculateEnhancedBranchLengthMetrics(lineageData),
    
    // Branching patterns
    branchingPatterns: analyzeBranchingPatterns(lineageData),
    
    // Density-dependence analysis
    densityDependence: analyzeDensityDependenceEnhanced(lineageData),
    
    // Extinction analysis
    extinctions: analyzeExtinctions(lineageData),
    
    // Terrain adaptability
    terrainAdaptability: analyzeTerrainAdaptabilityEnhanced(lineageData)
  };
}