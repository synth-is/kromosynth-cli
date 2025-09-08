// Compatibility shim: re-export the consolidated, feature-aware APIs
export {
  initializeKuzuDBWithFeatures as initializeKuzuDB,
  populateKuzuDBWithLineageAndFeatures as populateKuzuDBWithLineage,
  findDescendants,
  getDatabaseStats,
  // keep advanced exports available too
  detectFeatureDimensions,
  getDatabaseStatsWithFeatures,
  findSimilarSounds
} from './kuzu-db-integration-with-features.js';
