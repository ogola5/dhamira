// routes/authRoutes.js
import express from 'express';
import { login, register } from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', login);

// Only super admin can create internal users
router.post('/register', protect, restrictTo('super_admin'), register);

export default router;
