import express from 'express';
import { 
  createLoanOfficer, 
  listLoanOfficers, 
  getPerformanceDashboard 
} from '../controllers/loanOfficerController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// List loan officers (super_admin only)
router.get('/', protect, restrictTo('super_admin'), listLoanOfficers);

// Create a loan officer (super_admin only)
router.post('/', protect, restrictTo('super_admin'), createLoanOfficer);

// Get performance dashboard (loan officer only)
router.get('/performance', protect, restrictTo('loan_officer'), getPerformanceDashboard);

export default router;
