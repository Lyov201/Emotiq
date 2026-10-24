import { Router } from 'express';
import { getHealth, getDatabaseHealth } from '../controllers/health.controller.js';

const router = Router();

router.get('/', getHealth);
router.get('/db', getDatabaseHealth);

export default router;
