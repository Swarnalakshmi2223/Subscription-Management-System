import { AppError } from './AppError.js';

// Business calendar: India (IST, UTC+05:30, no daylight saving).
const IST_OFFSET_MS = 330 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const fromYMD = (y, m, d) => new Date(`${y}-${pad(m)}-${pad(d)}T00:00:00+05:30`);

// 'YYYY-MM-DD' calendar date in India for any instant
export const istDateString = (date = new Date()) =>
  new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// Midnight (IST) at the start of that day, as a Date
export const startOfDayIST = (date = new Date()) => fromYMD(...istDateString(date).split('-').map(Number));

// Add whole billing periods. Month and year steps never overflow:
// 31 Jan + 1 month = 28 Feb (or 29 Feb in a leap year).
export const addPeriod = (date, period, count = 1) => {
  const [y, m, d] = istDateString(date).split('-').map(Number);

  if (period === 'daily' || period === 'weekly') {
    const days = (period === 'weekly' ? 7 : 1) * count;
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return fromYMD(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  if (period === 'monthly') {
    const total = m - 1 + count;
    const ty = y + Math.floor(total / 12);
    const tm = ((total % 12) + 12) % 12;
    const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return fromYMD(ty, tm + 1, Math.min(d, last));
  }
  if (period === 'yearly') {
    const last = new Date(Date.UTC(y + count, m, 0)).getUTCDate();
    return fromYMD(y + count, m, Math.min(d, last));
  }
  throw new AppError('Invalid billing period', 400);
};