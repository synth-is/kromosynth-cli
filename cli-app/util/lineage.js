import { yamnetTags_musical, yamnetTags_non_musical } from './classificationTags.js';

function normalizeClassName(className) {
  return className.replace('YAM_', '').split('_')[0];
}

function isMusicalClass(className) {
  const normalizedName = normalizeClassName(className);
  return yamnetTags_musical.some(tag => normalizedName.includes(tag));
}

export function findLatestDescendantsByClass(data, suffixFilter = null, iteration = 0, inCategoryMusical = true, inCategoryNonMusical = false, shouldNormaliseClassName = false) {
  const classMap = new Map();
  console.log("data.evoRuns[0].iterations.length", data.evoRuns[0].iterations.length)
  console.log("iteration", iteration)
  data.evoRuns[0].iterations[iteration].lineage.forEach(item => {
      const normalizedClass = shouldNormaliseClassName ? normalizeClassName(item.eliteClass) : item.eliteClass;
      if (
        (!classMap.has(normalizedClass) || item.gN > classMap.get(normalizedClass).gN)
        && (!suffixFilter || normalizedClass.endsWith(suffixFilter))
      ) {
          classMap.set(normalizedClass, item);
      }
  });

  console.log(`Total unique classes: ${classMap.size}`);
  console.log(`Musical classes: ${Array.from(classMap.values()).filter(item => isMusicalClass(item.eliteClass)).length}`);
  console.log(`Non-musical classes: ${Array.from(classMap.values()).filter(item => !isMusicalClass(item.eliteClass)).length}`);

  return Array.from(classMap.values()).filter(item => {
    const isMusical = isMusicalClass(item.eliteClass);
    return (inCategoryMusical && isMusical) || (inCategoryNonMusical && !isMusical);
  });
}

export function traceLineage(data, descendant, maxDepth = Infinity, iteration = 0) {
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