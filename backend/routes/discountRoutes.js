import express from 'express';

import {
  getDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
  toggleDiscountStatus,
} from '../controllers/discountController.js';

import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All discount routes require authentication.
router.use(protect);

// Admin and staff can view discounts.
router.get('/', authorize('admin', 'staff'), getDiscounts);
router.get('/:id', authorize('admin', 'staff'), getDiscount);

// Only admin can create, update, activate or deactivate discounts.
router.post('/', authorize('admin'), createDiscount);
router.put('/:id', authorize('admin'), updateDiscount);
router.patch('/:id/active', authorize('admin'), toggleDiscountStatus);

export default router;