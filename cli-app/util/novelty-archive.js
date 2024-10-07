// Initialize the archive:
/*
const archive = new NoveltyArchive(1000, 0.5, 2); // maxSize, noveltyThreshold, dimensionality - maxSize e.g. 20% of the population for conservative exploration; 50% for more aggressive exploration
 */
// adding new individuals: 
/*
archive.addIfNovel(newIndividual, currentGrid, dimensionalityReductionModel);
*/
// generating offspring: 
/*
const inspiration = archive.getInspiration(currentGrid, dimensionalityReductionModel); // inspiration rate e.g. 20%, or could be adaptive
if (inspiration) {
  // Use inspiration for mutation or crossover
}
*/
// After retraining the dimensionality reduction model:
/*
archive.updateArchive(currentGrid, dimensionalityReductionModel);
*/

import fs from 'fs/promises';

export default class NoveltyArchive {
  constructor(maxSize, noveltyThreshold, dimensionality = 2, gridSize = [100, 100]) {
    this.archive = [];
    this.maxSize = maxSize;
    this.noveltyThreshold = noveltyThreshold;
    this.dimensionality = dimensionality;
    this.gridSize = gridSize;
    this.projectedDescriptors = new Map(); // Cache for projected descriptors
    this.lastUpdateGeneration = -1; // Track when the archive was last updated
  }

  async addIfNovel(individual, currentGrid, dimensionalityReductionModel) {
    const noveltyScore = await this.calculateNoveltyScore(individual, currentGrid, dimensionalityReductionModel);
    if (noveltyScore > this.noveltyThreshold) {
      individual.addedGeneration = currentGrid.generationNumber;
      const featuresKey = this.getFeatureKey(individual.features);
      if (!this.projectedDescriptors.has(featuresKey)) {
        const projected = await dimensionalityReductionModel.project(individual.features);
        this.projectedDescriptors.set(featuresKey, projected);
      }
      individual.behaviorDescriptor = this.projectedDescriptors.get(featuresKey);
      this.archive.push(individual);
      if (this.archive.length > this.maxSize) {
        this.removeOldestIndividual();
      }
      return true;
    }
    return false;
  }

  async calculateNoveltyScore(individual, currentGrid, dimensionalityReductionModel) {
    // Ensure the individual has a behavior descriptor
    if (!individual.behaviorDescriptor) {
      individual.behaviorDescriptor = await dimensionalityReductionModel.project(individual.features);
    }

    const k = 5; // Number of nearest neighbors to consider
    const distances = [];

    // Calculate distances to individuals in the archive
    for (const archivedIndividual of this.archive) {
      distances.push(await this.calculateDistance(individual, archivedIndividual, dimensionalityReductionModel));
    }

    // Calculate distances to individuals in the current grid
    for (const cellKey in currentGrid.cells) {
      if (currentGrid.cells[cellKey].elts.length > 0) {
        const cellIndividual = { 
          behaviorDescriptor: this.getBehaviorDescriptorFromCellKey(cellKey),
          features: currentGrid.cells[cellKey].elts[0].features
        };
        distances.push(await this.calculateDistance(individual, cellIndividual, dimensionalityReductionModel));
      }
    }

    // Sort distances and calculate average distance to k-nearest neighbors
    distances.sort((a, b) => a - b);
    const averageDistance = distances.slice(0, k).reduce((sum, dist) => sum + dist, 0) / k;

    return averageDistance;
  }

  async calculateDistance(individual1, individual2, dimensionalityReductionModel) {
    // Ensure both individuals have behavior descriptors
    if (!individual1.behaviorDescriptor) {
      individual1.behaviorDescriptor = await dimensionalityReductionModel.project(individual1.features);
    }
    if (!individual2.behaviorDescriptor) {
      individual2.behaviorDescriptor = await dimensionalityReductionModel.project(individual2.features);
    }

    // Euclidean distance between behavior descriptors
    const distance = Math.sqrt(
      individual1.behaviorDescriptor.reduce((sum, value, index) => {
        const diff = value - individual2.behaviorDescriptor[index];
        return sum + diff * diff;
      }, 0)
    );
    if( isNaN(distance) ) {
      console.error("distance is NaN")
    }
    return distance;
  }

  removeOldestIndividual() {
    this.archive.sort((a, b) => a.addedGeneration - b.addedGeneration);
    const removed = this.archive.shift(); // Remove the oldest individual
    const featuresKey = this.getFeatureKey(removed.features);
    this.projectedDescriptors.delete(featuresKey); // Remove from cache
  }


  async getInspiration(currentGrid, dimensionalityReductionModel) {
    // Check if we need to update projections and scores
    if (currentGrid.generationNumber !== this.lastUpdateGeneration) {
      await this.updateProjectionsAndScores(currentGrid, dimensionalityReductionModel);
    }

    // Find the individual with the highest relevance score
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const individual of this.archive) {
      if (individual.relevanceScore > bestScore) {
        bestScore = individual.relevanceScore;
        bestCandidate = individual;
      }
    }

    return bestCandidate;
  }

  async updateProjectionsAndScores(currentGrid, dimensionalityReductionModel) {
    const featuresToProject = [];
    const individualsToUpdate = [];

    for (const individual of this.archive) {
      const featuresKey = this.getFeatureKey(individual.features);
      if (!this.projectedDescriptors.has(featuresKey)) {
        featuresToProject.push(individual.features);
        individualsToUpdate.push(individual);
      }
    }

    if (featuresToProject.length > 0) {
      const projectedDescriptors = await dimensionalityReductionModel.projectBatch(featuresToProject);
      for (let i = 0; i < projectedDescriptors.length; i++) {
        const individual = individualsToUpdate[i];
        const featuresKey = this.getFeatureKey(individual.features);
        this.projectedDescriptors.set(featuresKey, projectedDescriptors[i]);
      }
    }

    // Calculate relevance scores
    for (const individual of this.archive) {
      const featuresKey = this.getFeatureKey(individual.features);
      const behaviorDescriptor = this.projectedDescriptors.get(featuresKey);
      individual.relevanceScore = await this.calculateRelevanceScore(individual, currentGrid, behaviorDescriptor);
    }

    this.lastUpdateGeneration = currentGrid.generationNumber;
  }

  getFeatureKey(features) {
    // Create a unique key for the features array
    return features.join(',');
  }


  async calculateRelevanceScore(individual, currentGrid, behaviorDescriptor) {
    const cellKey = this.getCellKey(behaviorDescriptor);
    
    let score = 0;
    
    // Check if the exact cell is unoccupied
    if (!currentGrid.cells[cellKey]?.elts?.length) {
      score += 1;
    }
    
    // Check neighboring cells
    const neighborhoodScore = this.calculateNeighborhoodScore(cellKey, currentGrid);
    score += neighborhoodScore;
    
    // Consider distance to nearest occupied cell
    const distanceScore = this.calculateDistanceScore(cellKey, currentGrid);
    score += distanceScore;
    
    // Factor in the individual's fitness relative to occupied cells
    const fitnessScore = this.calculateFitnessScore(individual, currentGrid);
    score += fitnessScore;
    
    // Consider how long the individual has been in the archive
    const ageScore = this.calculateAgeScore(individual, currentGrid.generationNumber);
    score += ageScore;
    
    return score;
  }

  calculateNeighborhoodScore(cellKey, currentGrid) {
    const neighbors = this.getNeighboringCells(cellKey);
    const emptyNeighbors = neighbors.filter(neighbor => {
      // console.log("---neighbor", neighbor, ", currentGrid.cells[neighbor]:", currentGrid.cells[neighbor])
      return !currentGrid.cells[neighbor].elts.length
    } );
    return emptyNeighbors.length / neighbors.length;
  }

  calculateDistanceScore(cellKey, currentGrid) {
    const distance = this.getDistanceToNearestOccupiedCell(cellKey, currentGrid);
    return 1 - Math.min(1, 1 / (distance + 1));
  }

  calculateFitnessScore(individual, currentGrid) {
    const averageFitness = this.getAverageFitness(currentGrid);
    return Math.max(0, (individual.s - averageFitness) / averageFitness);
  }

  calculateAgeScore(individual, currentGeneration) {
    const age = currentGeneration - individual.addedGeneration;
    const maxAge = 100; // Example max age
    return 1 - Math.min(1, age / maxAge);
  }

  getCellKey(behaviorDescriptor) {
    if( behaviorDescriptor === undefined ) {
      console.error("error")
    }
    return behaviorDescriptor.map(Math.floor).join('_');
  }

  getBehaviorDescriptorFromCellKey(cellKey) {
    return cellKey.split('_').map(Number);
  }

  getNeighboringCells(cellKey) {
    const coordinates = cellKey.split('_').map(Number);
    const neighbors = [];

    const ranges = this.gridSize.map(size => ({min: 0, max: size - 1}));

    const addNeighbor = (...coords) => {
      if (coords.every((coord, i) => coord >= ranges[i].min && coord <= ranges[i].max)) {
        neighbors.push(coords.join('_'));
      }
    };

    if (this.dimensionality === 2) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i !== 0 || j !== 0) {
            addNeighbor(coordinates[0] + i, coordinates[1] + j);
          }
        }
      }
    } else if (this.dimensionality === 3) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (let k = -1; k <= 1; k++) {
            if (i !== 0 || j !== 0 || k !== 0) {
              addNeighbor(coordinates[0] + i, coordinates[1] + j, coordinates[2] + k);
            }
          }
        }
      }
    }

    return neighbors;
  }

  getDistanceToNearestOccupiedCell(cellKey, currentGrid) {
    const coordinates = cellKey.split('_').map(Number);
    let minDistance = Infinity;

    for (const occupiedCellKey in currentGrid.cells) {
      if (currentGrid.cells[occupiedCellKey].elts.length > 0) {
        const occupiedCoordinates = occupiedCellKey.split('_').map(Number);
        const distance = Math.sqrt(
          coordinates.reduce((sum, coord, index) => {
            const diff = coord - occupiedCoordinates[index];
            return sum + diff * diff;
          }, 0)
        );
        minDistance = Math.min(minDistance, distance);
      }
    }

    return minDistance;
  }

  getAverageFitness(currentGrid) {
    let totalFitness = 0;
    let count = 0;

    for (const cellKey in currentGrid.cells) {
      if (currentGrid.cells[cellKey].elts.length > 0) {
        totalFitness += currentGrid.cells[cellKey].elts[0].s;
        count++;
      }
    }

    return count > 0 ? totalFitness / count : 0;
  }

  async updateArchive(currentGrid, dimensionalityReductionModel) {
    // Always clear the cache
    this.projectedDescriptors.clear();

    // Update projections and scores
    await this.updateProjectionsAndScores(currentGrid, dimensionalityReductionModel);

    // Sort based on pre-calculated relevance scores
    this.archive.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Optionally, trim the archive here if you want to keep only the most relevant individuals
    if (this.archive.length > this.maxSize) {
      const removedIndividuals = this.archive.splice(this.maxSize);
      // Remove projections of trimmed individuals from the cache
      for (const individual of removedIndividuals) {
        const featuresKey = this.getFeatureKey(individual.features);
        this.projectedDescriptors.delete(featuresKey);
      }
    }
  }


  ///// persistence methods /////

  static ARCHIVE_FILE_NAME = 'elite_novelty_archive.json';

  async saveToFile(fileBasePath) {
    const filePath = fileBasePath + NoveltyArchive.ARCHIVE_FILE_NAME;
    const data = {
      archive: this.archive,
      maxSize: this.maxSize,
      noveltyThreshold: this.noveltyThreshold,
      dimensionality: this.dimensionality
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`NoveltyArchive saved to ${filePath}`);
    } catch (error) {
      console.error(`Error saving NoveltyArchive to ${filePath}:`, error);
    }
  }

  static async loadFromFile(fileBasePath) {
    const filePath = fileBasePath + NoveltyArchive.ARCHIVE_FILE_NAME;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(data);

      const archive = new NoveltyArchive(
        parsedData.maxSize,
        parsedData.noveltyThreshold,
        parsedData.dimensionality
      );

      archive.archive = parsedData.archive;

      console.log(`NoveltyArchive loaded from ${filePath}`);
      return archive;
    } catch (error) {
      console.error(`Error loading NoveltyArchive from ${filePath}:`, error);
      return null;
    }
  }

  async saveCheckpoint(checkpointDir, generation) {
    const fileName = `novelty_archive_gen_${generation}.json`;
    const filePath = path.join(checkpointDir, fileName);
    await this.saveToFile(filePath);
  }

  static async loadLatestCheckpoint(checkpointDir) {
    try {
      const files = await fs.readdir(checkpointDir);
      const checkpointFiles = files.filter(file => file.startsWith('novelty_archive_gen_') && file.endsWith('.json'));

      if (checkpointFiles.length === 0) {
        console.log('No checkpoint files found.');
        return null;
      }

      checkpointFiles.sort((a, b) => {
        const genA = parseInt(a.match(/novelty_archive_gen_(\d+)\.json/)[1]);
        const genB = parseInt(b.match(/novelty_archive_gen_(\d+)\.json/)[1]);
        return genB - genA;
      });

      const latestCheckpoint = checkpointFiles[0];
      const filePath = path.join(checkpointDir, latestCheckpoint);
      return await NoveltyArchive.loadFromFile(filePath);
    } catch (error) {
      console.error('Error loading latest checkpoint:', error);
      return null;
    }
  }
}