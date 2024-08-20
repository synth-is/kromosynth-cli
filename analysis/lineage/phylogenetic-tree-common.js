import { yamnetTags_musical, yamnetTags_non_musical } from './yamnetMusicalTags.js';

function normalizeClassName(className) {
  return className.replace('YAM_', '').split('_')[0];
}

function isMusicalClass(className) {
  const normalizedName = normalizeClassName(className);
  return yamnetTags_musical.some(tag => normalizedName.includes(tag));
}

function findLatestDescendantsByClass(data, suffixFilter = null) {
  const classMap = new Map();
  
  data.evoRuns[0].iterations[0].lineage.forEach(item => {
      const normalizedClass = normalizeClassName(item.eliteClass);
      if (
        (!classMap.has(normalizedClass) || item.gN > classMap.get(normalizedClass).gN)
        && (!suffixFilter || normalizedClass.endsWith(suffixFilter))
      ) {
          classMap.set(normalizedClass, item);
      }
  });

  console.log(`Total unique classes: ${classMap.size}`);
  console.log(`Musical classes: ${Array.from(classMap.values()).filter(item => isMusicalClass(item.eliteClass)).length}`);

  return Array.from(classMap.values()).filter(item => isMusicalClass(item.eliteClass));
}

function traceLineage(data, descendant, maxDepth = Infinity) {
  const lineage = [];
  let current = descendant;
  let depth = 0;
  
  while (current && depth < maxDepth) {
      lineage.push(current);
      if (current.parents.length === 0) break;
      
      const parentId = current.parents[0].genomeId;
      const parentEliteClass = current.parents[0].eliteClass;
      // compare eliteClass to ensure we're following the correct parent; the same genome could have won multiple classes, as an elite
      current = data.evoRuns[0].iterations[0].lineage.find(item => item.id === parentId && item.eliteClass === parentEliteClass);
      depth++;
  }
  
  return lineage.reverse();
}

export function buildSimplifiedTree(data, maxDepth = Infinity, measureContextSwitches = false, suffixFilter = null ) {
  const root = { name: "root", children: [], count: 0, s: 0, gN: 0 };
  const latestDescendants = findLatestDescendantsByClass(data);

  console.log(`Processing ${latestDescendants.length} latest musical descendants`);

  latestDescendants.forEach((descendant, index) => {
    console.log(`Processing descendant ${index + 1} of ${latestDescendants.length}`);
    const lineage = traceLineage(data, descendant, maxDepth);
    let currentNode = root;
    let prevClass = null;
    let classCount = 0;
    let maxS = 0;
    let maxGN = 0;

    // check if the last item in lineage ends with the suffixFilter, after normalization
    if( ! suffixFilter || suffixFilter && normalizeClassName(lineage[lineage.length - 1].eliteClass).endsWith(suffixFilter) ) {
      let lineageCounter = 0;
      lineage.forEach(item => {

          // TODO: ensure last item in lineage is rendered

          const normalizedClass = normalizeClassName(item.eliteClass);
          
          let isSwitching = false;
          if (measureContextSwitches) {
              let isPreviousMusical = prevClass ? isMusicalClass(prevClass) : false;
              let isCurrentMusical = isMusicalClass(normalizedClass);
              isSwitching = isPreviousMusical !== isCurrentMusical;
          } else {
              isSwitching = normalizedClass !== prevClass;
          }
          if( isSwitching ) {
              // If we're switching classes, add the accumulated data to the previous node
              if (prevClass) {
                  currentNode.count += classCount;
                  currentNode.s = Math.max(currentNode.s, maxS);
                  currentNode.gN = Math.max(currentNode.gN, maxGN);
              }
      
              // Find or create the node for the new class
              let childNode = currentNode.children.find(child => child.name === normalizedClass);
              if (!childNode) {
                  childNode = {
                      name: normalizedClass,
                      children: [],
                      count: 0,
                      s: 0,
                      gN: 0,
                      parent: currentNode
                  };
                  currentNode.children.push(childNode);
              }
              currentNode = childNode;
              prevClass = normalizedClass;
              classCount = 1;
              maxS = item.s;
              maxGN = item.gN;
          } else {
              // If we're staying in the same class, just accumulate the data
              classCount++;
              maxS = Math.max(maxS, item.s);
              maxGN = Math.max(maxGN, item.gN);

              // check if item is the last in lineage
              if( lineageCounter === lineage.length - 1 ) {
                  // Find or create the node for the new class
                  let childNode = currentNode.children.find(child => child.name === normalizedClass);
                  if (!childNode) {
                      childNode = {
                          name: normalizedClass,
                          children: [],
                          count: classCount++,
                          s: Math.max(maxS, item.s),
                          gN: Math.max(maxGN, item.gN),
                          parent: currentNode
                      };
                  }
                  currentNode.parent.children.pop();
                  currentNode.parent.children.push(childNode);
              }
          }
          lineageCounter++;
      });

    }

    // Add the accumulated data for the last class in the lineage
    if (prevClass) {
      currentNode.count += classCount;
      currentNode.s = Math.max(currentNode.s, maxS);
      currentNode.gN = Math.max(currentNode.gN, maxGN);
    }
  });

  console.log(`Built simplified tree with ${countNodes(root)} nodes`);
  return root;
}

function countNodes(node) {
  let count = 1;
  if (node.children) {
      node.children.forEach(child => {
          count += countNodes(child);
      });
  }
  return count;
}