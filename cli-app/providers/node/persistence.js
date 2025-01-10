import {
  createEvoRunDir,
  readGenomeAndMetaFromDisk,
  saveEliteMapToDisk, readEliteMapFromDisk, saveEliteMapMetaToDisk, readEliteMapMetaFromDisk,
  saveCellFeaturesToDisk, readCellFeaturesFromDiskForEliteMap, readFeaturesForGenomeIdsFromDisk, 
  getEliteGenomeIdsFromEliteMaps, 
  saveGenomeToDisk, getEliteMapKey,
  saveLostFeaturesToDisk, readAllLostFeaturesFromDisk,
  saveCellFeaturesAtGenerationToDisk
} from '../../util/qd-common-elite-map-persistence.js';
export class NodePersistenceProvider {
  createEvoRunDir(...args) {
    return createEvoRunDir(...args);
  }
  readGenomeAndMetaFromDisk(...args) {
    return readGenomeAndMetaFromDisk(...args);
  }
  saveEliteMapToDisk(...args) {
    return saveEliteMapToDisk(...args);
  }
  readEliteMapFromDisk(...args) {
    return readEliteMapFromDisk(...args);
  }
  saveEliteMapMetaToDisk(...args) {
    return saveEliteMapMetaToDisk(...args);
  }
  readEliteMapMetaFromDisk(...args) {
    return readEliteMapMetaFromDisk(...args);
  }
  saveCellFeaturesToDisk(...args) {
    return saveCellFeaturesToDisk(...args);
  }
  readCellFeaturesFromDiskForEliteMap(...args) {
    return readCellFeaturesFromDiskForEliteMap(...args);
  }
  readFeaturesForGenomeIdsFromDisk(...args) {
    return readFeaturesForGenomeIdsFromDisk(...args);
  }
  getEliteGenomeIdsFromEliteMaps(...args) {
    return getEliteGenomeIdsFromEliteMaps(...args);
  }
  saveGenomeToDisk(...args) {
    return saveGenomeToDisk(...args);
  }
  getEliteMapKey(...args) {
    return getEliteMapKey(...args);
  }
  saveLostFeaturesToDisk(...args) {
    return saveLostFeaturesToDisk(...args);
  }
  readAllLostFeaturesFromDisk(...args) {
    return readAllLostFeaturesFromDisk(...args);
  }
  saveCellFeaturesAtGenerationToDisk(...args) {
    return saveCellFeaturesAtGenerationToDisk(...args);
  }
}