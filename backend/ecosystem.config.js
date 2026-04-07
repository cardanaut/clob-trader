module.exports = {
  apps: [
    {
      name               : 'polychamp-api',
      script             : './src/api/server.js',
      instances          : 1,
      exec_mode          : 'cluster',
      autorestart        : true,
      watch              : false,
      max_memory_restart : '400M',
      min_uptime         : '10s',   // must stay up 10s to count as stable
      max_restarts       : 20,
      restart_delay      : 3000,
      env: {
        NODE_ENV : 'production',
        PORT     : 55550,
      },
    },
    {
      name               : 'polychamp-spike',
      script             : './src/spike/index.js',
      instances          : 1,
      exec_mode          : 'fork',
      autorestart        : true,
      watch              : false,
      max_memory_restart : '400M',
      min_uptime         : '10s',
      max_restarts       : 20,
      restart_delay      : 5000,
    },
    {
      name               : 'polychamp-watchdog',
      script             : './src/watchdog/index.js',
      instances          : 1,
      exec_mode          : 'fork',
      autorestart        : true,
      watch              : false,
      max_memory_restart : '100M',
      min_uptime         : '5s',
      max_restarts       : 10,
      restart_delay      : 10000,
    },
  ],
};
