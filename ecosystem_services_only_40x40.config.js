module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      interpreter: '/Users/bjornpjo/.nvm/versions/node/v18.20.3/bin/node',
      script : "gRPC/index.js",
      args: "--max-old-space-size=1024 --modelUrl file:///Users/bjornpjo/Developer/vendor/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 1,
      exec_mode : "cluster",
      // max_memory_restart: '700M',
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      // cron_restart: '0 * * * *', // every hour
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
      instances : 1,
      exec_mode : "cluster",
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      // cron_restart: '0 * * * *', // every hour
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
      instances : 1,
      exec_mode : "fork",
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      // cron_restart: '0 * * * *', // every hour
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
      instances : 1,
      exec_mode : "fork",
      max_memory_restart: '2G',
      // cron_restart: '*/30 * * * *',
      // cron_restart: '0 * * * *', // every hour
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
      args: "--host 127.0.0.1 --dimensions 2 --dimension-cells 40",
      instances : 1,
      exec_mode : "fork",
      max_memory_restart: '8G',
      // cron_restart: '*/30 * * * *',
      // restart every three hours, as UMAP leaks memory: https://github.com/lmcinnes/umap/issues/535
      // cron_restart: '0 */3 * * *',
      // cron_restart: '0 * * * *', // every hour
      increment_var : 'PORT',
      env: {
        "PORT": 33051,
      }
    }
  ]
}
