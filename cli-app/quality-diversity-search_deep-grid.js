// storage (temporary?) for the deep grid search (dependent functions have not been incorporated) - kind of just to get it out of the way for now

// TODO: the implementation of this variant has fallen behind and isn't really used / working to well?
async function deepGridMapElitesBatch(
  eliteMap, algorithmKey, evolutionRunId,
  populationSize, gridDepth,
  probabilityMutatingWaveNetwork, probabilityMutatingPatch,
  audioGraphMutationParams, evolutionaryHyperparameters,
  classScoringDurations, classScoringNoteDeltas, classScoringVelocities,
  classificationGraphModel,
  _geneVariationServers, _geneEvaluationServers,
  useGpuForTensorflow,
  evoRunDirPath, evoRunFailedGenesDirPath,
  patchFitnessTestDuration
) {
  const batchPromisesSelection = new Array(populationSize);
  for( let parentIdx = 0; parentIdx < populationSize; parentIdx++ ) {

    const geneVariationServerHost = _geneVariationServers[ parentIdx % _geneVariationServers.length ];
    const geneEvaluationServerHost = _geneEvaluationServers[ parentIdx % _geneEvaluationServers.length ];

    batchPromisesSelection[parentIdx] = new Promise( async (resolve) => {

      ///// selection

      const randomClassKey = sample(Object.keys(eliteMap.cells));
      const cellIndividualGenomeString = await fitnessProportionalSelectionOfIndividualInCell( eliteMap, randomClassKey, evolutionRunId, evoRunDirPath );
      let genomeId = ulid();
      
      // let newGenome;
      let newGenomeString;
      if( cellIndividualGenomeString ) {

        ///// variation

        // newGenome = await getNewAudioSynthesisGenomeByMutation(
        //   cellIndividual,
        //   evolutionRunId, eliteMapExtra.generationNumber, parentIdx, 'deepGridMapElites', audioCtx,
        //   this.state.probabilityMutatingWaveNetwork,
        //   this.state.probabilityMutatingPatch,
        //   this.state.mutationParams
        // );

        try {
          newGenomeString = await callGeneVariationService(
            cellIndividualGenomeString,
            evolutionRunId, eliteMap.generationNumber, algorithmKey,
            probabilityMutatingWaveNetwork,
            probabilityMutatingPatch,
            audioGraphMutationParams,
            evolutionaryHyperparameters,
            patchFitnessTestDuration,
            geneVariationServerHost
          );  
        } catch (e) {
          console.error("Error from callGeneVariationService", e);
          clearServiceConnectionList(geneVariationServerHost);
          genomeId = undefined;
        }


      } else {

        ///// gene initialisation

        // newGenome = getNewAudioSynthesisGenome(
        //   evolutionRunId, eliteMapExtra.generationNumber, parentIdx
        // );
        
        try {
          newGenomeString = await callRandomGeneService(
            evolutionRunId, eliteMap.generationNumber, evolutionaryHyperparameters,
            geneVariationServerHost
          );
        } catch (error) {
          console.error("Error calling gene seed service: " + error);
          clearServiceConnectionList(geneVariationServerHost);
          genomeId = undefined;
        }


        ///// evaluate

        // const score = await this.getClassScoreForOneGenome(
        //   newGenome, randomClassKey, 1, 0, 1
        // );

        const newGenomeClassScores = await callGeneEvaluationService(
          newGenomeString,
          classScoringDurations,
          classScoringNoteDeltas,
          classScoringVelocities,
          classificationGraphModel,
          useGpuForTensorflow,
          geneEvaluationServerHost
        ).catch(
          e => {
            console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
            clearServiceConnectionList(geneEvaluationServerHost);
            getGenomeFromGenomeString( newGenomeString ).then( async failedGenome =>
              await saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
            );
            genomeId = undefined;
          }
        );
        if( newGenomeClassScores ) {
          const {score, duration, noteDelta, velocity} = newGenomeClassScores[randomClassKey];
            const updated = Date.now();

          const offspringCell = eliteMap.cells[randomClassKey];
          const championEntry = {
            g: genomeId,
            s: score,
            gN: eliteMap.generationNumber
            // duration: 1, noteDelta: 0, velocity: 1
          };
          offspringCell.elts.push( championEntry );

          if( genomeId ) {
            // const genomeSavedInDB = await this.saveToGenomeMap(evolutionRunId, genomeId, newGenome);
            const newGenome = await getGenomeFromGenomeString( newGenomeString );
            newGenome.tags = [];
            newGenome.tags.push({
              tag: randomClassKey,
              score, duration, noteDelta, velocity,
              updated
            });
            await saveGenomeToDisk( newGenome, evolutionRunId, genomeId, evoRunDirPath, true );        
          }

        } else {
          console.error("Error evaluating gene at generation", eliteMap.generationNumber, "for evolution run", evolutionRunId);
          genomeId = undefined;
        }
        
      }

      // parents[parentIdx] = genomeId;

      resolve( genomeId );

    }); // batchPromises[parentIdx] = new Promise( async (resolve) => {

    // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {
    // } // for( let batchIteration = 0; batchIteration < searchBatchSize; batchIteration++ ) {

  }

  // place population members in grid

  await Promise.all( batchPromisesSelection ).then( async (parents) => {

    const batchPromisesEvaluation = new Array(parents.length); // same as populationSize

    for (const [parentIdx, offspringId] of parents.filter( e => e !== undefined ).entries()) {
    // for( const offspringId of parents ) {

      batchPromisesEvaluation[parentIdx] = new Promise( async (resolve) => {
        // const offspring = await this.getFromGenomeMap(evolutionRunId, offspringId);
        
        const classEliteGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, offspringId, evoRunDirPath );
        const geneEvaluationServerHost = _geneEvaluationServers[ parentIdx % _geneEvaluationServers.length ];
        const newGenomeClassScores = await callGeneEvaluationService(
          classEliteGenomeString,
          classScoringDurations,
          classScoringNoteDeltas,
          classScoringVelocities,
          classificationGraphModel,
          useGpuForTensorflow,
          geneEvaluationServerHost
        ).catch(
          e => {
            console.error(`Error evaluating gene at generation ${eliteMap.generationNumber} for evolution run ${evolutionRunId}`, e);
            clearServiceConnectionList(geneEvaluationServerHost);
            getGenomeFromGenomeString( newGenomeString ).then( async failedGenome =>
              await saveGenomeToDisk( failedGenome, evolutionRunId, genomeId, evoRunFailedGenesDirPath, false )
            );
          }
        );
        if( newGenomeClassScores && Object.keys(newGenomeClassScores).length ) {
          // const eliteClassKeys = getClassKeysWhereScoresAreElite( newGenomeClassScores, eliteMap, true /*eliteWinsOnlyOneCell*/, undefined/*classRestriction*/ );
          // const topScoringClassForOffspring = newGenomeClassScores[ eliteClassKeys[0] ];
          const topScoringClassForOffspring = getHighestScoringCell( newGenomeClassScores );
          
          // const topScoringClassForOffspring = await this.getTopClassForGenome(offspring);
          const {score, 
            // duration, noteDelta, velocity
          } = topScoringClassForOffspring;
          const championEntry = {
            g: offspringId,
            s: score, 
            // duration, noteDelta, velocity,
            gN: eliteMap.generationNumber,
            class: topScoringClassForOffspring.class
          };
          resolve( championEntry );
        } else {
          console.error("Error evaluating gene at generation", eliteMap.generationNumber, "for evolution run", evolutionRunId);
          resolve( undefined );
        }
      });
      
      // const offspringCell = eliteMap[topScoringClassForOffspring.class];
      // if( offspringCell.elts.length < gridDepth ) {
      //   offspringCell.elts.push( championEntry );
      // } else {
      //   const championToReplaceIdx = Math.floor(Math.random() * offspringCell.elts.length);
      //   offspringCell.elts[championToReplaceIdx] = championEntry;
      // }
    }
    await Promise.all( batchPromisesEvaluation ).then( async (championEntries) => {
      for( const championEntry of championEntries.filter( e => e !== undefined ) ) {
        const offspringCell = eliteMap.cells[championEntry.class];
        if( offspringCell.elts.length < gridDepth ) {
          offspringCell.elts.push( championEntry );
        } else {
          const championToReplaceIdx = Math.floor(Math.random() * offspringCell.elts.length);
          offspringCell.elts[championToReplaceIdx] = championEntry;
        }
      }
    }); // Promise.all( batchPromisesEvaluation ).then( async (championEntries) => {
  }); // await Promise.all( batchPromises ).then( async (batchIterationResults) => {
  // console.log("iteration", eliteMapExtra.generationNumber);
  // this.setState({eliteMap: cloneDeep(eliteMap), generationNumber: eliteMapExtra.generationNumber});
  // await this.saveEliteMap( evolutionRunId, eliteMapExtra.generationNumber, eliteMap );
  // await this.saveEliteMapExtra( evolutionRunId, eliteMapExtra );
  
  console.log("iteration", eliteMap.generationNumber, "evo run ID:", evolutionRunId);
  await saveEliteMapToDisk( eliteMap, evoRunDirPath, evolutionRunId ); // the main / latest map
  // git commit iteration
  runCmd(`git -C ${evoRunDirPath} commit -a -m "Iteration ${eliteMap.generationNumber}"`);

  eliteMap.generationNumber++;
}

// for DG-MAP-Elites
async function fitnessProportionalSelectionOfIndividualInCell( eliteMap, classKey, evolutionRunId, evoRunDirPath ) {
  const cell = eliteMap.cells[classKey];
  let cellIndividualId;
  let cellIndividualGenomeString;
  if( cell.elts && cell.elts.length ) {
    if( cell.elts.length > 1 ) {
      const cellGenomes = cell.elts.map( ch => ch.g );
      const cellGenomeScores = cell.elts.map( ch => ch.s );
      const nonzeroGenomeScoreCount = cellGenomeScores.filter( s => s > 0 ).length;
      if( nonzeroGenomeScoreCount > 0 ) {
        cellIndividualId = chance.weighted(cellGenomes, cellGenomeScores);
      } else {
        cellIndividualId = chance.pickone(cellGenomes);
      }
    } else {
      cellIndividualId = cell.elts[0].genome;
    }
    // cellIndividual = await this.getFromGenomeMap( evolutionRunId, cellIndividualId );
    cellIndividualGenomeString = await readGenomeAndMetaFromDisk( evolutionRunId, cellIndividualId, evoRunDirPath );
  }
  return cellIndividualGenomeString;
}

function getHighestScoringCell( genomeClassScores ) {
  const highestScoringClassKey = Object.keys(genomeClassScores).reduce((maxKey, oneClassKey) =>
    genomeClassScores[maxKey].score > genomeClassScores[oneClassKey].score ? maxKey : oneClassKey
  );
  const {score, duration, noteDelta, velocity} = genomeClassScores[highestScoringClassKey];
  return {score, duration, noteDelta, velocity, class: highestScoringClassKey};
}