// routes/loanRoutes.js
import express from 'express';
import { initiateLoan, approveLoan, getLoans } from '../controllers/loanController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, getLoans);

router.post('/initiate', protect, restrictTo('initiator_admin', 'loan_officer'), initiateLoan);

router.put('/:id/approve', protect, restrictTo('approver_admin'), approveLoan);

export default router;