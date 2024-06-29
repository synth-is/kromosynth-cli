#!/bin/bash

target_directory=$1

every_nth_generation=$2

write_to_folder=$3

score_in_filename=$4

echo "target_directory: $target_directory"
echo "every_nth_generation: $every_nth_generation"
echo "write_to_folder: $write_to_folder"
echo "score_in_filename: $score_in_filename"

exclude_suffix="_failed-genes"

# set write_to_folder as variable containing the same values as $target_directory, with "evoruns" replaced by "evoruns-rendered"
# write_to_folder=${target_directory/evoruns/evoruns-rendered}

# Loop through the directories in the target directory
for directory in "$target_directory"/*/; do
    # Remove trailing slash from directory path
    directory="${directory%/}"

    # Extract directory name
    dir_name="${directory##*/}"

    # Check if the directory ends with the excluded suffix
    if [[ ! "$dir_name" == *"$exclude_suffix" ]]; then
        # Render the evorun folder
        echo "Rendering the evorun in: $directory"
        apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/kromosynth.js render-evorun --evo-run-dir-path $directory --write-to-folder $write_to_folder --every-nth-generation $every_nth_generation --owerwrite-existing-files false --score-in-file-name $score_in_filename
    fi
done