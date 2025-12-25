import express from 'express';
import { initiateLoan, approveLoan, getLoans } from '../controllers/loanController.js';
import { disburseLoan } from '../controllers/disbursementController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get(
  '/',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getLoans
);

router.post(
  '/initiate',
  protect,
  restrictTo('initiator_admin', 'loan_officer', 'super_admin'),
  initiateLoan
);

router.put(
  '/:id/approve',
  protect,
  restrictTo('approver_admin', 'super_admin'),
  approveLoan
);

// Disbursement: cash roles + superadmin
router.post(
  '/:id/disburse',
  protect,
  restrictTo('approver_admin', 'initiator_admin', 'super_admin'),
  disburseLoan
);

export default router;
