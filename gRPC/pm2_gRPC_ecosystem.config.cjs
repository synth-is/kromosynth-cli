module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      script : "./index.js",
      args: "--modelUrl file:///fp/projects01/ec12/bthj/kromosynth/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 1,
      exec_mode : "cluster",
      max_memory_restart: '2G',
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
      args: "--modelUrl file:///fp/projects01/ec12/bthj/kromosynth/tfjs-model_yamnet_tfjs_1/model.json/model.json --processTitle kromosynth-gRPC-evaluation",
      instances : 1,
      exec_mode : "cluster",
      max_memory_restart: '2G',
      cron_restart: '*/10 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50061,
        "TF_FORCE_GPU_ALLOW_GROWTH": true
      }
    }
  ]
}
