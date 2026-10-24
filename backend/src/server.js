import { createServer } from 'node:http';
import app from './app.js';
import { env } from './config/env.js';

const server = createServer(app);

server.on('listening', () => {
  console.log(`Emotiq API is running on http://localhost:${env.port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use. Set a different PORT in the root .env and restart the server.`);
  } else {
    console.error('Failed to start Emotiq API:', error.message);
  }
  process.exit(1);
});

server.listen(env.port);
