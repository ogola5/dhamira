// routes/guarantorRoutes.js
import express from 'express';
import {
  addGuarantor,
  acceptGuarantor,
} from '../controllers/guarantorController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post(
  '/',
  protect,
  restrictTo('loan_officer', 'initiator_admin'),
  addGuarantor
);

router.put(
  '/:id/accept',
  protect,
  restrictTo('loan_officer', 'approver_admin', 'super_admin'),
  acceptGuarantor
);

export default router;
