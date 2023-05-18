#!/usr/bin/env bash

for iteration in {1..4}; do

    # Generate the SLURM script to be submitted
    # "EOF" means "end of file"
    cat > submission_script.sh << EOF
#!/usr/bin/env bash

#SBATCH --account=ec29
#SBATCH --job-name=kromosynth-test
#SBATCH --output=kromosynth-test-${iteration}.out

#SBATCH --ntasks=5

#SBATCH --mem-per-cpu=4G
# #SBATCH --mem-per-cpu=1G

#SBATCH --partition=ifi_accel
#SBATCH --gpus=1
#SBATCH --dependency=singleton

#SBATCH --time=00:15:30
# #SBATCH --time=00:01:30

cd /fp/projects01/ec12/bthj/kromosynth/kromosynth-cli/gRPC/


# Declare an associative array
declare -A pids

# Loop from 1 to 3
for ((i=1; i<=3; i++)); do
  # Generate a unique key using the loop index
  key="var_\${i}"

  rm /fp/projects01/ec12/bthj/kromosynth/grpc-test-host-\$i
  TF_FORCE_GPU_ALLOW_GROWTH=true apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env TF_FORCE_GPU_ALLOW_GROWTH=true /fp/projects01/ec12/bthj/kromosynth/kromosynth-runner.sif node index.js --modelUrl file:///fp/projects01/ec12/bthj/kromosynth/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec12/bthj/kromosynth/grpc-test-host-\$i &

  # Assign a value to the associative array using the unique key
  pids[\$key]="\$!"
done

cd /fp/projects01/ec12/bthj/kromosynth/kromosynth-cli/cli-app/
apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec12/bthj/kromosynth/kromosynth-runner.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec12/bthj/kromosynth/QD/conf/evolution-runs.jsonc

# Access the pids stored in the associative array
for key in "\${!pids[@]}"; do
  echo "Key: \$key"
  echo "Value: \${pids[\$key]}"
  kill -9 \${pids[\$key]}
done


# for rpcnum in {1..1}; do
#   rm /fp/projects01/ec12/bthj/kromosynth/grpc-test-host-\$rpcnum
#   TF_FORCE_GPU_ALLOW_GROWTH=true apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' --env TF_FORCE_GPU_ALLOW_GROWTH=true /fp/projects01/ec12/bthj/kromosynth/kromosynth-runner.sif node index.js --modelUrl file:///fp/projects01/ec12/bthj/kromosynth/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec12/bthj/kromosynth/grpc-test-host-\$rpcnum &
#   eval "gRPC_PID_\${rpcnum}"="\$!"
#   echo "\$RPC_\${rpcnum}"
# done

# cd /fp/projects01/ec12/bthj/kromosynth/kromosynth-cli/cli-app/
# apptainer exec --nv --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec12/bthj/kromosynth/kromosynth-runner.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec12/bthj/kromosynth/QD/conf/evolution-runs.jsonc

# for rpcnum in {1..1}; do
#   echo \$RPC_\${rpcnum}
#   kill \$RPC_\${rpcnum}
# done


EOF

    # Submit the generated script
    sbatch submission_script.sh

done
