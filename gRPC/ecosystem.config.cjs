module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      script : "./index.js",
      args: "--modelUrl file:///Users/bthj/Developer/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 1,
      exec_mode : "cluster",
      max_memory_restart: '700M',
      cron_restart: '*/10 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50051,
        "TF_FORCE_GPU_ALLOW_GROWTH": true
      }
    }
    ,
    {
      name   : "kromosynth-gRPC-evaluation",
      script : "./index.js",
      args: "--modelUrl file:///Users/bthj/Developer/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation",
      instances : 6,
      exec_mode : "cluster",
      max_memory_restart: '700M',
      cron_restart: '*/10 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50061,
        "TF_FORCE_GPU_ALLOW_GROWTH": true
      }
    }
  ]
}
