import express from 'express';
import {
  mpesaC2BCallback,
  getRepaymentHistory,
  createRepayment,
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
    'admin',
    'loan_officer'
  ),
  getRepaymentHistory
);

/**
 * ============================
 * CREATE REPAYMENT (MANUAL/CASH)
 * ============================
 */
router.post(
  '/',
  protect,
  restrictTo(
    'super_admin',
    'admin',
    'loan_officer'
  ),
  createRepayment
);

// Alias route used by some frontends
router.get(
  '/loan/:loanId',
  protect,
  restrictTo(
    'super_admin',
    'admin',
    'loan_officer'
  ),
  getRepaymentHistory
);

export default router;
