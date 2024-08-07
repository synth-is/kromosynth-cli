
module.exports = {
    apps : [
      {
        name   : "kromosynth-gRPC-variation",
        script : "gRPC/index.js",
        args: "--modelUrl file:///Users/bjornpjo/Developer/vendor/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
        instances : 1,
        exec_mode : "cluster",
        max_memory_restart: '700M',
        // cron_restart: '0 * * * *',
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
        instances : 2,
        exec_mode : "cluster",
        max_memory_restart: '700M',
        // cron_restart: '0 * * * *',
        increment_var : 'PORT',
        env: {
          "PORT": 30051,
          "TF_FORCE_GPU_ALLOW_GROWTH": true
        }
      },
      { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
        name   : "kromosynth-evaluation-socket-server_features",
        interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/.venv/bin/python3',
        cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
        script : "features.py",
        args: "--host 127.0.0.1",
        instances : 2,
        exec_mode : "fork",
        max_memory_restart: '2G',
        // cron_restart: '*/30 * * * *',
        increment_var : 'PORT',
        env: {
          "PORT": 31051,
        }
      }
      // ,
      // { // see the `kromosynth-evaluate` repository
      //   name   : "kromosynth-evaluation-socket-server",
      //   script : "/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/supervised/Node-socket/hnsw.js",
      //   args: "--processTitle kromosynth-evaluation-socket-server --modelUrl file:///Users/bjornpjo/Developer/apps/kromosynth-evaluate/measurements/models/hnsw-indexes/NSynth_1Billion_OrchideaSOL_-_filtered_-_mfcc --spaceName cosine // if not numNeighbors, then returns all: --numNeighbors 5",
      //   instances : 1,
      //   exec_mode : "cluster",
      //   max_memory_restart: '700M',
      //   cron_restart: '0 * * * *',
      //   increment_var : 'PORT',
      //   env: {
      //     "PORT": 40051,
      //     "TF_FORCE_GPU_ALLOW_GROWTH": true
      //   }
      // }
      ,
      {
        name   : "kromosynth-controller",
        script : "cli-app/kromosynth.js",
        args: "evolution-runs --max-old-space-size=4096 --evolution-runs-config-json-file /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/conf/evolution-runs_datasets.jsonc",
        instances : 1,
        exec_mode : "fork",
        max_memory_restart: '4G',
        cron_restart: '0 */2 * * *',
      }
    ]
  }
  