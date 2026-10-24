import { env } from '../config/env.js';

// Express requires all four parameters to recognize error middleware.
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const errorStatus = err.status || err.statusCode;
  const status = Number.isInteger(errorStatus) && errorStatus >= 400 && errorStatus <= 599
    ? errorStatus
    : 500;

  if (env.nodeEnv !== 'test') {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message || 'Request failed',
  });
};
