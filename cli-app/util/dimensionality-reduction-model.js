import { getDiversityFromWebsocket} from '../service/websocket/ws-gene-evaluation.js';

export default class DimensionalityReductionModel {
  constructor(
    evaluationDiversityHost,
    evoRunDirPath,
    shouldFit = true,
    pcaComponents = undefined,
    shouldCalculateSurprise = false,
    shouldUseAutoEncoderForSurprise = false
  ) {
    this.evaluationDiversityHost = evaluationDiversityHost;
    this.evoRunDirPath = evoRunDirPath;
    this.shouldFit = shouldFit;
    this.pcaComponents = pcaComponents;
    this.shouldCalculateSurprise = shouldCalculateSurprise;
    this.shouldUseAutoEncoderForSurprise = shouldUseAutoEncoderForSurprise;
    
    // Store the imported function as a property of the class
    this.getDiversityFromWebsocket = getDiversityFromWebsocket;
  }

  async project(features, allFitnessValues = undefined) {
    const diversityProjection = await this.projectBatch([features], allFitnessValues);
    return diversityProjection[0];
  }

  async projectBatch(features, allFitnessValues = undefined) {
    try {
      const diversityProjection = await this.getDiversityFromWebsocket(
        features,
        allFitnessValues,
        this.evaluationDiversityHost,
        this.evoRunDirPath,
        this.shouldFit,
        this.pcaComponents,
        this.shouldCalculateSurprise,
        this.shouldUseAutoEncoderForSurprise
      );
      return diversityProjection.feature_map;
    } catch (e) {
      console.error(`Error projecting diversity`, e);
      throw e;
    }
  }
}