#!/usr/bin/env bash

RUN_IDX=$1
ITERATION_IDX=$2

for iteration in {1..6}; do

    # Generate the SLURM script to be submitted
    # "EOF" means "end of file"
    cat > submission_script.sh << EOF
#!/usr/bin/env bash

#SBATCH --account=$3
#SBATCH --job-name=kromosynth-conf-static_mutation_rate_combinations-singleCellWin_runIdx_${RUN_IDX}_iter_${ITERATION_IDX}
#SBATCH --output=/fp/projects01/ec29/bthj/slurm-output/kromosynth-conf-static_mutation_rate_combinations-singleCellWin_runIdx_${RUN_IDX}_iter_${ITERATION_IDX}-${iteration}.out
#SBATCH --ntasks=18
#SBATCH --mem-per-cpu=32G
# #SBATCH --mem-per-gpu=16G
#SBATCH --partition=$4
#SBATCH --gpus=1
#SBATCH --dependency=singleton
#SBATCH --time=00:30:30

cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/

# Declare an associative array
declare -A pids

# Loop to create gRPC server instances
for ((i=1; i<=16; i++)); do
  # Generate a unique key using the loop index
  key="var_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/grpc-conf-static_mutation_rate_combinations-singleCellWin-host-${RUN_IDX}-${ITERATION_IDX}-\$i
  TF_FORCE_GPU_ALLOW_GROWTH=true apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env TF_FORCE_GPU_ALLOW_GROWTH=true /fp/projects01/ec29/bthj/kromosynth-runner.sif node index.js --modelUrl file:///fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/grpc-conf-static_mutation_rate_combinations-singleCellWin-host-${RUN_IDX}-${ITERATION_IDX}-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/
TF_FORCE_GPU_ALLOW_GROWTH=true apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env TF_FORCE_GPU_ALLOW_GROWTH=true /fp/projects01/ec29/bthj/kromosynth-runner.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-static_mutation_rate_combinations-singleCellWin/evolution-runs.jsonc --evolution-runs-config-json-file-run-index ${RUN_IDX} --evolution-runs-config-json-file-run-iteration ${ITERATION_IDX}

# Access the pids stored in the associative array
for key in "\${!pids[@]}"; do
  echo "Key: \$key"
  echo "Value: \${pids[\$key]}"
  kill -9 \${pids[\$key]}
done

EOF

    # Submit the generated script
    sbatch submission_script.sh

done
