import express from 'express';
import { createBranch, getBranches } from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get all branches (authenticated users)
router.get('/', protect, getBranches);

// Create branch (Super Admin only)
router.post('/', protect, restrictTo('super_admin'), createBranch);

export default router;
