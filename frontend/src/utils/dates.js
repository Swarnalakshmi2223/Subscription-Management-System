const IST_TIME_ZONE = 'Asia/Kolkata';

const parseDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+05:30`);
  }
  return new Date(value);
};

const getDatePartsIST = (value) => {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
};

export function toDateInputValue(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = getDatePartsIST(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
}

export function dateInputToIST(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  return `${value}T00:00:00+05:30`;
}

export function formatDateIST(value, options = {}) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    dateStyle: 'medium',
    ...options,
  }).format(date);
}

export function formatDateTimeIST(value, options = {}) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(date);
}
