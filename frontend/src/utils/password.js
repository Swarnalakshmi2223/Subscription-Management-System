export const passwordRules = [
  { id: 'len', label: 'More than 8 characters', test: (p) => p.length > 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'special', label: 'One special character', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export const isPasswordValid = (p) => passwordRules.every((r) => r.test(p));

export const isEmailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());