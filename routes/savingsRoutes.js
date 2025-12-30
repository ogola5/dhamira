import express from 'express';
import { createSavings, listSavings } from '../controllers/savingsController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, restrictTo('approver_admin', 'super_admin'), createSavings);
router.get('/', protect, restrictTo('approver_admin', 'super_admin'), listSavings);

export default router;
