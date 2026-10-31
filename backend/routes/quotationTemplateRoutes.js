
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';

import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  toggleTemplateStatus,
} from '../controllers/quotationTemplateController.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize('admin', 'staff'), getTemplates);
router.get('/:id', authorize('admin', 'staff'), getTemplate);
router.post('/', authorize('admin'), createTemplate);
router.put('/:id', authorize('admin'), updateTemplate);
router.patch('/:id/active', authorize('admin'), toggleTemplateStatus);

export default router;
