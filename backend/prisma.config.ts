import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

// CLI migrations use the direct endpoint with certificate verification.
const directUrl = new URL(env('DIRECT_URL'));
directUrl.searchParams.set('sslmode', 'verify-full');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: directUrl.toString() },
});
