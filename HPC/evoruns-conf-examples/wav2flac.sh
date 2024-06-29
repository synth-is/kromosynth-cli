#!/bin/bash

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <source_dir> <destination_dir>"
    exit 1
fi

SOURCE_DIR=$(realpath "$1")
DEST_DIR=$(realpath "$2")

# Traverse the source directory and process each file
while IFS= read -r -d $'\0' src_file; do
    src_rel_path="${src_file#$SOURCE_DIR/}" # Remove SOURCE_DIR from the source file path
    src_rel_path_no_ext="${src_rel_path%.wav}" # Remove .wav extension from relative path
    dest_file="$DEST_DIR/$src_rel_path_no_ext.flac" # Create destination file path with .flac extension

    echo "Processing:"
    echo "Source file: $src_file"
    echo "Destination file: $dest_file"
    
    if [[ -e "$dest_file" ]]; then
        echo "Destination file already exists, skipping..."
        echo
        continue # Skip this file
    fi

    echo

    mkdir -p "$(dirname "$dest_file")" > /dev/null 2>&1 # Ensure destination directory exists
    
    # Convert WAV to FLAC using ffmpeg with maximum compression, ffmpeg output is redirected to null
    apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/ffmpeg-runner.sif ffmpeg -i "$src_file" -compression_level 12 "$dest_file" > /dev/null 2>&1

done < <(find "$SOURCE_DIR" -type f -name "*.wav" -print0) # Only find .wav files

echo "Process complete."
