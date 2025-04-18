module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      interpreter: '/Users/bjornpjo/.nvm/versions/node/v18.20.3/bin/node',
      script : "gRPC/genomeVariationWS.js",
      args: "--max-old-space-size=1024 --modelUrl file:///Users/bjornpjo/Developer/vendor/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 3,
      exec_mode : "cluster",
      // max_memory_restart: '700M',
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50051,
        "TF_FORCE_GPU_ALLOW_GROWTH": true
      }
    }
    ,
    { // see the `kromosynth-render` repository: https://github.com/synth-is/kromosynth-render
      name   : "kromosynth-render-socket-server",
      interpreter: '/Users/bjornpjo/.nvm/versions/node/v18.20.3/bin/node',
      script : "/Users/bjornpjo/Developer/apps/kromosynth-render/render-socket/socket-server-floating-points.js",
      args: "--max-old-space-size=1024 --processTitle kromosynth-render-socket-server",
      instances : 3,
      exec_mode : "cluster",
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 30051,
        "TF_FORCE_GPU_ALLOW_GROWTH": true
      }
    }
    ,
    { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
      name   : "kromosynth-evaluation-socket-server_features",
      interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/.venv/bin/python3',
      cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
      script : "features.py",
      args: "--host 127.0.0.1 --models-path /Users/bjornpjo/Developer/apps/kromosynth-evaluate/measurements/models",
      instances : 3,
      exec_mode : "fork",
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 31051,
      }
    }
    ,
    { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
      name   : "kromosynth-evaluation-socket-server_quality_ref_features",
      interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/.venv/bin/python3', // NB: different python environment
      cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
      script : "quality_ref_features.py",
      args: "--host 127.0.0.1",
      instances : 3,
      exec_mode : "fork",
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 32051,
      }
    }
    ,
    { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
      name   : "kromosynth-evaluation-socket-server_projection_pca_quantised",
      interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/.venv/bin/python3',
      cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
      script : "projection_quantised.py",
      args: "--host 127.0.0.1 --dimensions 2 --dimension-cells 100",
      instances : 3,
      exec_mode : "fork",
      max_memory_restart: '4G',
      // cron_restart: '*/30 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 33051,
      }
    }
    // ,
    // {
    //   name   : "kromosynth-controller",
    //   script : "cli-app/kromosynth.js",
    //   args: "evolution-runs --max-old-space-size=4096 --evolution-runs-config-json-file /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/conf/evolution-runs_map-switch.jsonc",
    //   instances : 1,
    //   // exec_mode : "fork",
    //   max_memory_restart: '4G',
    //   // cron_restart: '0 */3 * * *' // every 3 hours
    //   // cron_restart: '*/30 * * * *' // every 30 minutes
    //   // cont restart every hour
    //   // cron_restart: '0 * * * *'
    // }
  ]
}
