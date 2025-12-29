import express from 'express';
import {
	overview,
	portfolio,
	recentLoans,
	demographics,
	repaymentsSummary,
	loanPerformance,
	officers,
	risk,
} from '../controllers/analyticsController.js';

const router = express.Router();

router.get('/overview', overview);
router.get('/portfolio', portfolio);
router.get('/loans', recentLoans);
router.get('/demographics', demographics);
router.get('/repayments', repaymentsSummary);
router.get('/loan-performance', loanPerformance);
router.get('/officers', officers);
router.get('/risk', risk);

export default router;
