module.exports = {
  apps: [{
    name: "sagargroup-backend",
    cwd: __dirname,
    script: "./server.js",
    interpreter: process.execPath,
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    min_uptime: "10s",
    max_restarts: 10,
    exp_backoff_restart_delay: 1000,
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 35000,
    env: {
      ENABLE_IOT_MODULE: "false",
      ENABLE_IOT_MQTT_DASHBOARD: "false",
    },
  }],
};
