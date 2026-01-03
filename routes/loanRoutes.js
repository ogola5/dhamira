import express from 'express';
import {
  initiateLoan,
  approveLoan,
  cancelLoan,
  getLoans,
  groupPreflight,
  getLoanHistory,
  trackMyLoans,
} from '../controllers/loanController.js';
import { markApplicationFeePaid, markApplicationFeePaidBulk } from '../controllers/loanController.js';

import { disburseLoan } from '../controllers/disbursementController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * LOAN HISTORY (SUPER ADMIN ONLY)
 * Complete loan history with statistics
 */
router.get(
  '/history',
  protect,
  restrictTo('super_admin'),
  getLoanHistory
);

/**
 * TRACK MY LOANS (LOAN OFFICER)
 * Shows loans for groups assigned to the loan officer
 */
router.get(
  '/my-loans',
  protect,
  restrictTo('loan_officer'),
  trackMyLoans
);

/**
 * LIST LOANS
 */
router.get(
  '/',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  getLoans
);

/**
 * INITIATE LOAN (LOAN OFFICER ONLY - MAKER)
 */
router.post(
  '/initiate',
  protect,
  restrictTo('loan_officer'),
  initiateLoan
);

/**
 * GROUP PREFLIGHT (checks group readiness for loan initiation)
 */
router.get(
  '/group-preflight/:id',
  protect,
  restrictTo('loan_officer', 'admin'),
  groupPreflight
);

/**
 * APPROVE LOAN (ADMIN ONLY - CHECKER)
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('admin'),
  approveLoan
);

/**
 * CANCEL LOAN (PRE-DISBURSEMENT ONLY)
 */
router.put(
  '/:id/cancel',
  protect,
  restrictTo('admin', 'super_admin'),
  cancelLoan
);

/**
 * DISBURSE LOAN (ADMIN ONLY - CHECKER)
 */
router.put(
  '/:id/disburse',
  protect,
  restrictTo('admin'),
  disburseLoan
);

// Mark application fee paid for a loan
router.put('/:id/mark-application-fee-paid', protect, restrictTo('admin'), markApplicationFeePaid);

// Bulk mark application fees paid
router.post('/mark-application-fee-paid-bulk', protect, restrictTo('admin'), markApplicationFeePaidBulk);

/**
 * LOAN DETAIL
 */
router.get(
  '/:id',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  // lazy import to avoid circular issues
  async (req, res, next) => {
    const { getLoanDetail } = await import('../controllers/loanController.js');
    return getLoanDetail(req, res, next);
  }
);

export default router;
