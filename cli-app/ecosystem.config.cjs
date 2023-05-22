
module.exports = {
    apps : [
      {
        name   : "kromosynth-controller",
        script : "./kromosynth.js",
        args: "evolution-runs --evolution-runs-config-json-file /projects/robin/users/bthj/QD/conf-static_mutation_rate_combinations_-_delete_rates/evolution-runs.jsonc",
        instances : 1,
        exec_mode : "fork",
        max_memory_restart: '4G',
        cron_restart: '*/30 * * * *'
      }
    ]
  }
  