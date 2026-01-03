import express from 'express';
import { 
  login, 
  register, 
  changePassword, 
  createBranch, 
  getBranches, 
  assignLoanOfficer,
  getUsers 
} from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', login);

// User registration (Super Admin only)
router.post(
  '/register',
  protect,
  restrictTo('super_admin'),
  register
);

// Create branch (Super Admin only)
router.post(
  '/branches',
  protect,
  restrictTo('super_admin'),
  createBranch
);

// Get all branches
router.get(
  '/branches',
  protect,
  getBranches
);

// Get all users (Super Admin only)
router.get(
  '/users',
  protect,
  restrictTo('super_admin'),
  getUsers
);

// Assign/reassign loan officer (Super Admin only)
router.post(
  '/assign-officer',
  protect,
  restrictTo('super_admin'),
  assignLoanOfficer
);

// Change password (authenticated)
router.put('/change-password', protect, changePassword);

export default router;
