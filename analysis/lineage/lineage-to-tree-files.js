import { saveTreeToJson } from "./tree-serialization.js";
import { buildSimplifiedTree } from "./phylogenetic-tree-common.js";
import fs from 'fs';

// read in lineage data from JSON file supplied as first argument
const data = JSON.parse(fs.readFileSync(process.argv[2]));
const outputDir = process.argv[3];

data.evoRuns[0].iterations.forEach((iteration, index) => {
  const iterationId = iteration.id;
  console.log(`Processing iteration ${index + 1} of ${data.evoRuns[0].iterations.length} (${iterationId})`);

  const treeDataAll = buildSimplifiedTree(data, Infinity, false, null, index, true, true);
  saveTreeToJson(treeDataAll, data, index, outputDir, '_all', true); // Use compression
  // const treeDataMusical = buildSimplifiedTree(data, Infinity, false, null, index, true, false);
  // saveTreeToJson(treeDataMusical, data, index, outputDir, '_musical', true); // Use compression
  // const treeDataNonMusical = buildSimplifiedTree(data, Infinity, false, null, index, false, true);
  // saveTreeToJson(treeDataNonMusical, data, index, outputDir, '_nonmusical', true); // Use compression
});