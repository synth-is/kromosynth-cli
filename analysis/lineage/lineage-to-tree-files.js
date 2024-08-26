import { saveTreeToJson } from "./tree-serialization.js";
import { buildSimplifiedTree } from "./phylogenetic-tree-common.js";
import fs from 'fs';

// read in lineage data from JSON file supplied as first argument
const data = JSON.parse(fs.readFileSync(process.argv[2]));

data.evoRuns[0].iterations.forEach((iteration, index) => {
  const iterationId = iteration.id;
  console.log(`Processing iteration ${index + 1} of ${data.evoRuns[0].iterations.length} (${iterationId})`);

  const treeDataAll = buildSimplifiedTree(data, Infinity, false, null, index, true, true);
  saveTreeToJson(treeDataAll, data, index, './lineageTrees', '_all');
  const treeDataMusical = buildSimplifiedTree(data, Infinity, false, null, index, true, false);
  saveTreeToJson(treeDataMusical, data, index, './lineageTrees', '_musical');
  const treeDataNonMusical = buildSimplifiedTree(data, Infinity, false, null, index, false, true);
  saveTreeToJson(treeDataNonMusical, data, index, './lineageTrees', '_nonmusical');
});