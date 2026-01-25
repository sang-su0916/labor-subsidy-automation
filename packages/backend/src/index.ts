import app from './app';
import { config } from './config';
import { startCleanupScheduler, stopCleanupScheduler } from './utils/cleanup';

const server = app.listen(config.port, () => {
  console.log(`🚀 Server running at http://localhost:${config.port}`);
  console.log(`📁 Environment: ${config.nodeEnv}`);

  if (config.nodeEnv === 'production') {
    startCleanupScheduler();
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  stopCleanupScheduler();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
