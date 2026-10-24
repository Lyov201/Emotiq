import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Express requires all four parameters to recognize error middleware.
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const errorStatus = err.status || err.statusCode;
  const status = Number.isInteger(errorStatus) && errorStatus >= 400 && errorStatus <= 599
    ? errorStatus : 500;

  // Never print error objects: database errors may contain credentials or input.
  if (status >= 500 && env.nodeEnv !== 'test') {
    console.error(`Request failed with HTTP ${status}`);
  }
  const message = err instanceof AppError ? err.message
    : status === 400 ? 'Invalid request'
      : status === 404 ? 'Resource not found'
        : status === 413 ? 'Request body too large'
          : status >= 500 ? 'Internal server error' : 'Request failed';

  res.status(status).json({
    success: false,
    message,
    ...(err instanceof AppError && err.details ? { errors: err.details } : {}),
  });
};
