import express from 'express';
import {
  getLogs,
  listNotifications,
  createNotification,
  markRead,
  deleteNotification,
} from '../controllers/logsController.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// Logs - restricted to admins
router.get('/', protect, restrictTo('super_admin', 'admin'), getLogs);

// Notifications - authenticated users can create/list; admin can delete
router.get('/notifications', protect, listNotifications);
router.post('/notifications', protect, createNotification);
router.put('/notifications/:id/read', protect, markRead);
router.delete('/notifications/:id', protect, restrictTo('super_admin', 'admin'), deleteNotification);

export default router;
