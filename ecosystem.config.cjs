
module.exports = {
    apps : [
      {
        name   : "kromosynth-gRPC-variation",
        script : "gRPC/index.js",
        args: "--modelUrl file:///Users/bjornpjo/Developer/vendor/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
        instances : 1,
        exec_mode : "cluster",
        max_memory_restart: '700M',
        cron_restart: '*/10 * * * *',
        increment_var : 'PORT',
        env: {
          "PORT": 50051,
          "TF_FORCE_GPU_ALLOW_GROWTH": true
        }
      },
      { // see the `kromosynth-render` repository
        name   : "kromosynth-render-socket-server",
        script : "/Users/bjornpjo/Developer/apps/kromosynth-render/render-socket/socket-server-floating-points.js",
        args: "--processTitle kromosynth-render-socket-server",
        instances : 1,
        exec_mode : "cluster",
        max_memory_restart: '700M',
        cron_restart: '*/10 * * * *',
        increment_var : 'PORT',
        env: {
          "PORT": 30051,
          "TF_FORCE_GPU_ALLOW_GROWTH": true
        }
      },
      { // see the `kromosynth-evaluate` repository
        name   : "kromosynth-evaluation-socket-server",
        script : "/Users/bjornpjo/Developer/apps/kromosynth-evaluate/YAMNet-socket/index.js",
        args: "--processTitle kromosynth-evaluation-socket-server",
        instances : 1,
        exec_mode : "cluster",
        max_memory_restart: '700M',
        cron_restart: '*/10 * * * *',
        increment_var : 'PORT',
        env: {
          "PORT": 40051,
          "TF_FORCE_GPU_ALLOW_GROWTH": true
        }
      }
      ,
      {
        name   : "kromosynth-controller",
        script : "cli-app/kromosynth.js",
        args: "evolution-runs --evolution-runs-config-json-file /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/conf/evolution-runs.jsonc",
        instances : 1,
        exec_mode : "fork",
        max_memory_restart: '4G',
        cron_restart: '*/30 * * * *'
      }
    ]
  }
  