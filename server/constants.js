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
