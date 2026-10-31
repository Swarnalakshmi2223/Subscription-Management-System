import express from 'express';

import {
  getOverdue,
  getRevenue,
  getSummary,
} from '../controllers/reportController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect, authorize('admin', 'staff'));
router.get('/summary', getSummary);
router.get('/revenue', getRevenue);
router.get('/overdue', getOverdue);

export default router;
