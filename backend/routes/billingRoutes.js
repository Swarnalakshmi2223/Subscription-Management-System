import express from 'express';

import { runBillingNow } from '../controllers/billingController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.post('/run', authorize('admin'), runBillingNow);

export default router;
