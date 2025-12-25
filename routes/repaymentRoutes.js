import express from 'express';
import {
  mpesaC2BCallback,
  getRepaymentHistory,
} from '../controllers/repaymentController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * ============================
 * M-PESA C2B CALLBACK (PUBLIC)
 * ============================
 */
router.post('/mpesa/c2b/callback', mpesaC2BCallback);

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
