#!/usr/bin/env bash

# read config file path from command line argument
config_file_path=$1
# set file name as variable
file_name=$(basename -- "$config_file_path")

while [[ $# -gt 1 ]] ; do
    key="$2"
    case $key in
        --features-script)
        features_script="$3"
        shift
        ;;
        --quality-script)
        quality_script="$3"
        shift
        ;;
        --projection-script)
        projection_script="$3"
        shift
        ;;
        --variation-server-count)
        variation_server_count="$3"
        shift
        ;;
        --rendering-server-count)
        rendering_server_count="$3"
        shift
        ;;
        --features-server-count)
        features_server_count="$3"
        shift
        ;;
        --quality-server-count)
        quality_server_count="$3"
        shift
        ;;
        --projection-server-count)
        projection_server_count="$3"
        shift
        ;;
        --total-server-count)
        total_server_count="$3"
        shift
        ;;
        --batch-count)
        batch_count="$3"
        shift
        ;;
        --account)
        account="$3"
        shift
        ;;
        *)
        ;;
    esac
    shift
done

echo "account: $account"
echo "features_script: $features_script"
echo "quality_script: $quality_script"
echo "projection_script: $projection_script"
echo "variation_server_count: $variation_server_count"
echo "rendering_server_count: $rendering_server_count"
echo "features_server_count: $features_server_count"
echo "quality_server_count: $quality_server_count"
echo "projection_server_count: $projection_server_count"
echo "total_server_count: $total_server_count"
echo "batch_count: $batch_count"

# for iteration in {1..1}}; do
for (( iteration=1; iteration<=$batch_count; iteration++ )); do

    # Generate the SLURM script to be submitted
    # "EOF" means "end of file"
    cat > submission_script.sh << EOF
#!/usr/bin/env bash

#SBATCH --account=${account}
#SBATCH --partition=normal
#SBATCH --job-name=${file_name}
#SBATCH --output=/fp/projects01/ec29/bthj/slurm-output/${file_name}-${iteration}.out
#SBATCH --ntasks=${total_server_count}
#SBATCH --mem-per-cpu=4G
#SBATCH --cpus-per-task=1
#SBATCH --dependency=singleton
#SBATCH --time=01:00:30

# Declare an associative array
declare -A pids

cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/
# Loop to create gRPC server instances
for ((i=1; i<=${variation_server_count}; i++)); do
  # Generate a unique key using the loop index
  key="var_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/grpc-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --max-old-space-size=1024 --modelUrl file:///fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/grpc-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-render/render-socket/
# Loop to create genome rendering server instances
for ((i=1; i<=${rendering_server_count}; i++)); do
  # Generate a unique key using the loop index
  key="render_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --max-old-space-size=1024 --processTitle kromosynth-render-socket-server --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/rendering-socket-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done


# cd not necessary here as the following uses absolute paths
cd /fp/projects01/ec29/bthj/kromosynth-evaluate/ 

# Loop to create evaluation-socket-server-features server instances
for ((i=1; i<=${features_server_count}; i++)); do
  # Generate a unique key using the loop index
  key="features_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-feature-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH=$PYTHONPATH:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU.sif python ${features_script} --host-info-file /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-feature-socket-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

# Loop to create evaluation-socket-server-quality server instances
for ((i=1; i<=${quality_server_count}; i++)); do
  # Generate a unique key using the loop index
  key="features_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-quality-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH=$PYTHONPATH:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU.sif python ${quality_script} --host-info-file /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-quality-socket-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

# Loop to create evaluation-socket-server-projection server instances
for ((i=1; i<=${projection_server_count}; i++)); do
  # Generate a unique key using the loop index
  key="features_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-projection-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env PYTHONPATH=$PYTHONPATH:/fp/projects01/ec29/bthj/kromosynth-evaluate /fp/projects01/ec29/bthj/kromosynth-runner-python-CPU.sif python ${projection_script} --host-info-file /fp/projects01/ec29/bthj/gRPC-hosts/evaluation-projection-socket-${file_name}-host-\$i  &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done


cd /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/
apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file ${config_file_path} --max-old-space-size=4096 &

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
