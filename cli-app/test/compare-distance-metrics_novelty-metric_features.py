# Compute a novelty metric, similarly to eq. (5) in: https://repositorio.uam.es/bitstream/handle/10486/666094/novelty_castells_DDR_2011.pdf
# @inproceedings{castells2011novelty,
#   title={Novelty and diversity metrics for recommender systems: choice, discovery and relevance},
#   author={Castells, Pablo and Vargas, Sa{\'u}l and Wang, Jun and others},
#   booktitle={International Workshop on Diversity in Document Retrieval (DDR 2011) at the 33rd European Conference on Information Retrieval (ECIR 2011)},
#   pages={29--36},
#   year={2011},
#   organization={Citeseer}
# }

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

# Function to preprocess the data by concatenating "manual-" vectors pairwise
def preprocess_data(data):
    processed_data = {}
    manual_vectors = {k: v for k, v in data.items() if k.startswith("manual-")}
    for (type1, vector1), (type2, vector2) in combinations(manual_vectors.items(), 2):
        combined_vector_name = f"{type1}+{type2}"
        concatenated_vector = np.concatenate((np.array(vector1), np.array(vector2)))
        processed_data[combined_vector_name] = concatenated_vector
    # Add other vectors as-is
    for vector_name, vector in data.items():
        if not vector_name.startswith("manual-"):
            processed_data[vector_name] = vector
    return processed_data

# Calculate the novelty score for each vector within its type
def calculate_novelty(vectors_by_type):
    novelty_scores = defaultdict(list)
    for vector_type, vectors in vectors_by_type.items():
        for i, current_vector in enumerate(vectors):
            distances = [
                cosine(current_vector, other_vector)
                for j, other_vector in enumerate(vectors)
                if i != j  # Exclude self-comparison
            ]
            # Calculate and store the average distance (novelty score) for this vector
            average_distance = np.mean(distances) if distances else 0
            novelty_scores[vector_type].append(average_distance)
    return novelty_scores

# Perform the novelty score calculation across all JSON files in a directory
def compute_novelty_all_files(root_dir):
    all_files = glob.glob(os.path.join(root_dir, '**/*.json'), recursive=True)
    
    # Prepare dictionary to store all vectors by type after preprocessing
    all_vectors_by_type = defaultdict(list)
    
    # Read, preprocess, and collect vectors from each JSON file by type
    for file_path in all_files:
        data = preprocess_data(read_json_file(file_path))
        for vector_type, vector in data.items():
            all_vectors_by_type[vector_type].append(np.array(vector))

    # Calculate novelty scores for each vector type
    novelty_scores = calculate_novelty(all_vectors_by_type)

    # Print novelty scores
    for vector_type, scores in novelty_scores.items():
        average_score = np.mean(scores)
        print(f"Average novelty score for '{vector_type}': {average_score:.4f}")

    return novelty_scores

# Find pairs with the highest difference in average novelty scores
def find_highest_difference_pairs(novelty_scores):
    # Calculate average novelty scores for each type
    average_scores = {
        vector_type: np.mean(scores) for vector_type, scores in novelty_scores.items()
    }
    
    # Generate all unique pairs and calculate the differences
    differences = []
    for (type1, score1), (type2, score2) in combinations(average_scores.items(), 2):
        diff = abs(score1 - score2)
        differences.append(((type1, type2), diff))
    
    # Sort pairs by greatest difference
    sorted_diffs = sorted(differences, key=lambda pair_diff: pair_diff[1], reverse=True)
    return sorted_diffs

# Main function to initiate the process
def main(root_dir):
    novelty_scores = compute_novelty_all_files(root_dir)
    # Find pairs with highest differences and display them
    sorted_diffs = find_highest_difference_pairs(novelty_scores)
    print("Highest differing vector type pairs:")
    for (type1, type2), diff in sorted_diffs[:5]:  # Change number as needed to display more pairs
        print(f"{type1} - {type2}: {diff:.4f}")

if __name__ == "__main__":
    import sys
    root_dir = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else "path_to_your_directory"
    main(root_dir)
