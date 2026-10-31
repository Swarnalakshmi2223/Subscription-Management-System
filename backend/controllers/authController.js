import crypto from 'node:crypto';
import User from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { sendMail } from '../services/mailService.js';
import { cleanString, isValidEmail, validateNewUser, validatePassword } from '../utils/validators.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');


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

const RESET_MESSAGE = 'If an account exists for that email, a reset link has been sent.';

// POST /api/auth/forgot-password: the answer is the same whether or not the email exists
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body ?? {};
  if (!isValidEmail(email)) throw new AppError('A valid email is required', 400);

  const user = await User.findOne({ email: email.trim().toLowerCase(), isActive: true });

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { _id: user._id },
      { $set: { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) } }
    );

    const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    try {
      await sendMail({
        to: user.email,
        subject: 'Reset your Brightloop password',
        text: `Hello,\n\nUse this link to set a new password. It works once and expires in 1 hour:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
        html: `<p>Hello,</p><p><a href="${link}">Set a new password</a></p><p>This link works once and expires in 1 hour. If you did not ask for this, you can ignore this email.</p>`,
      });
    } catch (err) {
      // Never reveal sending problems to the caller
      console.error('Reset email failed:', err.message);
    }
  }

  res.json({ success: true, message: RESET_MESSAGE });
});

// POST /api/auth/reset-password: single use, enforced by one atomic update
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || !token) throw new AppError('Reset token is required', 400);

  const errors = validatePassword(password);
  if (errors.length) throw new AppError('Validation failed', 400, errors);

  const user = await User.findOneAndUpdate(
    { resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() } },
    {
      $set: { passwordHash: await User.hashPassword(password) },
      $unset: { resetTokenHash: 1, resetTokenExpires: 1 },
    },
    { returnDocument: 'after' }
  );
  if (!user) throw new AppError('This reset link is invalid or has expired', 400);

  res.json({ success: true, message: 'Password updated. You can now sign in.' });
});