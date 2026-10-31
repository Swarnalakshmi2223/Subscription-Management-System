const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function rupeesToPaise(value) {
  const rupees = Number(value);
  if (!Number.isFinite(rupees)) return 0;

  const paise = Math.round((rupees + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(paise)) throw new RangeError('Money value is too large');
  return paise;
}

export function paiseToRupees(paise) {
  return Number(paise || 0) / 100;
}

export function formatINR(paise) {
  return INR_FORMATTER.format(paiseToRupees(paise));
}
