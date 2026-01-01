import express from 'express';
import {
  initiateLoan,
  approveLoan,
  cancelLoan,
  getLoans,
  groupPreflight,
} from '../controllers/loanController.js';
import { markApplicationFeePaid, markApplicationFeePaidBulk } from '../controllers/loanController.js';

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
  restrictTo('initiator_admin', 'super_admin'),
  initiateLoan
);

/**
 * GROUP PREFLIGHT (checks group readiness for loan initiation)
 */
router.get(
  '/group-preflight/:id',
  protect,
  restrictTo('initiator_admin', 'super_admin'),
  groupPreflight
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
router.put(
  '/:id/disburse',
  protect,
  restrictTo('approver_admin', 'super_admin'),
  disburseLoan
);

// Mark application fee paid for a loan
router.put('/:id/mark-application-fee-paid', protect, restrictTo('initiator_admin', 'approver_admin', 'super_admin'), markApplicationFeePaid);

// Bulk mark application fees paid
router.post('/mark-application-fee-paid-bulk', protect, restrictTo('initiator_admin', 'approver_admin', 'super_admin'), markApplicationFeePaidBulk);

/**
 * LOAN DETAIL
 */
router.get(
  '/:id',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  // lazy import to avoid circular issues
  async (req, res, next) => {
    const { getLoanDetail } = await import('../controllers/loanController.js');
    return getLoanDetail(req, res, next);
  }
);

export default router;
