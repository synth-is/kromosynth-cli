import fs from 'fs';
import path from 'path';
import { writeCompressedJSON } from '../../cli-app/util/qd-common-elite-map-persistence.js';

function serializeTreeToJson(node) {
  return {
    name: node.name,
    id: node.id,
    count: node.count,
    s: node.s,
    gN: node.gN,
    uBC: node.uBC,
    class: node.class,
    duration: node.duration,
    noteDelta: node.noteDelta,
    velocity: node.velocity,
    children: node.children ? node.children.map(serializeTreeToJson) : []
  };
}

export function saveTreeToJson(root, data, iteration = 0, outputDir = './output', fileNameSuffix = '', compress = true) {
  const iterationId = data.evoRuns[0].iterations[iteration].id;
  const fileName = `tree_${iterationId}${fileNameSuffix}.json`;
  const filePath = path.join(outputDir, fileName);
  const compressedFilePath = `${filePath}.gz`;

  const jsonTree = serializeTreeToJson(root);
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (compress) {
    writeCompressedJSON(compressedFilePath, jsonTree);
    console.log(`Compressed tree saved to ${compressedFilePath}`);
  } else {
    fs.writeFileSync(filePath, JSON.stringify(jsonTree
      // , null, 2
    ));
    console.log(`Tree saved to ${filePath}`);
  }
}