import sys
import os
import json
import glob
import numpy as np
from itertools import combinations
from scipy.spatial.distance import cosine
from collections import defaultdict

# Function to read JSON file into dictionary
def read_json_file(file_path):
    with open(file_path, 'r') as file:
        data = json.load(file)
    return data

# Function to preprocess the data creating new vectors by concatenating "manual-" pairs
def preprocess_data(data):
    manual_vectors = {k: v for k, v in data.items() if k.startswith("manual-")}
    for (type1, vector1), (type2, vector2) in combinations(manual_vectors.items(), 2):
        combined_vector_name = f"{type1}+{type2}"
        concatenated_vector = np.concatenate((np.array(vector1), np.array(vector2)))
        data[combined_vector_name] = concatenated_vector.tolist()
    for manual_vector in manual_vectors:
        del data[manual_vector]
    return data

# Compare corresponding vector types across all JSON files in a directory tree
def compare_directory_tree(root_dir):
    # Find all JSON files in the directory tree
    all_files = glob.glob(os.path.join(root_dir, '**/*.json'), recursive=True)

    # Check that we have at least two files to compare
    if len(all_files) < 2:
        print("Need at least two JSON files to compare.")
        return

    # Create a default dictionary to hold accumulated cosine distances and counts
    total_cosine_distances = defaultdict(lambda: {'total': 0.0, 'count': 0})

    # Perform pairwise comparisons between all files
    for i, file1 in enumerate(all_files):
        data1 = preprocess_data(read_json_file(file1))

        for file2 in all_files[i+1:]:
            data2 = preprocess_data(read_json_file(file2))
            print(f"\nComparing '{file1}' and '{file2}'")
            for vector_type in data1:
                if vector_type in data2:
                    vec1 = np.array(data1[vector_type])
                    vec2 = np.array(data2[vector_type])
                    cosine_distance = cosine(vec1, vec2)
                    total_cosine_distances[vector_type]['total'] += cosine_distance
                    total_cosine_distances[vector_type]['count'] += 1

    # Compute average cosine distances
    average_cosine_distances = {}
    for vector_type, distance_data in total_cosine_distances.items():
        if distance_data['count'] > 0:
            average_cosine_distances[vector_type] = distance_data['total'] / distance_data['count']
            print(f"Average cosine distance for '{vector_type}': {average_cosine_distances[vector_type]:.4f}")

    # Find the pair of vector types with the largest average cosine distance difference
    vector_types_sorted = sorted(average_cosine_distances.keys())
    largest_difference = 0
    largest_pair = (None, None)
    for i, vt1 in enumerate(vector_types_sorted):
        for vt2 in vector_types_sorted[i+1:]:
            difference = abs(average_cosine_distances[vt1] - average_cosine_distances[vt2])
            if difference > largest_difference:
                largest_difference = difference
                largest_pair = (vt1, vt2)

    if largest_pair[0] and largest_pair[1]:
        print(f"\nThe largest average difference in cosine distances is between '{largest_pair[0]}' and '{largest_pair[1]}', which is {largest_difference:.4f}.")

# Pairwise comparison of all JSON files in the directory tree
if len(sys.argv) < 2:
    print("Please provide the root directory path.")
    sys.exit(1)

root_directory = sys.argv[1]
compare_directory_tree(root_directory)
