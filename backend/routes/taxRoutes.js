
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';

import {
  getTaxes,
  createTax,
  updateTax,
  toggleTaxStatus,
} from '../controllers/taxController.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin', 'staff'), getTaxes);
router.post('/', authorize('admin'), createTax);
router.put('/:id', authorize('admin'), updateTax);
router.patch('/:id/active', authorize('admin'), toggleTaxStatus);

export default router;
