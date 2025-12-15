// routes/creditAssessmentRoutes.js
import express from 'express';
import { submitCreditAssessment } from '../controllers/creditAssessmentController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post(
  '/',
  protect,
  restrictTo('loan_officer', 'initiator_admin'),
  submitCreditAssessment
);

export default router;
