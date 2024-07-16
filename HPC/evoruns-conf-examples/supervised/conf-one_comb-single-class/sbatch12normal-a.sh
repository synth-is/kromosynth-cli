#!/usr/bin/env bash

for iteration in {1..48}; do

    # Generate the SLURM script to be submitted
    # "EOF" means "end of file"
    cat > submission_script.sh << EOF
#!/usr/bin/env bash

#SBATCH --account=ec12
#SBATCH --partition=normal
#SBATCH --job-name=kromosynth-conf-one_comb-single-class-a-CPU
#SBATCH --output=/fp/projects01/ec29/bthj/slurm-output/kromosynth-conf-one_comb-single-class-a-CPU-${iteration}.out
#SBATCH --ntasks=64
#SBATCH --mem-per-cpu=1885M
#SBATCH --cpus-per-task=2
#SBATCH --dependency=singleton
#SBATCH --time=00:30:30

cd /fp/projects01/ec29/bthj/kromosynth-cli/gRPC/

# Declare an associative array
declare -A pids

# Loop to create gRPC server instances
for ((i=1; i<=63; i++)); do
  # Generate a unique key using the loop index
  key="var_\${i}"

  rm /fp/projects01/ec29/bthj/gRPC-hosts/grpc-conf-one_comb-single-class-CPU-host-\$i
  apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node index.js --modelUrl file:///fp/projects01/ec29/bthj/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation --hostInfoFilePath /fp/projects01/ec29/bthj/gRPC-hosts/grpc-conf-one_comb-single-class-CPU-host-\$i &

  # Assign a value to the associative array using the unique key

  pids[\$key]="\$!"
done

cd /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-a.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-b.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-c.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-d.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-e.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-f.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-g.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-h.jsonc &
apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-i.jsonc &
# apptainer exec --mount 'type=bind,source=/fp/projects01,destination=/fp/projects01' /fp/projects01/ec29/bthj/kromosynth-runner-CPU.sif node kromosynth.js evolution-runs --evolution-runs-config-json-file /fp/projects01/ec29/bthj/QD/conf-one_comb-single-class/evolution-runs-j.jsonc &

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
