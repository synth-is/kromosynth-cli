
module.exports = {
    apps : [
      {
        name   : "kromosynth-controller",
        script : "./kromosynth.js",
        args: "evolution-runs --evolution-runs-config-json-file /projects/robin/users/bthj/QD/conf-static_mutation_rate_combinations_-_delete_rates/evolution-runs.jsonc",
        instances : 1,
        exec_mode : "fork",
        max_memory_restart: '4G',
        cron_restart: '*/30 * * * *',
        increment_var : 'PORT',
        env: {
          "PORT": 50051,
          "TF_FORCE_GPU_ALLOW_GROWTH": true
        }
      }
    ]
  }
  