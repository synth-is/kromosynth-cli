#!/usr/bin/env bash

#SBATCH --account=ec29
#SBATCH --job-name=kromosynth-conf-duration_delta_pitch_combinations-singleCellWin
#SBATCH --output=kromosynth-conf-duration_delta_pitch_combinations-singleCellWin-100.out
#SBATCH --ntasks=10
#SBATCH --mem-per-cpu=16G
# #SBATCH --mem-per-gpu=16G
#SBATCH --partition=ifi_accel
#SBATCH --gpus=1
#SBATCH --dependency=singleton
#SBATCH --time=00:10:30

cd /fp/projects01/ec12/bthj/kromosynth/kromosynth-cli/gRPC/

# Declare an associative array
declare -A pids

# Loop to create gRPC server instances
for ((i=1; i<=4; i++)); do
  # Generate a unique key using the loop index
  key="var_${i}"

  rm /fp/projects01/ec12/bthj/kromosynth/gRPC-hosts/grpc-conf-duration_delta_pitch_combinations-singleCellWin-host-$i
  TF_FORCE_GPU_ALLOW_GROWTH=true apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env TF_FORCE_GPU_ALLOW_GROWTH=true /fp/projects01/ec12/bthj/kromosynth/kromosynth-runner.sif node index.js --modelUrl file:///fp/projects01/ec12/bthj/kromosynth/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec12/bthj/kromosynth/gRPC-hosts/grpc-conf-duration_delta_pitch_combinations-singleCellWin-host-$i &

  # Assign a value to the associative array using the unique key
  pids[$key]="$!"
done

cd /fp/projects01/ec12/bthj/kromosynth/kromosynth-cli/cli-app/
apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec12/bthj/kromosynth/kromosynth-runner.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec12/bthj/kromosynth/QD/conf-duration_delta_pitch_combinations-singleCellWin/evolution-runs.jsonc

# Access the pids stored in the associative array
for key in "${!pids[@]}"; do
  echo "Key: $key"
  echo "Value: ${pids[$key]}"
  kill -9 ${pids[$key]}
done

