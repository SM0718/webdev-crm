export const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase() || '?';

/** `098269 63500` -> `tel:9826963500` */
export const telHref = (phone = '') => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path below */
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS = [
  ['year', 31536000000],
  ['month', 2592000000],
  ['week', 604800000],
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
];

export function relativeTime(input) {
  if (!input) return '';
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';

  const diff = then - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45000) return 'just now';

  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

export const formatDateTime = (input) => {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Shorten a long address for a fixed-width table cell. */
export const truncate = (text = '', max = 64) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/* ------------------------------------------------------------------ money */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `12500` -> `₹12,500`. Paise only show up when they carry information, so a
 * clean rupee amount stays short enough for a table cell.
 */
export function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '—';

  const abs = Math.abs(n);
  return Number.isInteger(n) || abs < 1000 ? inrWhole.format(n) : inrPaise.format(n);
}

/**
 * Parses an amount typed into a free-text box. Accepts the shapes people
 * actually type — `25000`, `25,000`, ` 25,000.50 `, `₹25000` — and returns
 * `NaN` for anything else so the form can refuse to save it.
 */
export function parseAmountInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;

  const cleaned = String(value ?? '')
    .replace(/[₹,\s]/g, '')
    .trim();

  if (cleaned === '') return 0;
  if (!/^\d*\.?\d*$/.test(cleaned)) return Number.NaN;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}
