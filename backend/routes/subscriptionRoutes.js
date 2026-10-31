
import express from 'express';

import { protect, authorize } from '../middleware/auth.js';

import {
  getSubscriptions,
  getSubscription,
  previewSubscription,
  createSubscription,
  updateSubscription,
  sendQuotation,
  confirmSubscription,
  activateSubscription,
  pauseSubscription,
  resumeSubscription,
  closeSubscription,
  renewSubscription,
} from '../controllers/subscriptionController.js';

const router = express.Router();

// All subscription routes require login.
router.use(protect);

// Admin and staff can view subscriptions.
router.get('/', authorize('admin', 'staff', 'customer'), getSubscriptions);
router.get('/:id', authorize('admin', 'staff', 'customer'), getSubscription);

// Admin and staff can create subscriptions.
router.post('/preview', authorize('admin', 'staff'), previewSubscription);
router.post('/', authorize('admin', 'staff'), createSubscription);

// Only Draft subscriptions can be updated.
router.put('/:id', authorize('admin', 'staff'), updateSubscription);

// Subscription lifecycle.
router.patch('/:id/send-quotation', authorize('admin', 'staff'), sendQuotation);
router.patch('/:id/confirm', authorize('admin', 'staff'), confirmSubscription);
router.patch('/:id/activate', authorize('admin', 'staff'), activateSubscription);
router.patch('/:id/pause', authorize('admin', 'staff'), pauseSubscription);
router.patch('/:id/resume', authorize('admin', 'staff'), resumeSubscription);
router.patch('/:id/close', authorize('admin', 'staff'), closeSubscription);
router.patch('/:id/renew', authorize('admin', 'staff'), renewSubscription);

export default router;
