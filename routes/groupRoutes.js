// routes/groupRoutes.js
import express from 'express';
import {
  createGroup,
  approveGroup,
  assignSignatories,
  getGroups,
} from '../controllers/groupController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GROUP LISTING
 * - loan_officer: only their groups (controller scopes)
 * - admins: all groups
 */
router.get(
  '/',
  protect,
  restrictTo(
    'super_admin',
    'initiator_admin',
    'approver_admin',
    'loan_officer'
  ),
  getGroups
);

/**
 * CREATE GROUP
 * - ONLY loan officers
 * - status = pending
 */
router.post(
  '/',
  protect,
  restrictTo('loan_officer'),
  createGroup
);

/**
 * APPROVE GROUP
 * - admins + super admin
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('initiator_admin', 'approver_admin', 'super_admin'),
  approveGroup
);

/**
 * ASSIGN SIGNATORIES
 * - loan officer (own group)
 * - super admin (override)
 */
router.put(
  '/:id/signatories',
  protect,
  restrictTo('loan_officer', 'super_admin'),
  assignSignatories
);

export default router;
