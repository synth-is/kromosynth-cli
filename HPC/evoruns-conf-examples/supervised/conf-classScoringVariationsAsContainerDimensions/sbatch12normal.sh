#!/usr/bin/env bash

# read config file path from command line argument
config_file_path=$1
# set file name as variable
file_name=$(basename -- "$config_file_path")

for iteration in {1..1}; do

    # Generate the SLURM script to be submitted
    # "EOF" means "end of file"
    cat > submission_script.sh << EOF
#!/usr/bin/env bash

#SBATCH --account=ec12
#SBATCH --partition=normal
#SBATCH --job-name=kromosynth-conf-classScoringVariationsAsContainerDimensions-${file_name}
#SBATCH --output=/fp/projects01/ec29/bthj/slurm-output/kromosynth-conf-classScoringVariationsAsContainerDimensions-${file_name}-${iteration}.out
#SBATCH --ntasks=24
#SBATCH --mem-per-cpu=1885M
#SBATCH --cpus-per-task=2
#SBATCH --dependency=singleton
#SBATCH --time=00:30:30


## Print the hostnames where each task is running:
srun hostname

## cast model files to all nodes
srun mkdir -p \${SCRATCH}/models
cd /fp/projects01/ec29/bthj/kromosynth-evaluate/measurements/models/
for FILE in *; do
  echo "Casting model file: \$FILE"
  sbcast \$FILE \${SCRATCH}/models/\$FILE
done
srun mkdir -p \${SCRATCH}/tfjs-model_yamnet_tfjs_1
cd /fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/
for FILE in *; do
  echo "Casting model file: \$FILE"
  sbcast \$FILE \${SCRATCH}/tfjs-model_yamnet_tfjs_1/\$FILE
done


# Declare an associative array
declare -A pids

cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/
# Loop to create gRPC server instances
for ((i=1; i<=2; i++)); do
  # Generate a unique key using the loop index
  key="var_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/grpc-conf-classScoringVariationsAsContainerDimensions-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --modelUrl file:///localscratch/<job-ID>/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/grpc-conf-classScoringVariationsAsContainerDimensions-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-render/render-socket/
# Loop to create genome rendering server instances
for ((i=1; i<=10; i++)); do
  # Generate a unique key using the loop index
  key="render_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-conf-classScoringVariationsAsContainerDimensions-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --processTitle kromosynth-render-socket-server --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-conf-classScoringVariationsAsContainerDimensions-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-evaluate/evaluation/supervised/YAMNet-socket/
# Loop to create sound evaluation server instances
for ((i=1; i<=10; i++)); do
  # Generate a unique key using the loop index
  key="evaluate_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-socket-conf-classScoringVariationsAsContainerDimensions-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --modelUrl file:///localscratch/<job-ID>/tfjs-model_yamnet_tfjs_1/model.json --useGPU false --processTitle kromosynth-evaluation-socket-server --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-socket-conf-classScoringVariationsAsContainerDimensions-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/
apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file ${config_file_path} &

wait

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
