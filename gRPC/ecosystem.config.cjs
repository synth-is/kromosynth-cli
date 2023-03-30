module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      script : "./index.js",
      args: "--modelUrl file:///Users/bjornpjo/Developer/apps/kromosynth/workers/audio-classification/tfjs-model/yamnet/tfjs/1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 8,
      exec_mode : "cluster",
      max_memory_restart: '700M',
      cron_restart: '*/10 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50051,
      }
    }
    ,
    {
      name   : "kromosynth-gRPC-evaluation",
      script : "./index.js",
      args: "--modelUrl file:///Users/bjornpjo/Developer/apps/kromosynth/workers/audio-classification/tfjs-model/yamnet/tfjs/1/model.json --processTitle kromosynth-gRPC-evaluation",
      instances : 8,
      exec_mode : "cluster",
      max_memory_restart: '700M',
      cron_restart: '*/10 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50061,
      }
    }
  ]
}
