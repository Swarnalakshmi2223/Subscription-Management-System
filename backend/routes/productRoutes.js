
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';

import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  toggleProductStatus,
} from '../controllers/productController.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin', 'staff'), getProducts);
router.get('/:id', authorize('admin', 'staff'), getProduct);
router.post('/', authorize('admin'), createProduct);
router.put('/:id', authorize('admin'), updateProduct);
router.patch('/:id/active', authorize('admin'), toggleProductStatus);

export default router;
