import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cleanString, validateNewUser } from '../utils/validators.js';
import { parsePagination, pageMeta, escapeRegex } from '../utils/query.js';

// POST /api/users/staff: admin only
export const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body ?? {};

  const errors = validateNewUser({ name, email, password });
  if (errors.length) throw new AppError('Validation failed', 400, errors);

  const normalizedEmail = email.trim().toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await User.hashPassword(password),
    role: 'staff',
    phone: cleanString(phone),
  });

  res.status(201).json({ success: true, user });
});

// GET /api/users?role=&search=&active=&page=&limit=
// Admin sees everyone; staff see customers only.
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.user.role === 'staff') {
    filter.role = 'customer';
  } else if (['admin', 'staff', 'customer'].includes(req.query.role)) {
    filter.role = req.query.role;
  }

  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const rx = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v').lean(),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, items, meta: pageMeta(page, limit, total) });
});

// PATCH /api/users/:id/active: admin only
export const setActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body ?? {};
  if (typeof isActive !== 'boolean') throw new AppError('isActive must be true or false', 400);
  if (req.params.id === String(req.user._id)) {
    throw new AppError('You cannot change your own status', 400);
  }

  const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
  if (!user) throw new AppError('User not found', 404);

  res.json({ success: true, user });
});