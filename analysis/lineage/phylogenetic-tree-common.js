import { yamnetTags_musical, yamnetTags_non_musical } from './yamnetMusicalTags.js';

function normalizeClassName(className) {
  return className.replace('YAM_', '').split('_')[0];
}

function isMusicalClass(className) {
  const normalizedName = normalizeClassName(className);
  return yamnetTags_musical.some(tag => normalizedName.includes(tag));
}

function findLatestDescendantsByClass(data, suffixFilter = null, iteration = 0, inCategoryMusical = true, inCategoryNonMusical = false, shouldNormaliseClassName = false) {
  const classMap = new Map();
  
  if( data.evoRuns[0].iterations[iteration].lineage ) {
    data.evoRuns[0].iterations[iteration].lineage.forEach(item => {
      const normalizedClass = shouldNormaliseClassName ? normalizeClassName(item.eliteClass) : item.eliteClass;
      if (
        (!classMap.has(normalizedClass) || item.gN > classMap.get(normalizedClass).gN)
        && (!suffixFilter || normalizedClass.endsWith(suffixFilter))
      ) {
          classMap.set(normalizedClass, item);
      }
    });
  } else {
    console.error("No lineage found at iteration", iteration, "of", data.evoRuns[0].label);
  }
  

  console.log(`Total unique classes: ${classMap.size}`);
  console.log(`Musical classes: ${Array.from(classMap.values()).filter(item => isMusicalClass(item.eliteClass)).length}`);

  return Array.from(classMap.values()).filter(item => {
    const isMusical = isMusicalClass(item.eliteClass);
    return (inCategoryMusical && isMusical) || (inCategoryNonMusical && !isMusical);
  });
}

function traceLineage(data, descendant, maxDepth = Infinity, iteration = 0) {
  const lineage = [];
  let current = descendant;
  let depth = 0;
  
  while (current && depth < maxDepth) {
      lineage.push(current);
      if (current.parents.length === 0) break;

      if( current.parents.length > 1 ) {
          console.log(`Warning: descendant ${current.id} has multiple parents`);
      }
      if( current.parents[0].gN > current.gN ) {
          console.log(`Warning: descendant ${current.id} has a parent with a higher gN`);
      }
      
      const parentId = current.parents[0].genomeId;
      const parentEliteClass = current.parents[0].eliteClass;
      // compare eliteClass to ensure we're following the correct parent; the same genome could have won multiple classes, as an elite
      current = data.evoRuns[0].iterations[iteration].lineage.find(item => item.id === parentId && item.eliteClass === parentEliteClass);
      depth++;
  }
  
  return lineage.reverse();
}

export function buildSimplifiedTree(
    data, maxDepth = Infinity, 
    measureContextSwitches = false, 
    suffixFilter = null,
    iteration = 0,
    inCategoryMusical = true,
    inCategoryNonMusical = false
) {

  const nodeMap = new Map();
  let root = { name: "root", children: [], count: 0, s: 0, gN: 0 };

  function getOrCreateNode(item) {
    if (!nodeMap.has(item.id)) {
      const normalizedClass = normalizeClassName(item.eliteClass);
      nodeMap.set(item.id, {
        id: item.id,
        name: normalizedClass,
        children: [],
        count: 1,
        s: item.s,
        gN: item.gN,
        uBC: item.uBC,
        duration: item.duration,
        noteDelta: item.noteDelta,
        velocity: item.velocity,
        class: normalizedClass
      });
    }
    return nodeMap.get(item.id);
  }

  const latestDescendants = findLatestDescendantsByClass(data, suffixFilter, iteration, inCategoryMusical, inCategoryNonMusical);

  latestDescendants.forEach((descendant, index) => {
    console.log(`Processing descendant ${index + 1} of ${latestDescendants.length}`);
    const lineage = traceLineage(data, descendant, maxDepth, iteration);

    let prevNode = null;
    lineage.forEach(item => {
      const node = getOrCreateNode(item);
      
      if (prevNode && prevNode.gN < node.gN) {
        if (!prevNode.children.includes(node)) {
          prevNode.children.push(node);
        }
      } else if (!root.children.includes(node)) {
        root.children.push(node);
      }

      prevNode = node;
    });
  });

  // Sort children arrays by gN
  const sortNodeChildren = (node) => {
    node.children.sort((a, b) => a.gN - b.gN);
    node.children.forEach(sortNodeChildren);
  };
  sortNodeChildren(root);

  // const originalTreeDump = serializeTree(root);
  // downloadTreeDump(originalTreeDump, 'original_tree.txt');

  if (measureContextSwitches) {
    root = pruneTreeForContextSwitches(root);

    // const prunedTreeDump = serializeTree(root);
    // downloadTreeDump(prunedTreeDump, 'pruned_tree.txt');
  }

  console.log(`Built simplified tree with ${countNodes(root)} nodes`);
  return root;
}

export function pruneTreeForContextSwitches(root) {
  function pruneNode(node) {
    if (!node.children || node.children.length === 0) {
      return node;  // Always keep leaf nodes
    }

    // if node contains multiple children, keep all children
    if (node.children.length > 1) {
      node.children = node.children.map(child => pruneNode(child));
      return node;
    }

    // if node containes a single child, and it is of the same class as node (e.g. musical or non-musical), keep traversing children of descendants until a different class is found, or a node with multiple children
    // - we should only have one child by now:
    let isThisNodeMusical = isMusicalClass(node.class);
    let isChildMusical = isMusicalClass(node.children[0].class);
    if (isThisNodeMusical === isChildMusical) {
      return pruneNode(node.children[0]);
    } else {
      node.children = [pruneNode(node.children[0])];
      return node;
    }
  }

  return pruneNode(root);
}


function serializeTree(node, depth = 0) {
  let result = '  '.repeat(depth) + node.name + '\n';
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      result += serializeTree(child, depth + 1);
    });
  }
  return result;
}

function downloadTreeDump(content, fileName) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function validateLineageData(data) {
  const visited = new Set();
  const recursionStack = new Set();
  const errors = [];

  function validateNode(node) {
    if (recursionStack.has(node.id)) {
      errors.push(`Circular reference detected: ${node.id}`);
      return;
    }

    if (visited.has(node.id)) {
      return;
    }

    visited.add(node.id);
    recursionStack.add(node.id);

    // Check if parents exist and have lower or equal generation numbers
    node.parents.forEach(parent => {
      const parentNode = data.evoRuns[0].iterations[0].lineage.find(item => item.id === parent.genomeId);
      if (!parentNode) {
        errors.push(`Parent node not found: ${parent.genomeId} for child ${node.id}`);
      } else if (parentNode.gN > node.gN) {
        errors.push(`Invalid generation number: Parent ${parentNode.id} (gN: ${parentNode.gN}) has higher gN than child ${node.id} (gN: ${node.gN})`);
      }
      validateNode(parentNode);
    });

    recursionStack.delete(node.id);
  }

  data.evoRuns[0].iterations[0].lineage.forEach(validateNode);

  if (errors.length > 0) {
    console.error("Validation errors found:");
    errors.forEach(error => console.error(error));
    return false;
  } else {
    console.log("Data validation passed. No circular references or inconsistencies found.");
    return true;
  }
}
