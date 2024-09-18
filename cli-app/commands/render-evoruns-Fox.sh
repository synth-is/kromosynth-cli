#!/bin/sh

# call like: /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/commands/render-evoruns.sh /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns /Users/bjornpjo/Downloads/evorenders

# Root directory with evoruns, first argument to the script
root_evoruns_dir=$1
root_evorenders_dir=$2

echo "Root evoruns directory: $root_evoruns_dir"
echo "Root evorenders directory: $root_evorenders_dir"

command_to_execute() {
  local dir=$1
  local output_dir=$2
  echo "Rendering WAV files for the last generation of evoruns in folder: $dir"
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/kromosynth.js render-evorun --evo-run-dir-path "$dir" --write-to-folder "$output_dir" --owerwrite-existing-files true --score-in-file-name false
}

# Function to check if a folder name is in the list of excluded names
is_excluded_folder() {
  local folder=$1
  local basename=${folder##*/}
  if [[ "$basename" == *failed-genes || "$basename" == umap_model || "$basename" == cellFeatures || "$basename" == .git || "basename" == soundobjects ]]; then
    echo "Excluded: $folder (matches exclusion pattern)"
    return 0
  else
    return 1
  fi
}

# Function to find all leaf directories
find_leaf_directories() {
  local root_dir=$1

  # Set nullglob for this function
  setopt local_options nullglob

  find "$root_dir" -type d ! -name "$(basename "$root_dir")" ! -path "*.git*" -print | while read -r dir; do
    echo "Checking directory: $dir"
    
    # Check if directory is empty or has only excluded subdirectories
    local has_only_excluded=true
    local subdir_count=0

    for subdir in "$dir"/*; do
      # Increment the subdir count every time we encounter a directory
      let subdir_count++
      if [ -d "$subdir" ] && ! is_excluded_folder "$subdir"; then
        has_only_excluded=false
        break
      fi
    done

    # If subdir_count is 0 or the directory has only excluded subdirectories
    if [ $subdir_count -eq 0 ] || $has_only_excluded; then
      if ! is_excluded_folder "$dir"; then
        echo "Found leaf directory: $dir"
        echo "$dir"
      fi
    fi
  done

  # Unset nullglob after the check is done to restore normal behavior
  unsetopt nullglob
}

# Check if the required arguments are provided
if [ $# -ne 2 ]; then
  echo "Usage: $0 <root_evoruns_dir> <root_evorenders_dir>"
  exit 1
fi

# Check if the provided directories exist
if [ ! -d "$root_evoruns_dir" ] || [ ! -d "$root_evorenders_dir" ]; then
  echo "Error: One or both of the specified directories do not exist."
  exit 1
fi

# Find all leaf directories
echo "Finding leaf directories..."
leaf_dirs=()
while IFS= read -r dir; do
  leaf_dirs+=("$dir")
done < <(find_leaf_directories "$root_evoruns_dir")

# Check if any leaf directories were found
if [ ${#leaf_dirs[@]} -eq 0 ]; then
  echo "No leaf directories found. Exiting."
  exit 0
fi

echo "Total leaf directories found: ${#leaf_dirs[@]}"

# Process each leaf directory
echo "Processing leaf directories..."
for dir in "${leaf_dirs[@]}"; do
  if [ -d "$dir" ] && [ -r "$dir" ]; then
    if ! is_excluded_folder "$dir"; then
      echo "Processing directory: $dir"
      command_to_execute "$dir" "$root_evorenders_dir"
    else
      echo "Skipping excluded directory: $dir"
    fi
  else
    echo "Skipping inaccessible directory: $dir"
  fi
done

echo "Processing complete."
