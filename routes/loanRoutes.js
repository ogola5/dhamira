// routes/loanRoutes.js
import express from 'express';
import {
  initiateLoan,
  approveLoan,
  getLoans,
} from '../controllers/loanController.js';
import { disburseLoan } from '../controllers/disbursementController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// View loans
router.get(
  '/',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getLoans
);

// Initiate loan
router.post(
  '/initiate',
  protect,
  restrictTo('initiator_admin', 'loan_officer'),
  initiateLoan
);

// Approve loan
router.put(
  '/:id/approve',
  protect,
  restrictTo('approver_admin', 'super_admin'),
  approveLoan
);

// 🔥 THIS IS THE DISBURSEMENT ROUTE
router.post(
  '/:id/disburse',
  protect,
  restrictTo('super_admin', 'approver_admin'),
  disburseLoan
);

export default router;
