import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the environment file relative to this module, independent of the working directory.
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const port = Number(process.env.PORT || 5000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
};
