import { Router } from 'express';
import { getHODInfo } from '../controllers/auth.controller.js';

const router = Router();

// Local login/logout removed.
// Authentication is centralized at /api/auth/login in the merged backend.
router.get('/hod/:department', getHODInfo);

export default router;








