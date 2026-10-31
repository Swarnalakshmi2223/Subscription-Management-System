import { Router } from 'express';
import { createStaff, listUsers, setActive } from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.post('/staff', authorize('admin'), createStaff);
router.get('/', authorize('admin', 'staff'), listUsers);
router.patch('/:id/active', authorize('admin'), setActive);

export default router;