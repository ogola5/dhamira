import express from 'express';
import {
  createGroup,
  approveGroup,
  assignSignatories,
  updateGroup,
  deactivateGroup,
  getGroups,
  getGroupById,
} from '../controllers/groupController.js';

import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * LIST GROUPS
 */
router.get(
  '/',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getGroups
);

/**
 * CREATE GROUP
 */
router.post(
  '/',
  protect,
  restrictTo('loan_officer'),
  createGroup
);

/**
 * GET SINGLE GROUP
 */
router.get(
  '/:id',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  getGroupById
);

/**
 * UPDATE GROUP (LIMITED)
 */
router.put(
  '/:id',
  protect,
  restrictTo('super_admin', 'initiator_admin', 'approver_admin', 'loan_officer'),
  updateGroup
);

/**
 * APPROVE GROUP
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('initiator_admin', 'approver_admin', 'super_admin'),
  approveGroup
);

/**
 * ASSIGN SIGNATORIES (ONCE)
 */
router.put(
  '/:id/signatories',
  protect,
  restrictTo('loan_officer', 'super_admin'),
  assignSignatories
);

/**
 * DEACTIVATE GROUP
 */
router.put(
  '/:id/deactivate',
  protect,
  restrictTo('initiator_admin', 'approver_admin', 'super_admin'),
  deactivateGroup
);

export default router;
