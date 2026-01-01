// routes/creditAssessmentRoutes.js
import express from 'express';
import {
  submitCreditAssessment,
  submitQuickAssessment,
  getAssessmentByLoan,
  listMyAssessments,
} from '../controllers/creditAssessmentController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// List assessments created by the logged-in user
router.get('/mine', protect, listMyAssessments);

// Get assessment for a specific loan
router.get(
  '/:loanId',
  protect,
  restrictTo('loan_officer', 'approver_admin', 'initiator_admin', 'super_admin'),
  getAssessmentByLoan
);

router.post(
  '/',
  protect,
  restrictTo('loan_officer', 'super_admin'),
  submitCreditAssessment
);

// Quick admin assessment (creates full-score assessment)
router.post(
  '/quick',
  protect,
  restrictTo('approver_admin', 'initiator_admin', 'super_admin'),
  submitQuickAssessment
);

export default router;
