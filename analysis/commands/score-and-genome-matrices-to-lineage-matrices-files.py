import os
import json
import re

def find_files(base_directory, pattern):
    """Find files that match the pattern in a directory tree."""
    matching_files = []
    for root, _, files in os.walk(base_directory):
        for file in files:
            if re.match(pattern, file):
                matching_files.append(os.path.join(root, file))
    return matching_files

def read_json_content(filepath):
    """Read JSON content from a file."""
    with open(filepath, 'r') as file:
        return json.load(file)

def write_json_content(destination_directory, filename, content):
    """Write JSON content to a file."""
    if not os.path.exists(destination_directory):
        os.makedirs(destination_directory)
    filepath = os.path.join(destination_directory, filename)
    with open(filepath, 'w') as file:
        json.dump(content, file, indent=4)
    print(f"Written: {filepath}")

def main(base_directory, destination_directory, pattern):
    all_matching_files = find_files(base_directory, pattern)
    
    for file_path in all_matching_files:
        content = read_json_content(file_path)
        
        if 'evoRuns' in content:
            for evo_run in content['evoRuns']:
                if 'iterations' in evo_run:
                    for iteration in evo_run['iterations']:
                        filename = f"matrix_{iteration['id']}.json"
                        write_json_content(destination_directory, filename, iteration)

if __name__ == "__main__":
    base_directory = "/fp/projects01/ec29/bthj/QD/analysis/unsupervised/singleMapBDs"  # Change this to the path of your base directory
    destination_directory = "/cluster/work/projects/ec29/bthj/lineage-matrices"  # Change this to the path where new files should be stored
    pattern = r'evolution-run-analysis_score-and-genome-matrices_.*\.json'

    main(base_directory, destination_directory, pattern)
