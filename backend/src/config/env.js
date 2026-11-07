import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const config = z.object({
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL: z.string().trim().regex(/^gemini-[a-zA-Z0-9._-]+$/).default('gemini-3.8-flash'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine(value => /^postgres(ql)?:/.test(value)),
  JWT_ACCESS_SECRET: z.string().min(32).refine(value => !value.startsWith('replace_')),
  JWT_ACCESS_EXPIRES_IN: z.literal('15m').default('15m'),
  JWT_ISSUER: z.string().trim().min(1).default('emotiq-api'),
  JWT_AUDIENCE: z.string().trim().min(1).default('emotiq-client'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().pipe(z.literal(7)).default(7),
  FRONTEND_URL: z.url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/';
  }),
}).safeParse(process.env);

if (!config.success) {
  const fields = [...new Set(config.error.issues.map(issue => issue.path[0]))];
  throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
}

const values = config.data;
if (values.NODE_ENV === 'production' && !values.FRONTEND_URL.startsWith('https://')) {
  throw new Error('FRONTEND_URL must use HTTPS in production');
}

export const env = Object.freeze({
  geminiTimeoutMs: values.GEMINI_TIMEOUT_MS,
  geminiApiKey: values.GEMINI_API_KEY,
  geminiModel: values.GEMINI_MODEL,
  port: values.PORT,
  nodeEnv: values.NODE_ENV,
  databaseUrl: values.DATABASE_URL,
  jwtAccessSecret: values.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: values.JWT_ACCESS_EXPIRES_IN,
  jwtIssuer: values.JWT_ISSUER,
  jwtAudience: values.JWT_AUDIENCE,
  refreshTokenExpiresDays: values.REFRESH_TOKEN_EXPIRES_DAYS,
  frontendOrigin: new URL(values.FRONTEND_URL).origin,
  // Permit the local Swagger browser origin in development, independently of Host headers.
  allowedOrigins: Object.freeze([...new Set([
    new URL(values.FRONTEND_URL).origin,
    ...(values.NODE_ENV === 'development' ? [`http://localhost:${values.PORT}`] : []),
  ])]),
});
