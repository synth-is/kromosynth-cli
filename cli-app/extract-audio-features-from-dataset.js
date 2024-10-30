import fs from 'fs';
import path from 'path';
import WebSocket from "ws";
import { readWavFile } from "./util/file-common.js";
// import { file } from 'jszip';

// in preparation:
// - extract features for all files in the dataset and save them to sidecar files

const featureTypes = [
  'mfcc', 
  'mfcc-sans0',
  'mfcc-statistics',
  'mfcc-sans0-statistics',
  'vggish', 
  'vggishessentia',
  'pann', 
  'panns-inference',
  'discogs-effnet',
  'msd-musicnn',
  'clap',
  'encodec',
  'maest',
  'wav2vec',
  'ast',
  // 'openl3',
   'manual-spectral_centroid',
  'manual-spectral_spread',
  'manual-spectral_skewness',
  'manual-spectral_kurtosis',
  'manual-spectral_rolloff',
  'manual-spectral_decrease',
  'manual-spectral_slope',
  'manual-spectral_flux',
  'manual-spectral_crest_factor',
  'manual-spectral_flatness',
  'manual-tonal_power_ratio',
  'manual-max_autocorrelation',
  'manual-zero_crossing_rate',
  'manual-chroma_stft',
  'manual-rms',
  'manual-spectral_bandwidth',
  'manual-spectral_contrast',
  'spectral-shape-measures'
];
const manualFeatureTypes = [
  'spectral_centroid', 'spectral_rolloff', 'zero_crossing_rate', 'chroma_stft', 'mel_spectrogram', 'rms', 'spectral_bandwidth', 'spectral_contrast', 'spectral_flatness', 'spectral_rolloff',
  // 'tonnetz', 'chroma_cqt', 'chroma_cens', 'chroma_cqt', 'chroma_cens', 
];

// report:
// - distance difference between distance measurement approaches (e.g. euclidean, cosine, etc.) and different feature extraction methods
// - coverage and QD score with different feature extraction and projection methods

function findAudioFiles(dir, audioFiles = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
          findAudioFiles(fullPath, audioFiles);
      } else {
          if (/\.(mp3|wav|ogg|m4a)$/i.test(fullPath)) {
              audioFiles.push(fullPath);
          }
      }
  });
  return audioFiles;
}

async function readAndProcessAudio(fullPath, datasetPath, featureFilePath, ckptDir, sampleRate, featureExtractionServerHost, featureTypesFilter) {
  try {
    const featureFileName = fullPath
      .replace(datasetPath, featureFilePath)
      .replace(/\.(mp3|wav|ogg|m4a)$/i, `.json`);
    if(  fs.existsSync(fullPath) ) {
      console.log('reading:', fullPath);
      // Read file into a buffer synchronously
      const data = await readWavFile(fullPath);
      // Pass the buffer to another function for processing synchronously
      await extractFeatures(data, fullPath, datasetPath, featureFilePath, ckptDir, sampleRate, featureExtractionServerHost, featureTypesFilter);
    } else {
      console.log('skipping:', fullPath);
    }
  } catch (error) {
      console.error(`Error reading file ${fullPath}:`, error);
  }
}

async function extractFeatures(audioDataBuffer, wavFilename, datasetPath, featureFilePath, ckptDir, sampleRate, featureExtractionServerHost, featureTypesFilter) {
  // Placeholder for processing the audio data buffer
  console.log(`Processing file: ${wavFilename}, size: ${audioDataBuffer.length} bytes`);
  // Implement the audio data processing here...

  const featureFileName = wavFilename
    .replace(datasetPath, featureFilePath)
    .replace(/\.(mp3|wav|ogg|m4a)$/i, `.json`);
  const featureFilePathTime = featureFilePath + '_time';
  const timeFileName = wavFilename
    .replace(datasetPath, featureFilePathTime)
    .replace(/\.(mp3|wav|ogg|m4a)$/i, `_time.json`);

  let features;
  if( fs.existsSync(featureFileName) ) {
    // read the existing features
    features = JSON.parse(fs.readFileSync(featureFileName));
  } else {
    features = {
      mfcc: [],
      'mfcc-sans0': [],
      'mfcc-statistics': [],
      'mfcc-sans0-statistics': [],
      vggish: [],
      vggishessentia: [],
      pann: [],
      "panns-inference": [],
      "discogs-effnet": [],
      "msd-musicnn": [],
      clap: [],
      encodec: [],
      wav2vec: [],
      ast: [],
      // openl3: [],
      'manual-spectral_centroid': [],
      'manual-spectral_spread': [],
      'manual-spectral_skewness': [],
      'manual-spectral_kurtosis': [],
      'manual-spectral_rolloff': [],
      'manual-spectral_decrease': [],
      'manual-spectral_slope': [],
      'manual-spectral_flux': [],
      'manual-spectral_crest_factor': [],
      'manual-spectral_flatness': [],
      'manual-tonal_power_ratio': [],
      'manual-max_autocorrelation': [],
      'manual-zero_crossing_rate': [],
      'manual-chroma_stft': [],
      'manual-rms': [],
      'manual-spectral_bandwidth': [],
      'manual-spectral_contrast': [],
      // Inspired by https://doi.org/10.3390/app112411926 :
      // "Spectral shape measures: spectral shape measures are a set of scalar descriptors that measure the distribution of energy in the spectrum. 
      // They were popularized by the MPEG-7 standard [29]. 
      // Our implementation includes some of the most established ones: 
      // spectral centroid, spread, skewness, kurtosis, rolloff, flatness and crest. As a set, they can be comparable to MFCCs [30], 
      // but individually some of them have clear perceptual interpretations. 
      // Thus, we use the whole set as a position feature...""
      'spectral-shape-measures': [],
    };
  }

  let time;
  if( fs.existsSync(timeFileName) ) {
    // read the existing features
    time = JSON.parse(fs.readFileSync(timeFileName));
  } else {
    time = {
      mfcc: [],
      'mfcc-sans0': [],
      'mfcc-statistics': [],
      'mfcc-sans0-statistics': [],
      vggish: [],
      vggishessentia: [],
      pann: [],
      "panns-inference": [],
      "discogs-effnet": [],
      "msd-musicnn": [],
      clap: [],
      encodec: [],
      wav2vec: [],
      ast: [],
      // openl3: [],
      'manual-spectral_centroid': [],
      'manual-spectral_spread': [],
      'manual-spectral_skewness': [],
      'manual-spectral_kurtosis': [],
      'manual-spectral_rolloff': [],
      'manual-spectral_decrease': [],
      'manual-spectral_slope': [],
      'manual-spectral_flux': [],
      'manual-spectral_crest_factor': [],
      'manual-spectral_flatness': [],
      'manual-tonal_power_ratio': [],
      'manual-max_autocorrelation': [],
      'manual-zero_crossing_rate': [],
      'manual-chroma_stft': [],
      'manual-rms': [],
      'manual-spectral_bandwidth': [],
      'manual-spectral_contrast': [],
      'spectral-shape-measures': [],
    };
  }

  // save features to a corresponding file path, except with the featureFilePathPrefix 
  // e.g. /path/to/audio/file.wav -> featureFilePathPrefix/to/audio/file_mfcc.json
  let featureTypesToProcess;
  if( featureTypesFilter ) {
    featureTypesToProcess = featureTypes.filter( (featureType) => featureTypesFilter.includes(featureType));
  } else {
    featureTypesToProcess = featureTypes;
  }
  let hasExtractedFeatures = false;
  for( const featureType of featureTypesToProcess) {
    if( features[featureType] && features[featureType].length > 0 ) {
      // skip if already extracted
      continue;
    } else {
      console.log('extracting feature:', featureType);
      let featureEndpoint;
      let featureName;
      if( featureType.startsWith('manual')) {
        featureEndpoint = 'manual';
        featureName = featureType.split('-')[1];
      } else {
        featureEndpoint = featureType;
        featureName = '';
      }
      const webSocket = new WebSocket(featureExtractionServerHost + `/${featureEndpoint}?sample_rate=${sampleRate}&features=${featureName}&ckpt_dir=${ckptDir}`); // &use_pca=False&use_activation=False
      webSocket.binaryType = "arraybuffer"; // Set binary type for receiving array buffers
      const oneFeatuesVariant = await new Promise((resolve, reject) => {
        webSocket.on("open", () => {
          webSocket.send(audioDataBuffer);
        });
        webSocket.on("message", (message) => {
          const features = JSON.parse(message);
          resolve(features);
        });
        webSocket.on("error", (error) => {
          reject(error);
        });
      });

      // console.log('oneFeatuesVariant:', oneFeatuesVariant);

      features[featureType] = oneFeatuesVariant.features;
      time[featureType] = oneFeatuesVariant.time;

      hasExtractedFeatures = true;
    }
  };
  if( 
    features['manual-spectral_centroid'].length > 0 && 
    features['manual-spectral_spread'].length > 0 &&
    features['manual-spectral_skewness'].length > 0 &&
    features['manual-spectral_kurtosis'].length > 0 &&
    features['manual-spectral_rolloff'].length > 0 &&
    features['manual-spectral_flatness'].length > 0 &&
    features['manual-spectral_crest_factor'].length > 0
  ) {
    features['spectral-shape-measures'] = [
      features['manual-spectral_centroid'],
      features['manual-spectral_spread'],
      features['manual-spectral_skewness'],
      features['manual-spectral_kurtosis'],
      features['manual-spectral_rolloff'],
      features['manual-spectral_flatness'],
      features['manual-spectral_crest_factor'],
    ];
  }

  if( hasExtractedFeatures ) {
    console.log('writing to:', featureFileName);
    const featureBasePath = path.dirname(featureFileName);
    if (!fs.existsSync(featureBasePath)) {
      fs.mkdirSync(featureBasePath, { recursive: true });
    }
    const featureBasePathTime = path.dirname(timeFileName);
    if (!fs.existsSync(featureBasePathTime)) {
      fs.mkdirSync(featureBasePathTime, { recursive: true });
    }
    fs.writeFileSync(featureFileName, JSON.stringify(features));
    fs.writeFileSync(timeFileName, JSON.stringify(time));
  } else {
    console.log('skipping:', wavFilename, ", no features to extract");
  }
}

export async function extractFeaturesFromAllAudioFiles(datasetPath, featureFilePath, sampleRate, ckptDir, featureExtractionServerHost, suffixesFilter, featureTypesFilterString) {
  try {
      let audioFiles = findAudioFiles(datasetPath);

      // TODO: what was that all about?:

      // // add files from base directories where the files are less than 10
      // // find base directories with less than 10 occurrences
      // const audioFilePathsLessThan10 = [];
      // const baseDirs = audioFiles.reduce( (acc, filePath) => {
      //   const baseDir = path.dirname(filePath);
      //   if( !acc[baseDir] ) {
      //     acc[baseDir] = 0;
      //   }
      //   acc[baseDir]++;
      //   return acc;
      // }, {});
      // const baseDirsLessThan10 = Object.keys(baseDirs).filter( (baseDir) => baseDirs[baseDir] < 10);
      // for( const baseDir of baseDirsLessThan10) {
      //   const files = fs.readdirSync(baseDir);
      //   for( const file of files) {
      //     const fullPath = path.join(baseDir, file);
      //     if( /\.(mp3|wav|ogg|m4a)$/i.test(fullPath) ) {
      //       audioFilePathsLessThan10.push(fullPath);
      //     }
      //   }
      // }

      if( suffixesFilter ) {
        const suffixes = suffixesFilter.split(',');
        audioFiles = audioFiles.filter( (filePath) => {
          return suffixes.some( (suffix) => filePath.endsWith(suffix));
        });
      }

      // audioFiles = audioFiles.concat(audioFilePathsLessThan10);

      // Process each audio file by reading its data, then passing it to the processAudioFile function
      let featureTypesFilter;
      if( featureTypesFilterString ) {
        featureTypesFilter = featureTypesFilterString.split(',');
      }
      for( const filePath of audioFiles) {
          await readAndProcessAudio(filePath, datasetPath, featureFilePath, ckptDir, sampleRate, featureExtractionServerHost, featureTypesFilter);
      };
  } catch (error) {
      console.error('Error:', error);
  }
}

const _datasetPath = process.argv[2];
const _featureFilePath = process.argv[3];
const _sampleRate = process.argv[4] || 16000;
const _chkptDir = process.argv[5] || '/tmp/checkpoints';
const _featureExtractionServerHost = process.argv[6] || 'ws://localhost:31051';
const _suffixesFilter = process.argv[7] || undefined;
console.log('datasetPath:', _datasetPath, 'featureFilePath:', _featureFilePath, 'sampleRate:', _sampleRate, 'chkptDir:', _chkptDir, 'featureExtractionServerHost:', _featureExtractionServerHost, 'suffixesFilter:', _suffixesFilter);
// ensure the featureFilePath exists
if (!fs.existsSync(_featureFilePath)) {
  fs.mkdirSync(_featureFilePath, { recursive: true });
}
// extractFeaturesFromAllAudioFiles(_datasetPath, _featureFilePath, _sampleRate, _chkptDir, _featureExtractionServerHost, _suffixesFilter);

// Usage example:
// node extract-audio-features-from-dataset.js /Users/bjornpjo/Downloads/nsynth-valid/family-split /Users/bjornpjo/Downloads/nsynth-valid/family-split_features 16000 "020-127.wav,030-127.wav,040-127.wav,050-127.wav,060-127.wav,070-127.wav,080-127.wav,090-127.wav,100-127.wav"