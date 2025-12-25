import express from 'express';
import { getRepaymentHistory } from '../controllers/repaymentController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * ============================
 * VIEW REPAYMENT HISTORY
 * ============================
 */
router.get(
  '/:loanId',
  protect,
  restrictTo(
    'super_admin',
    'initiator_admin',
    'approver_admin',
    'loan_officer'
  ),
  getRepaymentHistory
);

export default router;
