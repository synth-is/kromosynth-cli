
module.exports = {
    apps : [
      {
        name   : "kromosynth-gRPC-variation",
        script : "gRPC/genomeVariationWS.js",
        args: "--max-old-space-size=1024 --modelUrl file:///Users/bjornpjo/Developer/vendor/tfjs-model_yamnet_tfjs_1/model.json --processTitle kromosynth-gRPC-variation",
        instances : 3,
        exec_mode : "cluster",
        // max_memory_restart: '700M',
        max_memory_restart: '2G',
        // cron_restart: '*/10 * * * *',
        cron_restart: '0 */3 * * *', // every 3 hours
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
        args: "--max-old-space-size=1024 --processTitle kromosynth-render-socket-server",
        instances : 3,
        exec_mode : "cluster",
        max_memory_restart: '2G',
        // cron_restart: '*/10 * * * *',
        cron_restart: '0 */3 * * *', // every 3 hours
        increment_var : 'PORT',
        env: {
          "PORT": 30051,
          "TF_FORCE_GPU_ALLOW_GROWTH": true
        }
      }
      ,

      { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
        name   : "kromosynth-evaluation-socket-server_features-mfcc",
        interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised/env/bin/python3',
        cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
        script : "features_mfcc.py",
        args: "--host 127.0.0.1 --sample-rate 16000",
        instances : 3,
        exec_mode : "fork",
        max_memory_restart: '700M',
        // cron_restart: '*/10 * * * *',
        cron_restart: '0 */3 * * *', // every 3 hours
        increment_var : 'PORT',
        env: {
          "PORT": 31051,
        }
      }
      ,
      { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
        name   : "kromosynth-evaluation-socket-server_quality-mood",
        interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised/env/bin/python3',
        cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
        script : "quality_mood.py",
        args: "--host 127.0.0.1 --sample-rate 16000 --quality-methods 'mood_happy'",
        instances : 3,
        exec_mode : "fork",
        max_memory_restart: '700M',
        // cron_restart: '*/10 * * * *',
        cron_restart: '0 */3 * * *', // every 3 hours
        increment_var : 'PORT',
        env: {
          "PORT": 32051,
        }
      }
      ,
      { // see the `kromosynth-evaluate` repository: https://github.com/synth-is/kromosynth-evaluate
        name   : "kromosynth-evaluation-socket-server_projection_pca_quantised",
        interpreter: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised/env/bin/python3',
        cwd: '/Users/bjornpjo/Developer/apps/kromosynth-evaluate/evaluation/unsupervised',
        script : "projection_pca_quantised.py",
        args: "--host 127.0.0.1 --dimensions 2 --dimension-cells 100",
        instances : 3,
        exec_mode : "fork",
        max_memory_restart: '1G',
        // cron_restart: '*/10 * * * *',
        cron_restart: '0 */3 * * *', // every 3 hours
        increment_var : 'PORT',
        env: {
          "PORT": 33051,
        }
      }
      ,
      {
        name   : "kromosynth-controller",
        script : "cli-app/kromosynth.js",
        args: "evolution-runs --evolution-runs-config-json-file /Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/conf/evolution-runs_quality-mood.jsonc --max-old-space-size=1024",
        instances : 1,
        max_memory_restart: '4G',
        // cron_restart: '*/10 * * * *', // every 10 minutes
        cron_restart: '0 */3 * * *', // every 3 hours
      }
    ]
  }
  