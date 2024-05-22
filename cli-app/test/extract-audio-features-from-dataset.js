import fs from 'fs';
import path from 'path';
import WebSocket from "ws";
import { readWavFile } from "../util/file-common.js";
// import { file } from 'jszip';

// in preparation:
// - extract features for all files in the dataset and save them to sidecar files

const featureTypes = [
  'mfcc', 
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

async function readAndProcessAudio(fullPath) {
  try {
    const featureFileName = fullPath
      .replace(datasetPath, featureFilePath)
      .replace(/\.(mp3|wav|ogg|m4a)$/i, `.json`);
    if( fs.existsSync(fullPath) && !fs.existsSync(featureFileName)) {
      console.log('reading:', fullPath);
      // Read file into a buffer synchronously
      const data = await readWavFile(fullPath);
      // Pass the buffer to another function for processing synchronously
      await extractFeatures(data, fullPath);
    } else {
      console.log('skipping:', fullPath);
    }
  } catch (error) {
      console.error(`Error reading file ${fullPath}:`, error);
  }
}

const featureExtractionServerHost = 'ws://localhost:31051';
async function extractFeatures(audioDataBuffer, filename) {
  // Placeholder for processing the audio data buffer
  console.log(`Processing file: ${filename}, size: ${audioDataBuffer.length} bytes`);
  // Implement the audio data processing here...

  const features = {
      mfcc: [],
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
  };
  const time = {
      mfcc: [],
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
  }

  // save features to a corresponding file path, except with the featureFilePathPrefix 
  // e.g. /path/to/audio/file.wav -> featureFilePathPrefix/to/audio/file_mfcc.json
  for( const featureType of featureTypes) {
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
    const webSocket = new WebSocket(featureExtractionServerHost + `/${featureEndpoint}?sample_rate=${sampleRate}&features=${featureName}`); // &use_pca=False&use_activation=False
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
  };
  const featureFileName = filename
    .replace(datasetPath, featureFilePath)
    .replace(/\.(mp3|wav|ogg|m4a)$/i, `.json`);
  const featureFilePathTime = featureFilePath + '_time';
  const timeFileName = filename
    .replace(datasetPath, featureFilePathTime)
    .replace(/\.(mp3|wav|ogg|m4a)$/i, `_time.json`);
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
}

async function processAllAudioFiles() {
  try {
      let audioFiles = findAudioFiles(datasetPath);

      // add files from base directories where the files are less than 10
      // find base directories with less than 10 occurrences
      const audioFilePathsLessThan10 = [];
      const baseDirs = audioFiles.reduce( (acc, filePath) => {
        const baseDir = path.dirname(filePath);
        if( !acc[baseDir] ) {
          acc[baseDir] = 0;
        }
        acc[baseDir]++;
        return acc;
      }, {});
      const baseDirsLessThan10 = Object.keys(baseDirs).filter( (baseDir) => baseDirs[baseDir] < 10);
      for( const baseDir of baseDirsLessThan10) {
        const files = fs.readdirSync(baseDir);
        for( const file of files) {
          const fullPath = path.join(baseDir, file);
          if( /\.(mp3|wav|ogg|m4a)$/i.test(fullPath) ) {
            audioFilePathsLessThan10.push(fullPath);
          }
        }
      }

      if( suffixesFilter ) {
        const suffixes = suffixesFilter.split(',');
        audioFiles = audioFiles.filter( (filePath) => {
          return suffixes.some( (suffix) => filePath.endsWith(suffix));
        });
      }

      audioFiles = audioFiles.concat(audioFilePathsLessThan10);

      // Process each audio file by reading its data, then passing it to the processAudioFile function
      for( const filePath of audioFiles) {
          await readAndProcessAudio(filePath);
      };
  } catch (error) {
      console.error('Error:', error);
  }
}

const datasetPath = process.argv[2];
const featureFilePath = process.argv[3];
const sampleRate = process.argv[4] || 16000;
const suffixesFilter = process.argv[5] || undefined;
console.log('datasetPath:', datasetPath, 'featureFilePath:', featureFilePath);
// ensure the featureFilePath exists
if (!fs.existsSync(featureFilePath)) {
  fs.mkdirSync(featureFilePath, { recursive: true });
}
processAllAudioFiles();

// Usage example:
// node extract-audio-features-from-dataset.js /Users/bjornpjo/Downloads/nsynth-valid/family-split /Users/bjornpjo/Downloads/nsynth-valid/family-split_features 16000 "020-127.wav,030-127.wav,040-127.wav,050-127.wav,060-127.wav,070-127.wav,080-127.wav,090-127.wav,100-127.wav"