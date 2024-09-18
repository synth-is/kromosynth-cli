import os
import sys
import numpy as np
import librosa
import tensorflow as tf
import tensorflow_hub as hub
from tqdm import tqdm
from sklearn.preprocessing import StandardScaler
import argparse

# Load VGGish model
print("Loading VGGish model...")
vggish_model = hub.load('https://tfhub.dev/google/vggish/1')
print("VGGish model loaded successfully.")

def extract_traditional_features(y, sr):
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13).mean(axis=1)
    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr).mean()
    spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr).mean()
    chroma = librosa.feature.chroma_stft(y=y, sr=sr).mean(axis=1)
    zero_crossing_rate = librosa.feature.zero_crossing_rate(y).mean()
    rms = librosa.feature.rms(y=y).mean()
    spectral_flatness = librosa.feature.spectral_flatness(y=y).mean()
    
    return np.concatenate([
        mfccs,
        [spectral_centroid, spectral_rolloff, zero_crossing_rate, rms, spectral_flatness],
        chroma
    ])

def extract_vggish_features(y, sr):
    if sr != 16000:
        y = librosa.resample(y=y, orig_sr=sr, target_sr=16000)
    
    # Ensure the audio is the correct length (0.96 seconds)
    if len(y) < 16000:
        y = np.pad(y, (0, 16000 - len(y)))
    else:
        y = y[:16000]
    
    # Convert to tensorflow tensor and reshape to 1D
    y_tf = tf.convert_to_tensor(y, dtype=tf.float32)
    y_tf = tf.reshape(y_tf, [-1])  # Reshape to 1D
    
    # Extract VGGish embeddings
    embeddings = vggish_model(y_tf)
    return embeddings.numpy().flatten()

def extract_combined_features(audio_file):
    y, sr = librosa.load(audio_file, sr=None)
    trad_features = extract_traditional_features(y, sr)
    vggish_features = extract_vggish_features(y, sr)
    return np.concatenate([trad_features, vggish_features])

def process_directory(input_dir, output_dir, suffix_filter=None):
    all_features = []
    file_paths = []

    print(f"Starting to process files in {input_dir}")
    # First pass: extract features
    for root, _, files in os.walk(input_dir):
        for file in tqdm(files, desc=f"Extracting features from {root}"):
            if file.endswith(('.wav', '.mp3', '.ogg')):
                if suffix_filter and not any(file.endswith(suffix) for suffix in suffix_filter):
                    continue
                input_path = os.path.join(root, file)
                try:
                    print(f"Processing file: {input_path}")
                    features = extract_combined_features(input_path)
                    all_features.append(features)
                    file_paths.append(input_path)
                except Exception as e:
                    print(f"Error processing {input_path}: {str(e)}")

    if not all_features:
        print("No features were extracted. Check if the input directory contains supported audio files.")
        return

    print("Feature extraction completed. Starting normalization...")
    # Normalize features
    scaler = StandardScaler()
    normalized_features = scaler.fit_transform(all_features)

    print("Normalization completed. Saving normalized features...")
    # Second pass: save normalized features
    for features, input_path in tqdm(zip(normalized_features, file_paths), desc="Saving normalized features", total=len(file_paths)):
        relative_path = os.path.relpath(input_path, input_dir)
        output_path = os.path.join(output_dir, os.path.splitext(relative_path)[0] + '.npy')

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        np.save(output_path, features)

    # Save the scaler for future use
    scaler_path = os.path.join(output_dir, 'feature_scaler.pkl')
    from joblib import dump
    dump(scaler, scaler_path)
    print(f"Scaler saved to {scaler_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract and normalize audio features.")
    parser.add_argument("input_directory", help="Directory containing input audio files")
    parser.add_argument("output_directory", help="Directory to save output feature files")
    parser.add_argument("--filter", help="Comma-separated list of file suffixes to process (e.g., '020.wav,030.wav')")
    
    args = parser.parse_args()

    if not os.path.isdir(args.input_directory):
        print(f"Error: Input directory '{args.input_directory}' does not exist.")
        sys.exit(1)

    suffix_filter = args.filter.split(',') if args.filter else None

    print(f"Processing directory: {args.input_directory}")
    print(f"Saving features to: {args.output_directory}")
    if suffix_filter:
        print(f"Applying filter: {suffix_filter}")

    try:
        process_directory(args.input_directory, args.output_directory, suffix_filter)
        print("Feature extraction and normalization complete!")
    except Exception as e:
        print(f"An error occurred during execution: {str(e)}")
        sys.exit(1)