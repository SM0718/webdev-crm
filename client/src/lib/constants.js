/** Mirrors server/constants.js - keep the two in sync. */
export const LEAD_STATUSES = [
  'New',
  'Assigned',
  'Contacted',
  'Called - No Answer',
  'Interested',
  'Free Demo Sent',
  'Follow-Up',
  'Converted',
  'Not Interested',
  'Invalid Number',
];

/**
 * Login handle rules, mirroring server/constants.js - keep the two in sync.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
export const USERNAME_MESSAGE =
  'Use 3-30 letters, numbers, dot, underscore or hyphen, starting with a letter or number';

/** Tailwind-ish class per status so the table reads at a glance. */
export const STATUS_VARIANTS = {
  New: 'muted',
  Assigned: 'info',
  Contacted: 'info',
  'Called - No Answer': 'warning',
  Interested: 'violet',
  'Free Demo Sent': 'violet',
  'Follow-Up': 'warning',
  Converted: 'success',
  'Not Interested': 'destructive',
  'Invalid Number': 'destructive',
};

/** Deterministic colour per niche so badges stay stable between renders. */
const NICHE_PALETTE = [
  'info',
  'violet',
  'success',
  'warning',
  'secondary',
  'default',
  'outline',
];

export function nicheVariant(niche = '') {
  let hash = 0;
  for (let i = 0; i < niche.length; i += 1) hash = (hash * 31 + niche.charCodeAt(i)) % 100003;
  return NICHE_PALETTE[hash % NICHE_PALETTE.length];
}

export const WEBSITE_STATUS_PATTERNS = [
  'No website shown',
  'Website button links to Instagram/YouTube only',
  'Unverified (top of listing cropped)',
  'WEBSITE BUTTON PRESENT may already have one',
];

/** Pull the rating value + review count out of `4.8 (1.7K)`. */
export function parseRating(raw = '') {
  const match = String(raw).match(/(\d+(?:\.\d+)?)\s*\(([^)]+)\)/);
  if (!match) return { score: null, reviews: null, isStrong: false };
  const score = Number(match[1]);
  const reviews = match[2].trim();
  return {
    score,
    reviews,
    isStrong: Number.isFinite(score) && score >= 4.5,
  };
}
