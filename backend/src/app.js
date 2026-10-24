import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middlewares/notFound.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(helmet());
app.use(cors());

if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

app.use(express.json());
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
