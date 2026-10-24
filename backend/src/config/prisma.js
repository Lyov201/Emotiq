import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL must be set');
}

// Enforce certificate and hostname verification, even for Neon sslmode=require URLs.
const connectionUrl = new URL(env.databaseUrl);
connectionUrl.searchParams.set('sslmode', 'verify-full');
const adapter = new PrismaPg({
  connectionString: connectionUrl.toString(),
  enableChannelBinding: true,
  connectionTimeoutMillis: 10_000,
  max: 10,
});

export const prisma = new PrismaClient({ adapter });
