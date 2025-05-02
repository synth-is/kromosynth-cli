/**
 * Founder and Innovation Analysis
 * Advanced phylogenetic tree analysis focusing on founder genomes and innovation bursts
 * 
 * This module provides helper functions to identify key evolutionary events
 * in the lineage data of MAP-Elites runs. It extracts founder genomes that 
 * spawned many diverse descendants and identifies periods of innovation bursts.
 */

/**
 * Identifies the top N founder genomes based on descendant count and diversity
 * @param {Array} lineageData - The lineage data from QD run
 * @param {number} topN - Number of founder genomes to return (default: 5)
 * @param {boolean} requireDiverseDescendants - Whether to consider diversity of descendants (default: true)
 * @returns {Array} Top founder genomes with their statistics
 */
export function identifyFounderGenomes(lineageData, topN = 5, requireDiverseDescendants = true) {
  // Build parent-child relationships
  const childrenMap = new Map(); // Maps genome IDs to their children
  const genomeMap = new Map(); // Maps genome IDs to their full data
  
  // First, create a map of all genomes for easy lookup
  lineageData.forEach(genome => {
    genomeMap.set(genome.id, genome);
  });
  
  // Then, build the children relationships
  lineageData.forEach(genome => {
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        if (!childrenMap.has(parent.genomeId)) {
          childrenMap.set(parent.genomeId, []);
        }
        childrenMap.get(parent.genomeId).push(genome.id);
      });
    }
  });
  
  // Calculate total descendants for each genome
  const calculateDescendants = (genomeId, visited = new Set()) => {
    if (visited.has(genomeId)) return { count: 0, classes: new Set(), terrains: new Set() };
    
    visited.add(genomeId);
    
    const directChildren = childrenMap.get(genomeId) || [];
    let totalCount = directChildren.length;
    const uniqueClasses = new Set();
    const uniqueTerrains = new Set();
    
    // Add this genome's class and terrain
    const genome = genomeMap.get(genomeId);
    if (genome) {
      uniqueClasses.add(genome.eliteClass);
      uniqueTerrains.add(genome.terrain || "default");
      
      // Add additional terrains if available
      if (genome.terrainAppearances) {
        genome.terrainAppearances.forEach(appearance => {
          uniqueTerrains.add(appearance.terrain);
        });
      }
    }
    
    // Process all children recursively
    directChildren.forEach(childId => {
      const childResult = calculateDescendants(childId, visited);
      totalCount += childResult.count;
      
      // Add child's classes and terrains
      childResult.classes.forEach(cls => uniqueClasses.add(cls));
      childResult.terrains.forEach(terrain => uniqueTerrains.add(terrain));
    });
    
    return { 
      count: totalCount, 
      classes: uniqueClasses, 
      terrains: uniqueTerrains
    };
  };
  
  // Calculate descendants for each potential founder
  const founderStats = [];
  
  lineageData.forEach(genome => {
    // Only consider genomes that have children as potential founders
    if (childrenMap.has(genome.id) && childrenMap.get(genome.id).length > 0) {
      const descendantInfo = calculateDescendants(genome.id, new Set());
      
      // Skip if we require diverse descendants and there's only one class
      if (requireDiverseDescendants && descendantInfo.classes.size <= 1) {
        return;
      }
      
      founderStats.push({
        id: genome.id,
        eliteClass: genome.eliteClass,
        generation: genome.gN,
        terrain: genome.terrain || "default",
        score: genome.s,
        descendantCount: descendantInfo.count,
        uniqueClassCount: descendantInfo.classes.size,
        uniqueTerrainCount: descendantInfo.terrains.size,
        // Calculate a "founder score" that weights diversity of descendants
        founderScore: descendantInfo.count * 
                     (descendantInfo.classes.size + descendantInfo.terrains.size) / 2
      });
    }
  });
  
  // Sort by founder score (descendant count weighted by diversity)
  founderStats.sort((a, b) => b.founderScore - a.founderScore);
  
  // Return the top N founders
  return founderStats.slice(0, topN);
}

/**
 * Identifies generations with significant innovation bursts
 * @param {Array} lineageData - The lineage data from QD run
 * @param {number} burstThreshold - Threshold for considering a burst (multiplier above average rate)
 * @param {number} topN - Number of bursts to return (default: 5)
 * @returns {Array} Top innovation bursts with their statistics
 */
export function identifyInnovationBursts(lineageData, burstThreshold = 1.5, topN = 5) {
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
  
  // Calculate innovation rates between consecutive generations
  const innovationRates = [];
  let totalNewClasses = 0;
  
  // Track classes seen up to each generation
  const classesSeen = new Set();
  const terrainsSeen = new Set();
  
  generations.forEach((gen, index) => {
    const currentGenomes = genomesByGeneration[gen];
    
    // Count new unique elite classes in this generation
    const newClasses = new Set();
    const newTerrains = new Set();
    
    currentGenomes.forEach(genome => {
      if (!classesSeen.has(genome.eliteClass)) {
        newClasses.add(genome.eliteClass);
        classesSeen.add(genome.eliteClass);
      }
      
      // Count terrain appearances
      if (genome.terrainAppearances) {
        genome.terrainAppearances.forEach(appearance => {
          if (!terrainsSeen.has(appearance.terrain)) {
            newTerrains.add(appearance.terrain);
            terrainsSeen.add(appearance.terrain);
          }
        });
      } else if (genome.terrain && !terrainsSeen.has(genome.terrain)) {
        newTerrains.add(genome.terrain);
        terrainsSeen.add(genome.terrain);
      }
    });
    
    // Calculate branching rate for this generation
    if (index > 0) {
      const prevGen = generations[index - 1];
      const prevCount = genomesByGeneration[prevGen].length;
      const currentCount = currentGenomes.length;
      
      const branchingRate = prevCount > 0 ? currentCount / prevCount : 0;
      
      innovationRates.push({
        generation: gen,
        genomeCount: currentCount,
        newClassCount: newClasses.size,
        newTerrainCount: newTerrains.size,
        branchingRate,
        // Add more innovation metrics
        noveltyScore: (branchingRate * (1 + newClasses.size)) // Weighted by new class discovery
      });
    }
  });
  
  // Calculate average branching rate
  const avgBranchingRate = innovationRates.reduce((sum, rate) => sum + rate.branchingRate, 0) / 
                         innovationRates.length;
  
  // Identify bursts (rates significantly above average)
  const bursts = innovationRates
    .filter(rate => rate.branchingRate > avgBranchingRate * burstThreshold)
    .map(rate => ({
      ...rate,
      // How many times above average this burst is
      burstMagnitude: rate.branchingRate / avgBranchingRate
    }))
    .sort((a, b) => b.noveltyScore - a.noveltyScore);
  
  return {
    averageBranchingRate: avgBranchingRate,
    topBursts: bursts.slice(0, topN),
    allInnovationRates: innovationRates
  };
}

/**
 * Generates visualization data for a founder genome's descendant tree
 * @param {Array} lineageData - The lineage data from QD run
 * @param {string} founderGenomeId - ID of the founder genome
 * @returns {Object} Tree visualization data
 */
export function generateFounderDescendantTree(lineageData, founderGenomeId) {
  // Build lookup maps
  const genomeMap = new Map();
  const childrenMap = new Map();
  
  // Build genome lookup
  lineageData.forEach(genome => {
    genomeMap.set(genome.id, genome);
  });
  
  // Build children relationships
  lineageData.forEach(genome => {
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        if (!childrenMap.has(parent.genomeId)) {
          childrenMap.set(parent.genomeId, []);
        }
        childrenMap.get(parent.genomeId).push(genome.id);
      });
    }
  });
  
  // Make sure the founder exists
  if (!genomeMap.has(founderGenomeId)) {
    return null;
  }
  
  // Recursively build tree
  const buildTree = (genomeId, depth = 0, maxDepth = 10) => {
    if (depth > maxDepth) return null; // Prevent infinite recursion
    
    const genome = genomeMap.get(genomeId);
    if (!genome) return null;
    
    const children = childrenMap.get(genomeId) || [];
    const childNodes = children
      .map(childId => buildTree(childId, depth + 1, maxDepth))
      .filter(node => node !== null);
    
    return {
      id: genome.id,
      name: `${genome.eliteClass} (Gen ${genome.gN})`,
      eliteClass: genome.eliteClass,
      generation: genome.gN,
      score: genome.s,
      terrain: genome.terrain || "default",
      children: childNodes
    };
  };
  
  // Build the descendant tree starting from the founder
  const founderTree = buildTree(founderGenomeId);
  
  // Calculate some statistics about the tree
  const countDescendants = (node) => {
    if (!node) return { count: 0, classes: new Set(), terrains: new Set() };
    
    let totalCount = 1; // Count this node
    const uniqueClasses = new Set([node.eliteClass]);
    const uniqueTerrains = new Set([node.terrain]);
    
    // Count all children
    node.children.forEach(child => {
      const childResult = countDescendants(child);
      totalCount += childResult.count;
      
      // Add child's classes and terrains
      childResult.classes.forEach(cls => uniqueClasses.add(cls));
      childResult.terrains.forEach(terrain => uniqueTerrains.add(terrain));
    });
    
    return {
      count: totalCount,
      classes: uniqueClasses,
      terrains: uniqueTerrains
    };
  };
  
  const treeStats = countDescendants(founderTree);
  
  return {
    tree: founderTree,
    stats: {
      totalDescendants: treeStats.count - 1, // Subtract the founder itself
      uniqueClassCount: treeStats.classes.size,
      uniqueTerrainCount: treeStats.terrains.size
    }
  };
}

/**
 * Generates visualization data for innovation bursts over time
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Object} Innovation timeline visualization data
 */
export function generateInnovationBurstTimeline(lineageData) {
  // Get innovation bursts
  const { allInnovationRates, averageBranchingRate, topBursts } = 
        identifyInnovationBursts(lineageData, 1.5, 10);
  
  // Prepare timeline data
  const timelineData = allInnovationRates.map(rate => ({
    generation: rate.generation,
    branchingRate: rate.branchingRate,
    newClassCount: rate.newClassCount,
    newTerrainCount: rate.newTerrainCount || 0,
    // Flag if this is a burst point
    isBurst: rate.branchingRate > averageBranchingRate * 1.5,
    // Calculate highlight intensity (for visualization)
    burstIntensity: rate.branchingRate / averageBranchingRate
  }));
  
  // Group genomes by generation for additional context
  const genomesByGeneration = {};
  lineageData.forEach(genome => {
    if (!genomesByGeneration[genome.gN]) {
      genomesByGeneration[genome.gN] = [];
    }
    genomesByGeneration[genome.gN].push(genome);
  });
  
  // Find peak innovation points
  const innovationPeaks = topBursts.map(burst => {
    // Get genomes from this burst generation
    const burstGenomes = genomesByGeneration[burst.generation] || [];
    
    // For each burst, identify potential breakthrough genomes
    // (genomes with high scores or that appeared in multiple terrains)
    const notableGenomes = burstGenomes
      .filter(genome => {
        // Consider a genome notable if it has high score or multiple terrain appearances
        return genome.s > 0.7 || // High score
               (genome.terrainAppearances && genome.terrainAppearances.length > 1); // Multiple terrains
      })
      .slice(0, 5); // Limit to 5 notable genomes per burst
    
    return {
      generation: burst.generation,
      branchingRate: burst.branchingRate,
      burstMagnitude: burst.burstMagnitude,
      newClassCount: burst.newClassCount,
      notableGenomes: notableGenomes.map(g => ({
        id: g.id,
        eliteClass: g.eliteClass,
        score: g.s,
        terrain: g.terrain || "default"
      }))
    };
  });
  
  return {
    timeline: timelineData,
    innovationPeaks,
    averageBranchingRate
  };
}

/**
 * Performs a comprehensive founder and innovation analysis
 * @param {Object} evoRunConfig - Configuration for the evolutionary run
 * @param {string} evoRunId - ID of the evolutionary run
 * @param {Array} lineage - Optional lineage data if already available
 * @param {boolean} saveToFile - Whether to save results to a file
 * @returns {Object} Comprehensive founder and innovation analysis
 */
export async function analyzeFoundersAndInnovations(evoRunConfig, evoRunId, lineage, saveToFile = true) {
  const fs = await import('fs');
  const path = await import('path');
  
  // Import path utilities from your existing code if needed
  const { getEvoRunDirPath } = await import('./util/qd-common.js');
  const { getLineageGraphData } = await import('./qd-run-analysis.js');
  
  console.log(`Analyzing founder genomes and innovation bursts for run ${evoRunId}...`);
  
  // Get lineage data if not provided
  const lineageData = lineage || await getLineageGraphData(evoRunConfig, evoRunId);
  
  // Perform analysis
  const topFounders = identifyFounderGenomes(lineageData, 10);
  const innovationBursts = identifyInnovationBursts(lineageData, 1.5, 10);
  
  // Generate visualization data for the top founder
  let founderVisualizations = [];
  if (topFounders.length > 0) {
    // Generate trees for top 3 founders
    founderVisualizations = topFounders.slice(0, 3).map(founder => ({
      founderInfo: founder,
      descendantTree: generateFounderDescendantTree(lineageData, founder.id)
    }));
  }
  
  // Generate innovation burst timeline
  const innovationTimeline = generateInnovationBurstTimeline(lineageData);
  
  // Combine results
  const analysis = {
    topFounders,
    innovationBursts,
    founderVisualizations,
    innovationTimeline
  };
  
  if (saveToFile) {
    // Save to file
    const analysisStringified = JSON.stringify(analysis, null, 2);
    const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
    const analysisFilePath = `${evoRunDirPath}founder-innovation-analysis.json`;
    fs.writeFileSync(analysisFilePath, analysisStringified);
    console.log(`Saved founder and innovation analysis to ${analysisFilePath}`);
  }
  
  return analysis;
}




/**
 * Examines lineage data to find concrete examples of stepping stones
 * @param {Array} lineageData - The lineage data from QD run
 * @returns {Array} Examples of stepping stones with their impact
 */
export function findConcreteSteppingStoneExamples(lineageData) {
  // Build ancestor-descendant relationships
  const descendantsMap = new Map(); // Maps genome IDs to their descendants
  const ancestorsMap = new Map();   // Maps genome IDs to their ancestors
  const genomeMap = new Map();      // Maps genome IDs to their data
  
  // Build genome lookup
  lineageData.forEach(genome => {
    genomeMap.set(genome.id, genome);
    descendantsMap.set(genome.id, []);
  });
  
  // Build relationships
  lineageData.forEach(genome => {
    if (genome.parents && genome.parents.length > 0) {
      genome.parents.forEach(parent => {
        if (descendantsMap.has(parent.genomeId)) {
          descendantsMap.get(parent.genomeId).push(genome.id);
        }
        
        if (!ancestorsMap.has(genome.id)) {
          ancestorsMap.set(genome.id, []);
        }
        ancestorsMap.get(genome.id).push(parent.genomeId);
      });
    }
  });
  
  // Find potential stepping stones
  // These are genomes that have many diverse descendants
  const steppingStones = [];
  
  lineageData.forEach(genome => {
    // Skip very recent genomes
    const maxGeneration = Math.max(...lineageData.map(g => g.gN));
    if (genome.gN > maxGeneration * 0.7) return;
    
    // Count descendants
    const descendants = collectAllDescendants(genome.id, descendantsMap);
    if (descendants.length < 3) return; // Skip genomes with few descendants
    
    // Check descendant diversity
    const classes = new Set();
    const terrains = new Set();
    
    descendants.forEach(descId => {
      const descendant = genomeMap.get(descId);
      if (descendant) {
        classes.add(descendant.eliteClass);
        terrains.add(descendant.terrain || "default");
        
        if (descendant.terrainAppearances) {
          descendant.terrainAppearances.forEach(t => {
            terrains.add(t.terrain);
          });
        }
      }
    });
    
    // Only consider as stepping stones if descendants are diverse
    if (classes.size < 2 && terrains.size < 2) return;
    
    // Calculate how "enabling" this genome was
    // by looking at how many high-performing descendants it led to
    const highPerformingDescendants = descendants
      .map(id => genomeMap.get(id))
      .filter(desc => desc && desc.s > 0.7)
      .length;
    
    // Calculate a "stepping stone score"
    const steppingStoneScore = descendants.length * classes.size * terrains.size;
    
    // If score is significant, add to the list
    if (steppingStoneScore > 10) {
      steppingStones.push({
        id: genome.id,
        eliteClass: genome.eliteClass,
        generation: genome.gN,
        score: genome.s,
        descendantCount: descendants.length,
        uniqueClassCount: classes.size,
        uniqueTerrainCount: terrains.size,
        highPerformingDescendantCount: highPerformingDescendants,
        steppingStoneScore
      });
    }
  });
  
  // Sort by stepping stone score
  steppingStones.sort((a, b) => b.steppingStoneScore - a.steppingStoneScore);
  
  return steppingStones.slice(0, 10); // Return top 10
}




///// enhanced:

/**
 * Calculates normalized impact scores adjusting for the advantage early genomes have
 * @param {Array} lineageData - The lineage data from QD run
 * @param {Array} founderData - The founder genomes data
 * @returns {Array} Founders with normalized metrics
 */
export function calculateNormalizedFounderImpact(lineageData, founderData) {
  const totalGenerations = Math.max(...lineageData.map(g => g.gN));
  
  return founderData.map(founder => {
    const generationsActive = totalGenerations - founder.generation;
    return {
      ...founder,
      normalizedImpact: founder.founderScore / generationsActive,
      effectiveGenerations: generationsActive
    };
  }).sort((a, b) => b.normalizedImpact - a.normalizedImpact);
}

/**
 * Calculates quality improvement factors for founders
 * @param {Array} lineageData - The lineage data from QD run
 * @param {Array} founderData - The founder genomes data
 * @returns {Array} Founders with quality improvement metrics
 */
export function calculateQualityImprovementFactors(lineageData, founderData, founderIdToDescendants) {
  return founderData.map(founder => {
    // Find all descendants recursively
    const descendants = founderIdToDescendants[founder.id] || findAllDescendants(lineageData, founder.id);
    
    if (descendants.length === 0) {
      return {
        ...founder,
        qualityImprovement: 1,
        avgQualityImprovement: 1
      };
    }
    
    // Calculate average and max fitness of descendants
    const descendantScores = descendants.map(d => d.s || d.score).filter(s => s !== undefined);
    const avgDescendantScore = descendantScores.reduce((sum, s) => sum + s, 0) / descendantScores.length;
    const maxDescendantScore = Math.max(...descendantScores);
    
    return {
      ...founder,
      qualityImprovement: maxDescendantScore / (founder.s || founder.score),
      avgQualityImprovement: avgDescendantScore / (founder.s || founder.score)
    };
  }).sort((a, b) => b.qualityImprovement - a.qualityImprovement);
}

/**
 * Calculates class discovery rate for founder genomes
 * @param {Array} lineageData - The lineage data from QD run
 * @param {Array} founderData - The founder genomes data
 * @returns {Array} Founders with class discovery metrics
 */
export function calculateClassDiscoveryRates(lineageData, founderData, founderIdToDescendants) {
  return founderData.map(founder => {
    // Find all descendants recursively
    const descendants = founderIdToDescendants[founder.id] || findAllDescendants(lineageData, founder.id);
    
    // Extract unique classes
    const uniqueClasses = new Set();
    descendants.forEach(d => {
      if (d.eliteClass) uniqueClasses.add(d.eliteClass);
    });
    
    const generationsActive = Math.max(...lineageData.map(g => g.gN)) - founder.generation;
    
    return {
      ...founder,
      uniqueClassCount: uniqueClasses.size,
      classDiscoveryRate: uniqueClasses.size / Math.max(1, generationsActive)
    };
  }).sort((a, b) => b.classDiscoveryRate - a.classDiscoveryRate);
}



/**
 * Identifies innovation burst patterns across the evolutionary run
 * @param {Array} lineageData - The lineage data from QD run
 * @param {Object} burstData - The innovation bursts data
 * @returns {Object} Enhanced burst pattern analysis
 */
export function analyzeInnovationBurstPatterns(lineageData, burstData) {
  const totalGenerations = Math.max(...lineageData.map(g => g.gN));
  const bursts = burstData.topBursts;
  
  // Calculate temporal distribution of bursts
  const runSegments = 4; // Divide the run into quarters
  const segmentSize = Math.ceil(totalGenerations / runSegments);
  const burstsBySegment = Array(runSegments).fill(0);
  
  bursts.forEach(burst => {
    const segmentIndex = Math.min(runSegments - 1, Math.floor(burst.generation / segmentSize));
    burstsBySegment[segmentIndex]++;
  });
  
  // Calculate burst strength trend
  const burstStrengthsBySegment = Array(runSegments).fill(0);
  const burstCountsBySegment = Array(runSegments).fill(0);
  
  bursts.forEach(burst => {
    const segmentIndex = Math.min(runSegments - 1, Math.floor(burst.generation / segmentSize));
    burstStrengthsBySegment[segmentIndex] += burst.burstMagnitude;
    burstCountsBySegment[segmentIndex]++;
  });
  
  // Calculate average burst strength per segment
  const avgBurstStrengthsBySegment = burstStrengthsBySegment.map((strength, i) => 
    burstCountsBySegment[i] > 0 ? strength / burstCountsBySegment[i] : 0
  );
  
  // Calculate time between bursts
  const burstTimeGaps = [];
  for (let i = 1; i < bursts.length; i++) {
    burstTimeGaps.push(bursts[i].generation - bursts[i-1].generation);
  }
  
  // Calculate correlation between burst magnitude and new classes discovered
  const magnitudes = bursts.map(b => b.burstMagnitude);
  const newClasses = bursts.map(b => b.newClassCount);
  const correlation = calculateCorrelation(magnitudes, newClasses);
  
  return {
    burstDistribution: burstsBySegment,
    burstStrengthTrend: avgBurstStrengthsBySegment,
    averageBurstGap: burstTimeGaps.length > 0 ? 
      burstTimeGaps.reduce((sum, gap) => sum + gap, 0) / burstTimeGaps.length : 0,
    maxBurstGap: burstTimeGaps.length > 0 ? Math.max(...burstTimeGaps) : 0,
    magnitudeToNewClassesCorrelation: correlation,
    lateDiscoveryScore: burstsBySegment[2] + burstsBySegment[3] // Score for late-stage discovery
  };
}

/**
 * Helper function to calculate correlation coefficient
 */
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
  const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;
  
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  
  for (let i = 0; i < x.length; i++) {
    const xDiff = x[i] - meanX;
    const yDiff = y[i] - meanY;
    numerator += xDiff * yDiff;
    denominatorX += xDiff * xDiff;
    denominatorY += yDiff * yDiff;
  }
  
  const denominator = Math.sqrt(denominatorX * denominatorY);
  return denominator === 0 ? 0 : numerator / denominator;
}




/**
 * Optimized version of collectAllDescendants
 * Uses array modification instead of creating new arrays on each recursion
 * 
 * @param {string} genomeId - ID of the genome
 * @param {Map} descendantsMap - Map of genome IDs to their direct descendants
 * @param {Set} visited - Set of already visited genomes
 * @param {Array} result - Array to accumulate results (for recursive calls)
 * @returns {Array} All descendants of the genome
 */
function collectAllDescendants(genomeId, descendantsMap, visited = new Set(), result = []) {
  // Skip already visited genomes
  if (visited.has(genomeId)) return result;
  visited.add(genomeId);
  
  // Get direct descendants
  const directDescendants = descendantsMap.get(genomeId) || [];
  
  // Add direct descendants to result
  for (const descId of directDescendants) {
    result.push(descId);
  }
  
  // Process each direct descendant recursively
  for (const descId of directDescendants) {
    collectAllDescendants(descId, descendantsMap, visited, result);
  }
  
  return result;
}

/**
 * Optimized version of findAllDescendants
 * Pre-processes parent-child relationships for faster lookups
 * Uses a single traversal through lineage data
 * 
 * @param {Array} lineageData - Full lineage data
 * @param {string} genomeId - ID of the ancestor genome
 * @param {Set} visited - Set of already visited genomes
 * @param {Map} childrenMapCache - Optional cache of parent-child relationships
 * @returns {Array} All descendants of the genome
 */
export function findAllDescendants(
  lineageData, 
  genomeId, 
  visited = new Set(), 
  childrenMapCache = null
) {
  // Build parent-child map if not provided (only once)
  const childrenMap = childrenMapCache || buildChildrenMap(lineageData);
  
  // Use optimized collectAllDescendants with the map
  return collectDescendantsWithFullData(genomeId, childrenMap, lineageData, visited);
}

/**
 * Helper to build a map of parent IDs to arrays of child objects
 * This preprocessing step makes the recursive descent much faster
 */
function buildChildrenMap(lineageData) {
  const childrenMap = new Map();
  
  for (const genome of lineageData) {
    if (genome.parents && genome.parents.length > 0) {
      for (const parent of genome.parents) {
        if (!childrenMap.has(parent.genomeId)) {
          childrenMap.set(parent.genomeId, []);
        }
        childrenMap.get(parent.genomeId).push(genome);
      }
    }
  }
  
  return childrenMap;
}

/**
 * Collects descendants with full genome data, not just IDs
 */
function collectDescendantsWithFullData(genomeId, childrenMap, lineageData, visited = new Set(), result = []) {
  if (visited.has(genomeId)) return result;
  visited.add(genomeId);
  
  const children = childrenMap.get(genomeId) || [];
  
  // Add direct children to result
  for (const child of children) {
    result.push(child);
  }
  
  // Process each child recursively
  for (const child of children) {
    collectDescendantsWithFullData(child.id, childrenMap, lineageData, visited, result);
  }
  
  return result;
}

/**
 * Memory-efficient version that avoids creating unnecessary arrays
 * Useful for very large lineage trees
 * Returns only the count of descendants if that's all that's needed
 */
export function countAllDescendants(genomeId, descendantsMap, visited = new Set()) {
  if (visited.has(genomeId)) return 0;
  visited.add(genomeId);
  
  const directDescendants = descendantsMap.get(genomeId) || [];
  let count = directDescendants.length;
  
  for (const descId of directDescendants) {
    count += countAllDescendants(descId, descendantsMap, visited);
  }
  
  return count;
}

/**
 * Memoized version of findAllDescendants
 * Caches results to avoid recalculating the same subtrees
 */
export function memoizedFindAllDescendants(lineageData) {
  const childrenMap = buildChildrenMap(lineageData);
  const cache = new Map();
  
  return function findDescendants(genomeId, visited = new Set()) {
    // Return from cache if available
    if (cache.has(genomeId)) {
      return [...cache.get(genomeId)]; // Return a copy to prevent mutation
    }
    
    if (visited.has(genomeId)) return [];
    visited.add(genomeId);
    
    const result = [];
    const children = childrenMap.get(genomeId) || [];
    
    // Add direct children
    for (const child of children) {
      result.push(child);
    }
    
    // Process each child recursively
    for (const child of children) {
      const childDescendants = findDescendants(child.id, visited);
      for (const descendant of childDescendants) {
        result.push(descendant);
      }
    }
    
    // Cache the result
    cache.set(genomeId, [...result]); // Store a copy to prevent mutation
    return result;
  };
}