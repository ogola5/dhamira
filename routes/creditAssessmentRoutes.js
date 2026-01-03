// routes/creditAssessmentRoutes.js
import express from 'express';
import {
  submitCreditAssessment,
  submitQuickAssessment,
  getAssessmentByLoan,
  listMyAssessments,
  listPendingAssessments,
} from '../controllers/creditAssessmentController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// List loans pending credit assessment (no assessment yet)
router.get(
  '/',
  protect,
  restrictTo('loan_officer', 'admin', 'super_admin'),
  listPendingAssessments
);

// List assessments created by the logged-in user
router.get('/mine', protect, listMyAssessments);

// Get assessment for a specific loan
router.get(
  '/:loanId',
  protect,
  restrictTo('loan_officer', 'admin', 'super_admin'),
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
  restrictTo('admin', 'super_admin'),
  submitQuickAssessment
);

export default router;
