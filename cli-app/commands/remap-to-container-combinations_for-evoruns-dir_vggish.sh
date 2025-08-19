#!/bin/bash

# Define the path and the list of features
path="/cluster/work/projects/ec29/bthj/evoruns/singleMapBDs/"
features=(
  # "spectral_centroid"
  # "spectral_flatness"
  # "spectral_spread"
  # "spectral_skewness"
  # "spectral_kurtosis"
  "spectral_rolloff"
  # "spectral_decrease"
  "spectral_slope"
  # "spectral_flux"
  # "zero_crossing_rate"
)

# List all folders at the given path, excluding those ending with "_failed-genes" and only including those with "vggish"
folders=$(find "$path" -mindepth 1 -maxdepth 1 -type d ! -name "*_failed-genes" -name "*vggish*" -exec basename {} \;)

# Iterate over each folder
for folder in $folders; do
  # Iterate over each combination of features
  for ((i = 0; i < ${#features[@]}; i++)); do
    for ((j = i + 1; j < ${#features[@]}; j++)); do
      feature_combination="${features[i]}X${features[j]}"
      feature_list="${features[i]},${features[j]}"
      command="./remap-between-elite-containers_fox.sh \"$path\" \"$folder\" customRef1 \"$feature_combination\" vggish \"/manual?features=$feature_list\" \"/raw\""
      echo "Executing: $command"
      eval $command
    done
  done
done