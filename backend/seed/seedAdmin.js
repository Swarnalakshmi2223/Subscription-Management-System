import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import { validateNewUser } from '../utils/validators.js';

async function run() {
  const { ADMIN_NAME = 'Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  const errors = validateNewUser({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (errors.length) {
    console.error('Fix ADMIN_* values in .env:\n- ' + errors.join('\n- '));
    process.exit(1);
  }

  await connectDB();
  const email = ADMIN_EMAIL.trim().toLowerCase();

  if (await User.findOne({ email })) {
    console.log(`Admin already exists: ${email}`);
  } else {
    await User.create({
      name: ADMIN_NAME.trim(),
      email,
      passwordHash: await User.hashPassword(ADMIN_PASSWORD),
      role: 'admin',
    });
    console.log(`Admin created: ${email}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});