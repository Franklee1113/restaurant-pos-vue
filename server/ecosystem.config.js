module.exports = {
  apps: [
    {
      name: 'restaurant-pos-public-api',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // 自动重启策略
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // 日志
      log_file: '/var/log/pm2/public-api-combined.log',
      out_file: '/var/log/pm2/public-api-out.log',
      error_file: '/var/log/pm2/public-api-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 内存限制
      max_memory_restart: '512M',
      // 优雅关闭
      kill_timeout: 5000,
      listen_timeout: 10000,
      // 健康检查
      // pm2 5.2+ 支持，如果应用不响应则重启
      // (需要在应用内实现 /health 端点)
    },
  ],
}
