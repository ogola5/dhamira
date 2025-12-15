// routes/repaymentRoutes.js
import express from 'express';
import {
  recordRepayment,
  getRepaymentHistory,
} from '../controllers/repaymentController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post(
  '/',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  recordRepayment
);

router.get(
  '/loan/:loanId',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getRepaymentHistory
);

export default router;
