import express from 'express';
import { createWellbeingRouter } from './routes/wellbeing.routes.js';
import { createDocsRouter } from './docs/router.js';
import { createSessionRouter } from './routes/session.routes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './config/prisma.js';
import { createBookingRouter } from './routes/booking.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middlewares/notFound.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

export function createApp({ db = prisma, chat } = {}) {
  const app = express();
  // Trust no proxy by default. Configure explicit trusted proxy IPs at deployment.
  app.set('trust proxy', false);

  app.use(helmet());
  app.use(cors({
    origin: env.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Protection'],
  }));
  app.use(cookieParser());

  if (env.nodeEnv === 'development') {
    app.use(morgan((tokens, req, res) => `${req.method} ${req.path} ${res.statusCode}`));
  }

  app.use(express.json({ limit: '16kb' }));

  app.get('/', (req, res) => {
    res.type('text').send('Hello World');
  });

  app.use('/api/docs', createDocsRouter());
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/bookings', createBookingRouter(db));
  app.use('/api/sessions', createSessionRouter(db, chat));
  app.use('/api/moods', createWellbeingRouter(db, 'mood'));
  app.use('/api/journals', createWellbeingRouter(db, 'journal'));
  app.use('/api', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp();
