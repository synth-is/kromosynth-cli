module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      script : "./index.js",
      args: "--modelUrl file:///app/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 8,
      exec_mode : "cluster",
      max_memory_restart: '700M',
      cron_restart: '* * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50051,
      }
    }
    ,
    {
      name   : "kromosynth-gRPC-evaluation",
      script : "./index.js",
      args: "--modelUrl file:///app/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-evaluation",
      instances : 8,
      exec_mode : "cluster",
      max_memory_restart: '700M',
      cron_restart: '* * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50061,
      }
    }
  ]
}