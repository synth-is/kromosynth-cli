module.exports = {
  apps : [{
    name   : "kromosynth-gRPC",
    script : "./index.js",
    instances : 4,
    exec_mode : "cluster",
    max_memory_restart: '1G',
    increment_var : 'PORT',
    env: {
      "PORT": 50051,
    }
  }]
}
