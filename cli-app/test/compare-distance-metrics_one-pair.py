import os
import json
import glob
import numpy as np
from scipy.spatial.distance import cosine
from itertools import combinations
from collections import defaultdict

# Function to read JSON file into dictionary
def read_json_file(file_path):
    with open(file_path, 'r') as file:
        data = json.load(file)
    return data

# Calculate the novelty score for each vector within its type
def calculate_novelty(vectors_by_type):
    novelty_scores = defaultdict(list)
    for vector_type, vectors in vectors_by_type.items():
        for i, current_vector in enumerate(vectors):
            # Compute cosine distances between the current vector and all others of the same type
            distances = [
                cosine(current_vector, other_vector)
                for j, other_vector in enumerate(vectors)
                if i != j
            ]
            # Calculate average distance (novelty score) for this vector
            if distances:
                average_distance = np.mean(distances)
                novelty_scores[vector_type].append(average_distance)
    return novelty_scores

# Organize all vectors by type
def organize_vectors_by_type(all_vectors):
    vectors_by_type = defaultdict(list)
    for vector_name, vector in all_vectors.items():
        vectors_by_type[vector_name].append(vector)
    return vectors_by_type

# Perform the novelty score calculation across all JSON files in a directory
def novelty_scores_directory_tree(root_dir):
    # Find all JSON files in the directory tree
    all_files = glob.glob(os.path.join(root_dir, '**/*.json'), recursive=True)
    
    # Read vectors from all files, categorizing them by type
    all_vectors = defaultdict(list)
    for file_path in all_files:
        data = read_json_file(file_path)
        for key, value in data.items():
            if key.startswith("manual-"):
                all_vectors[key].append(np.array(value))
    
    # Organize by vector type
    vectors_by_type = organize_vectors_by_type(all_vectors)

    # Calculate novelty scores for all vectors
    novelty_scores = calculate_novelty(vectors_by_type)

    # Print novelty scores
    for vector_type, scores in novelty_scores.items():
        print(f"Novelty scores for vector type '{vector_type}'")
        for score in scores:
            print(f"{score:.4f}")
        print()  # New line for better readability

    return novelty_scores

# Main function to initiate the process
def main(root_dir):
    novelty_scores = novelty_scores_directory_tree(root_dir)
    # Optionally, perform further analysis or export the novelty_scores as needed

if __name__ == "__main__":
    root_dir = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else "path_to_your_directory_tree"
    main(root_dir)
