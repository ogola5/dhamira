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
  getGroups
);

/**
 * CREATE GROUP (LOAN OFFICER ONLY - MAKER)
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
  getGroupById
);

/**
 * UPDATE GROUP (LIMITED)
 */
router.put(
  '/:id',
  protect,
  restrictTo('super_admin', 'admin', 'loan_officer'),
  updateGroup
);

/**
 * APPROVE GROUP (ADMIN ONLY - CHECKER)
 */
router.put(
  '/:id/approve',
  protect,
  restrictTo('admin'),
  approveGroup
);

/**
 * ASSIGN SIGNATORIES (3 required)
 */
router.put(
  '/:id/signatories',
  protect,
  restrictTo('loan_officer', 'admin'),
  assignSignatories
);

// Alias path expected by some frontends
router.put(
  '/:id/assign-signatories',
  protect,
  restrictTo('loan_officer', 'admin'),
  assignSignatories
);

/**
 * DEACTIVATE GROUP
 */
router.put(
  '/:id/deactivate',
  protect,
  restrictTo('admin', 'super_admin'),
  deactivateGroup
);

export default router;
