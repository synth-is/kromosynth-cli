module.exports = {
  apps : [
    {
      name   : "kromosynth-gRPC-variation",
      script : "/fp/projects01/ec12/bthj/kromosynth/kromosynth-cli/gRPC/index.js",
      args: "--modelUrl file:///fp/projects01/ec12/bthj/kromosynth/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
      instances : 2,
      exec_mode : "cluster",
      cron_restart: '*/10 * * * *',
      increment_var : 'PORT',
      env: {
        "PORT": 50051,
        "TF_FORCE_GPU_ALLOW_GROWTH": true
      }
    }
  ]
}
