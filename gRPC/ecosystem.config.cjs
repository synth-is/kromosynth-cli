module.exports = {
  apps : [{
    name   : "kromosynth-gRPC",
    script : "./index.js",
    args: "--modelUrl file:///Users/bjornpjo/Developer/apps/kromosynth/workers/audio-classification/tfjs-model/yamnet/tfjs/1/model.json",
    instances : 4,
    exec_mode : "cluster",
    max_memory_restart: '1G',
    increment_var : 'PORT',
    env: {
      "PORT": 50051,
    }
  }]
}
