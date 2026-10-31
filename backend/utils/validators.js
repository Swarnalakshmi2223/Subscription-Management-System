export const cleanString = (v) => (typeof v === 'string' ? v.trim() : undefined);

export function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

// More than 8 characters, with uppercase, lowercase and a special character
export function validatePassword(password) {
  if (typeof password !== 'string') return ['Password is required'];
  const errors = [];
  if (password.length <= 8) errors.push('Password must be more than 8 characters');
  if (password.length > 72) errors.push('Password must be at most 72 characters');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[^A-Za-z0-9\s]/.test(password)) errors.push('Password must contain a special character');
  return errors;
}

export function validateNewUser({ name, email, password }) {
  const errors = [];
  if (typeof name !== 'string' || !name.trim()) errors.push('Name is required');
  if (!isValidEmail(email)) errors.push('A valid email is required');
  errors.push(...validatePassword(password));
  return errors;
}