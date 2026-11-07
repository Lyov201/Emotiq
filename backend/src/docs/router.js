import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';
import { openapi } from './openapi.js';

export function createDocsRouter() {
  const router = Router();
  // Swagger's generated initialization uses inline scripts; this policy applies only to docs.
  router.use(helmet.contentSecurityPolicy({ directives: {
    'script-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'upgrade-insecure-requests': null,
  } }));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/openapi.json', (req, res) => res.json(openapi));
  router.use('/', swaggerUi.serve, swaggerUi.setup(openapi, {
    customSiteTitle: 'Emotiq API Docs',
    swaggerOptions: { validatorUrl: null, persistAuthorization: false, withCredentials: true, defaultModelsExpandDepth: -1 },
  }));
  return router;
}
