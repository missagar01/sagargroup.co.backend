// PM2 ecosystem configuration for production
module.exports = {
  apps: [{
    name: 'unified-backend',
    script: './server.js',
    cwd: '/home/ubuntu/app',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3004
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=2048'
  }]
};








