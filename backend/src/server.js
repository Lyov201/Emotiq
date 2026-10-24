import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.port, () => {
  console.log(`Emotiq API is running on http://localhost:${env.port}`);
});

server.on('error', (error) => {
  console.error('Failed to start Emotiq API:', error.message);
  process.exit(1);
});
