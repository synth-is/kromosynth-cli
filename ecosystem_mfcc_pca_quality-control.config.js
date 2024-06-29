
module.exports = {
    apps : [
      {
        name   : "kromosynth-gRPC-variation",
        script : "gRPC/index.js",
        args: "--modelUrl file:///Users/bjornpjo/Developer/vendor/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
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
        script : "/Users/bjornpjo/Developer/apps/kromosynth-render/render-socket/socket-server-floating-points.js",
        args: "--processTitle kromosynth-render-socket-server",
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
      // ,

      // { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
      //   name   : "kromosynth-evaluation-socket-server_features-mfcc",
      //   interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised/env/bin/python3',
      //   cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
      //   script : "features.py",
      //   args: "--host 127.0.0.1 --sample-rate 16000",
      //   instances : 3,
      //   exec_mode : "fork",
      //   max_memory_restart: '700M',
      //   // cron_restart: '*/30 * * * *',
      //   increment_var : 'PORT',
      //   env: {
      //     "PORT": 31051,
      //   }
      // }
      // ,
      // { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
      //   name   : "kromosynth-evaluation-socket-server_quality-problems",
      //   interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised/env/bin/python3',
      //   cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
      //   script : "quality_problems.py",
      //   args: "--host 127.0.0.1 --sample-rate 16000 --quality-methods 'click_count_percentage,discontinuity_count_percentage,gaps_count_percentage,saturation_percentage,true_peak_clipping_percentage,noise_burst_percentage,compressibility_percentage'",
      //   instances : 3,
      //   exec_mode : "fork",
      //   max_memory_restart: '700M',
      //   // cron_restart: '*/30 * * * *',
      //   increment_var : 'PORT',
      //   env: {
      //     "PORT": 32051,
      //   }
      // }
      // ,
      // { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
      //   name   : "kromosynth-evaluation-socket-server_projection_pca_quantised",
      //   interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised/env/bin/python3',
      //   cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
      //   script : "projection_pca_quantised.py",
      //   args: "--host 127.0.0.1 --dimensions 2 --dimension-cells 50",
      //   instances : 3,
      //   exec_mode : "fork",
      //   max_memory_restart: '1G',
      //   // cron_restart: '*/30 * * * *',
      //   increment_var : 'PORT',
      //   env: {
      //     "PORT": 33051,
      //   }
      // }
      // ,

      // {
      //   name   : "kromosynth-controller",
      //   script : "cli-app/kromosynth.js",
      //   args: "evolution-runs --evolution-runs-config-json-file /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/conf/evolution-runs_quality-problems.jsonc",
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
  