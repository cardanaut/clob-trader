module.exports = {
  apps: [{
    name: 'polychamp-spike',
    script: './src/spike/index.js',
    cwd: '/var/www/jeer.currenciary.com/polychamp/backend',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/home/adminweb/.pm2/logs/polychamp-spike-error.log',
    out_file: '/home/adminweb/.pm2/logs/polychamp-spike-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
