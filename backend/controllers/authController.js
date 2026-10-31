import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { cleanString, validateNewUser } from '../utils/validators.js';

// POST /api/auth/register: customers only. The role is never read from the request.
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, company } = req.body ?? {};

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
    role: 'customer',
    phone: cleanString(phone),
    company: cleanString(company),
  });

  res.status(201).json({ success: true, token: signToken(user), user });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError('Email and password are required', 400);
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!user.isActive) throw new AppError('This account has been deactivated', 403);

  res.json({ success: true, token: signToken(user), user });
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});