// routes/analysisRoutes.js
import express from 'express';
import { getDefaultRisk, getSentimentAnalysis } from '../controllers/analysisController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/loan/:loanId/default-risk', protect, restrictTo('super_admin', 'admin'), getDefaultRisk);

router.post('/sentiment', protect, restrictTo('super_admin', 'loan_officer'), getSentimentAnalysis);

export default router;