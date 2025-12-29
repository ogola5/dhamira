import express from 'express';
import { createSavings } from '../controllers/savingsController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, restrictTo('initiator_admin', 'super_admin'), createSavings);

export default router;
