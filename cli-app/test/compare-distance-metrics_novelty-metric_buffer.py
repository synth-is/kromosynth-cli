# reads a directory tree of audio files, instead of JSON files with vector embeddings (as in compare-distance-metrics_novelty-metric_features.py), 
# and sends each file (path) to a websocket service to obtain the measure, 
# instead of calling 'cosine' for the feature vectors.

import os
import glob
import asyncio
import websockets
import json
from itertools import combinations
from collections import defaultdict

# Replace with your WebSocket service URL
WEBSOCKET_URL = 'ws://localhost:8080/stft-loss'

# Function to find all audio files in the directory tree
def find_audio_files(root_dir):
    return glob.glob(os.path.join(root_dir, '**/*.wav'), recursive=True)  # Adjust the extension as needed

# Coroutine to handle WebSocket communication and send JSON message with file paths
async def compute_novelty_scores(root_dir):
    audio_files = find_audio_files(root_dir)
    novelty_scores = defaultdict(list)

    for audio_file in audio_files:
        file_type = os.path.splitext(os.path.basename(audio_file))[0]
        for other_audio_file in audio_files:
            if audio_file == other_audio_file:
                continue
            # Create JSON message with file paths
            json_message = json.dumps({
                "file1": audio_file, #"/Users/bjornpjo/Downloads/2.wav"
                "file2": other_audio_file #"/Users/bjornpjo/Downloads/ref.wav"
            })
            # Send JSON message and get measure via WebSocket
            measure = await get_measure_via_websocket(json_message)
            print(f"Novelty measure for '{audio_file}' and '{other_audio_file}': {measure}")
            novelty_scores[file_type].append(float(measure))

    return novelty_scores

# Coroutine to send a JSON message with the file paths to the WebSocket service
async def get_measure_via_websocket(json_message):
    async with websockets.connect(WEBSOCKET_URL) as ws:
        await ws.send(json_message)
        measure = await ws.recv()
        return measure

# Function to find the types with the highest difference in average novelty
def find_highest_difference(novelty_scores):
    average_novelty = {ftype: sum(scores)/len(scores) for ftype, scores in novelty_scores.items()}
    type_diffs = combinations(average_novelty.keys(), 2)
    highest_diff = max(type_diffs, key=lambda x: abs(average_novelty[x[0]] - average_novelty[x[1]]))
    return highest_diff, abs(average_novelty[highest_diff[0]] - average_novelty[highest_diff[1]])

# Main function to initiate the process
async def main(root_dir):
    novelty_scores = await compute_novelty_scores(root_dir)
    highest_diff, diff_score = find_highest_difference(novelty_scores)
    print(f"The file types with the highest difference are: {highest_diff[0]} and {highest_diff[1]} with a score of: {diff_score:.4f}")

if __name__ == "__main__":
    import sys
    root_dir = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else "path_to_your_directory"
    asyncio.run(main(root_dir))
