import express from 'express';

import {
  createPayment,
  getPayment,
  getPayments,
} from '../controllers/paymentController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'staff', 'customer'), getPayments);
router.get('/:id', authorize('admin', 'staff', 'customer'), getPayment);
router.post('/', authorize('admin', 'staff'), createPayment);

export default router;
