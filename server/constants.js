/** Single source of truth for lead statuses - shared with the client. */
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

/** Statuses that count as "the member actually spoke to them". */
export const CONTACTED_STATUSES = ['Contacted', 'Interested', 'Free Demo Sent', 'Follow-Up', 'Converted'];

export const DEFAULT_WEBSITE_STATUS = 'No website shown';

export const USER_ROLES = ['admin', 'member'];

/**
 * Login identifier. Handle style, not an email address.
 * Kept in sync with `client/src/lib/constants.js` and the `username` field
 * on the User model.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_MESSAGE =
  'Use 3-30 letters, numbers, dot, underscore or hyphen, starting with a letter or number';
