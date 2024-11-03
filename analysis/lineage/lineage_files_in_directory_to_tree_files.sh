#!/bin/bash

set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <directory> <output_dir>"
    exit 1
fi

DIR=$1
OUTPUT_DIR=$2
SCRIPT_PATH="/fp/projects01/ec29/bthj/kromosynth-cli/analysis/lineage/lineage-to-tree-files.js"
APPTAINER_IMAGE="/fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif"

find "$DIR" -name '*.json' | while read -r json_file; do
    apptainer exec --mount "type=bind,source=/fp/projects01,destination=/fp/projects01" \
                   --mount "type=bind,source=/cluster/work/projects/ec29/bthj,destination=/cluster/work/projects/ec29/bthj" \
                   "$APPTAINER_IMAGE" node "$SCRIPT_PATH" "$json_file" "$OUTPUT_DIR"
    if [ $? -eq 0 ]; then
        echo "Successfully processed $json_file"
    else
        echo "Failed to process $json_file"
    fi
done

# call e.g. like:
# /fp/projects01/ec29/bthj/kromosynth-cli/analysis/lineage/lineage_files_in_directory_to_tree_files.sh /cluster/work/projects/ec29/bthj/lineage-renders /cluster/work/projects/ec29/bthj/lineage-trees