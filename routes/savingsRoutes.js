import express from 'express';
import { createSavings, listSavings } from '../controllers/savingsController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, restrictTo('admin', 'super_admin', 'loan_officer'), createSavings);
router.get('/', protect, restrictTo('admin', 'super_admin', 'loan_officer'), listSavings);

export default router;
