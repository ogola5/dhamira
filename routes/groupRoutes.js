// routes/groupRoutes.js (Updated to include new route)
import express from 'express';
import { createGroup, updateGroup, getGroups, assignSignatories } from '../controllers/groupController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .post(protect, restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'), createGroup)
  .get(protect, getGroups);

router.put('/:id', protect, restrictTo('super_admin'), updateGroup);

router.put('/:id/assign-signatories', protect, restrictTo('super_admin', 'loan_officer'), assignSignatories);

export default router;