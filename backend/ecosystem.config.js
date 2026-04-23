// ecosystem.config.js
// PM2 Production Process Manager Configuration for Safe-Route Backend

module.exports = {
  apps: [
    {
      // ============================================
      // MAIN APPLICATION
      // ============================================
      name: 'safe-route-backend',
      script: './dist/app.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      
      // Environment Variables
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001,
      },
      
      // Logging
      error_file: './logs/pm2/err.log',
      out_file: './logs/pm2/out.log',
      log_file: './logs/pm2/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process Management
      kill_timeout: 5000,
      listen_timeout: 5000,
      shutdown_with_message: true,
      
      // Auto-restart conditions
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Monitoring
      instance_var: 'INSTANCE_ID',
      watch: ['dist'],
      ignore_watch: ['node_modules', 'logs', 'uploads', 'models'],
      
      // Advanced features
      node_args: '--max-old-space-size=2048',
      cwd: process.cwd(),
      
      // Graceful shutdown
      kill_retry_time: 1000,
      
      // Metrics
      metrics: {
        port: 9090,
        api: true,
      },
      
      // Source map support
      source_map_support: true,
      
      // Pre/Post scripts
      pre_start: 'echo "Starting Safe-Route Backend..."',
      post_start: 'echo "Safe-Route Backend Started Successfully"',
      pre_stop: 'echo "Shutting down Safe-Route Backend..."',
      post_stop: 'echo "Safe-Route Backend Stopped"',
    },
    
    // ============================================
    // CRON JOBS SERVICE
    // ============================================
    {
      name: 'safe-route-cron',
      script: './dist/workers/cronWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'cron',
      },
      error_file: './logs/pm2/cron-error.log',
      out_file: './logs/pm2/cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    
    // ============================================
    // QUEUE WORKER (Bull/BullMQ)
    // ============================================
    {
      name: 'safe-route-queue',
      script: './dist/workers/queueWorker.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'queue',
      },
      error_file: './logs/pm2/queue-error.log',
      out_file: './logs/pm2/queue-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    
    // ============================================
    // REAL-TIME TRACKING PROCESSOR
    // ============================================
    {
      name: 'safe-route-tracker',
      script: './dist/workers/trackingWorker.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'tracking',
      },
      error_file: './logs/pm2/tracker-error.log',
      out_file: './logs/pm2/tracker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    
    // ============================================
    // NOTIFICATION WORKER
    // ============================================
    {
      name: 'safe-route-notifier',
      script: './dist/workers/notificationWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'notification',
      },
      error_file: './logs/pm2/notifier-error.log',
      out_file: './logs/pm2/notifier-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
    
    // ============================================
    // BACKUP SERVICE
    // ============================================
    {
      name: 'safe-route-backup',
      script: './dist/workers/backupWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      cron_restart: '0 2 * * *', // Daily at 2 AM
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'backup',
      },
      error_file: './logs/pm2/backup-error.log',
      out_file: './logs/pm2/backup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
  
  // ============================================
  // DEPLOYMENT CONFIGURATIONS
  // ============================================
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'https://github.com/your-username/safe-route-backend.git',
      path: '/var/www/safe-route-backend',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
    staging: {
      user: 'deploy',
      host: ['staging-server-ip'],
      ref: 'origin/develop',
      repo: 'https://github.com/your-username/safe-route-backend.git',
      path: '/var/www/safe-route-backend-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging',
      },
    },
  },
};

// ============================================
// PM2 COMMANDS
// ============================================

// Start all apps
// pm2 start ecosystem.config.js

// Start specific app
// pm2 start ecosystem.config.js --only safe-route-backend

// Start with environment
// pm2 start ecosystem.config.js --env production

// Reload all apps (zero downtime)
// pm2 reload ecosystem.config.js

// Restart all apps
// pm2 restart ecosystem.config.js

// Stop all apps
// pm2 stop ecosystem.config.js

// Delete all apps
// pm2 delete ecosystem.config.js

// Monitor all apps
// pm2 monit

// View logs
// pm2 logs
// pm2 logs safe-route-backend
// pm2 logs --lines 100

// Save current process list
// pm2 save

// Setup startup script
// pm2 startup

// List all apps
// pm2 list

// Show app details
// pm2 show safe-route-backend

// Reload environment variables
// pm2 reload ecosystem.config.js --update-env

// Scale app instances
// pm2 scale safe-route-backend 4

// Trigger garbage collection
// pm2 send signal safe-route-backend

// ============================================
// ADVANCED CONFIGURATION
// ============================================

// For load balancing with Nginx, configure upstream:
/*
upstream saferoute_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}
*/

// For health checks endpoint
// GET /health returns status of all instances

// For graceful shutdown handling in your app:
/*
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('message', (msg) => {
  if (msg === 'shutdown') {
    // Graceful shutdown
    server.close(() => process.exit(0));
  }
});
*/

