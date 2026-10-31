
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';

import {
  getPlans,
  getPlan,
  createPlan,
  updatePlan,
  togglePlanStatus,
} from '../controllers/planController.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin', 'staff'), getPlans);
router.get('/:id', authorize('admin', 'staff'), getPlan);
router.post('/', authorize('admin'), createPlan);
router.put('/:id', authorize('admin'), updatePlan);
router.patch('/:id/active', authorize('admin'), togglePlanStatus);

export default router;
