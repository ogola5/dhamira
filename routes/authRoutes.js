import express from 'express';
import { login, register, changePassword } from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', login);

// Absolute authority
router.post(
  '/register',
  protect,
  restrictTo('super_admin'),
  register
);

// Change password (authenticated)
router.put('/change-password', protect, changePassword);

export default router;
