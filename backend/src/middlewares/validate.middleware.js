import { AppError } from '../utils/AppError.js';

export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(new AppError(400, 'Validation failed', result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))));
  }
  const target = { body: 'validatedBody', query: 'validatedQuery', params: 'validatedParams' }[source];
  req[target] = result.data;
  next();
};
