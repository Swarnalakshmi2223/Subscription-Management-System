import express from 'express';

import {
  cancelInvoice,
  confirmInvoice,
  generateInvoice,
  getInvoice,
  getInvoices,
  sendInvoice,
} from '../controllers/invoiceController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin', 'staff', 'customer'), getInvoices);
router.get('/:id', authorize('admin', 'staff', 'customer'), getInvoice);
router.post('/generate', authorize('admin', 'staff'), generateInvoice);
router.patch('/:id/confirm', authorize('admin', 'staff'), confirmInvoice);
router.patch('/:id/cancel', authorize('admin', 'staff'), cancelInvoice);
router.post('/:id/send', authorize('admin', 'staff'), sendInvoice);

export default router;
