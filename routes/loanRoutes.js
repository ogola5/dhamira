import express from 'express';
import {
  initiateLoan,
  approveLoan,
  cancelLoan,
  getLoans,
} from '../controllers/loanController.js';

import { disburseLoan } from '../controllers/disbursementController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * LIST LOANS
 */
router.get(
  '/',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getLoans
);

/**
 * INITIATE LOAN
 */
router.post(
  '/initiate',
  protect,
  restrictTo('initiator_admin', 'loan_officer', 'super_admin'),
  initiateLoan
);

/**
 * APPROVE LOAN
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('approver_admin', 'super_admin'),
  approveLoan
);

/**
 * CANCEL LOAN (PRE-DISBURSEMENT ONLY)
 */
router.put(
  '/:id/cancel',
  protect,
  restrictTo('initiator_admin', 'super_admin'),
  cancelLoan
);

/**
 * DISBURSE LOAN
 */
router.post(
  '/:id/disburse',
  protect,
  restrictTo('approver_admin', 'initiator_admin', 'super_admin'),
  disburseLoan
);

export default router;
