import { createServer } from 'node:http';
import app from './app.js';
import { prisma } from './config/prisma.js';
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

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  try {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
    await prisma.$disconnect();
    clearTimeout(timeout);
    process.exitCode = 0;
  } catch {
    console.error('Failed to shut down the API cleanly');
    process.exitCode = 1;
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
