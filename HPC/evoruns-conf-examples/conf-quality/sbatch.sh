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

#SBATCH --job-name=${file_name}
#SBATCH --output=/home/bthj/slurm-output/${file_name}-${iteration}.out
#SBATCH --ntasks=31
#SBATCH --mem-per-cpu=4G
#SBATCH --cpus-per-task=1
#SBATCH --dependency=singleton
#SBATCH --time=03:00:30

# Declare an associative array
declare -A pids

cd /home/bthj/kromosynth-cli/gRPC/
# Loop to create gRPC server instances
for ((i=1; i<=6; i++)); do
  # Generate a unique key using the loop index
  key="var_\${i}"

  rm /home/bthj/gRPC-hosts/grpc-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/home/bthj,destination=/home/bthj' /home/bthj/kromosynth-runner-CPU.sif node index.js --modelUrl file:///home/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /home/bthj/gRPC-hosts/grpc-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /home/bthj/kromosynth-render/render-socket/
# Loop to create genome rendering server instances
for ((i=1; i<=6; i++)); do
  # Generate a unique key using the loop index
  key="render_\${i}"

  rm /home/bthj/gRPC-hosts/rendering-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/home/bthj,destination=/home/bthj' /home/bthj/kromosynth-runner-CPU.sif node socket-server-floating-points.js --processTitle kromosynth-render-socket-server --hostInfoFilePath /home/bthj/gRPC-hosts/rendering-socket-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done


# cd not necessary here as the following uses absolute paths
cd /home/bthj/kromosynth-evaluate/ 

# Loop to create evaluation-socket-server-features server instances
for ((i=1; i<=6; i++)); do
  # Generate a unique key using the loop index
  key="features_\${i}"

  rm /home/bthj/gRPC-hosts/evaluation-feature-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/home/bthj,destination=/home/bthj' --env PYTHONPATH=$PYTHONPATH:/home/bthj/kromosynth-evaluate /home/bthj/kromosynth-runner-python-CPU.sif python /home/bthj/kromosynth-evaluate/evaluation/unsupervised/features_mfcc.py --sample-rate 16000 --host localhost --force-host true --port 31051 --host-info-file /home/bthj/gRPC-hosts/evaluation-feature-socket-${file_name}-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

# Loop to create evaluation-socket-server-quality-problems server instances
for ((i=1; i<=6; i++)); do
  # Generate a unique key using the loop index
  key="features_\${i}"

  rm /home/bthj/gRPC-hosts/evaluation-quality-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/home/bthj,destination=/home/bthj' --env PYTHONPATH=$PYTHONPATH:/home/bthj/kromosynth-evaluate /home/bthj/kromosynth-runner-python-CPU.sif python /home/bthj/kromosynth-evaluate/evaluation/unsupervised/quality_problems.py --sample-rate 16000 --host localhost --force-host true --port 32051 --host-info-file /home/bthj/gRPC-hosts/evaluation-quality-socket-${file_name}-host-\$i --quality-methods 'click_count_percentage,discontinuity_count_percentage,gaps_count_percentage,saturation_percentage,true_peak_clipping_percentage,noise_burst_percentage,compressibility_percentage' &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

# Loop to create evaluation-socket-server-projection_pca_quantised server instances
for ((i=1; i<=6; i++)); do
  # Generate a unique key using the loop index
  key="features_\${i}"

  rm /home/bthj/gRPC-hosts/evaluation-projection-socket-${file_name}-host-\$i
  apptainer exec --mount 'type=bind,source=/home/bthj,destination=/home/bthj' --env PYTHONPATH=$PYTHONPATH:/home/bthj/kromosynth-evaluate /home/bthj/kromosynth-runner-python-CPU.sif python /home/bthj/kromosynth-evaluate/evaluation/unsupervised/projection_pca_quantised.py --dimensions 2 --dimension-cells 50 --host localhost --force-host true --port 33051 --host-info-file /home/bthj/gRPC-hosts/evaluation-projection-socket-${file_name}-host-\$i  &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done


cd /home/bthj/kromosynth-cli/cli-app/
apptainer exec --mount 'type=bind,source=/home/bthj,destination=/home/bthj' /home/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file ${config_file_path} &

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
