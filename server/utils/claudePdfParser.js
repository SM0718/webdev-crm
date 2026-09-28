/**
 * claudePdfParser.js
 * ---------------------------------------------------------------------------
 * Parser for "Claude generated Lead List" PDFs.
 *
 * These PDFs are multi-column tables produced by Claude out of Google Business
 * Profile listings. `pdf-parse` returns the table as flat text, which means:
 *   - cells are delimited with `|`,
 *   - long cells (business name / address) WRAP onto the following line,
 *   - the column ORDER differs between PDFs, so positional indexes are unsafe,
 *   - occasionally two logical rows get MERGED into one text block.
 *
 * Because of that we never rely on column positions. We use the Phone Number as
 * a hard ANCHOR, then locate every other field relative to it.
 *
 * Supports (verified against fixtures in ../tests):
 *   - Howrah_Gym_Leads.pdf              (niche-first, single city sections)
 *   - web_dev_leads_indore_mangaluru.pdf (multi-city, multi-row sections)
 *   - web_dev_leads.pdf                  (niche sub-labels, reversed columns)
 */

import { PDFParse } from 'pdf-parse';

/* ========================================================================== *
 * 1. Key patterns
 * ========================================================================== */

/** Indian 11-digit mobiles with a space, STD landlines and +91 numbers. */
export const PHONE_REGEX = /\b(?:0\d{5}\s?\d{5}|0\d{2,4}\s?\d{3,4}\s?\d{4}|\+?91[\s-]?\d{5}[\s-]?\d{5})\b/g;

/** Google rating + review count, e.g. `4.8 (763)`, `* 4.9 (78)`, `4.8 (1.7K)`. */
export const RATING_REGEX = /\*?\s*\b\d\.\d\s*\([\d.,]+K?\)/gi;

/**
 * Safety net for listings that print the mobile WITHOUT the leading 0 or +91
 * (e.g. `98765 43210`). Only used when the strict pattern finds nothing.
 */
const PHONE_LOOSE_REGEX = /\b\d{5}\s\d{5}\b/g;

/** Rating written with a trailing word, e.g. `4.8 (1.2K reviews)`. */
const RATING_LOOSE_REGEX = /\*?\s*\b\d\.\d\s*\([\d.,]+K?\s*(?:reviews?|ratings?)?\)/gi;

/** Known Google category sub-labels used by Claude for the niche column. */
export const NICHE_PATTERNS = [
  "Women's clothing store",
  'Designer clothing store',
  'Catering food & drink supplier',
  'Dress store',
  'Clothing store',
  'Boutique',
  'Caterer',
  'Plumber',
  'Gym',
];

/** Website column boilerplate Claude emits. */
export const WEBSITE_STATUS_PATTERNS = [
  'No website shown',
  'Website button links to Instagram/YouTube only',
  'Unverified (top of listing cropped)',
  'WEBSITE BUTTON PRESENT may already have one',
];

/** Section-header keyword -> canonical niche. */
const SECTION_NICHE_KEYWORDS = [
  [/\bplumber|\bplumbing|\bpipe\s*fit|\belectrician|\bcontractor|\bcarpenter|\binterior\b/i, 'Plumber'],
  [/\bcaterer|\bcatering|\brestaurant|\bcafe|\bbakery|\bbaker\b/i, 'Caterer'],
  [/\bboutique|\bdesigner\b/i, 'Boutique'],
  [/\bdress\b/i, 'Boutique'],
  [/\bcloth|\bapparel|\bfashion\b/i, "Women's clothing store"],
  [/\bgym|\bfitness|\byoga|\bcrossfit\b/i, 'Gym'],
  [/\bstore|\bshop\b/i, 'Clothing store'],
];

const PIN_REGEX = /\b\d{6}\b/;
const ADDRESS_UNAVAILABLE = 'Address not visible in screenshot';
const DEFAULT_WEBSITE_STATUS = 'No website shown';
const UNKNOWN_NAME_PREFIX = 'Unnamed lead';
const NICHE_LABELS = new Set(NICHE_PATTERNS.map((n) => n.toLowerCase()));

/** `# | Name | ...` — a row index marker sitting at the start of a line. */
const ROW_INDEX_RE = /^\(?\s?(\d{1,2})\s*(?:\||\.|\)|:)\s+/;

/** Extra boilerplate that shows up around the table in real exports. */
const EXTRA_BOILERPLATE_RE = [
  /^page\s+\d+(\s+of\s+\d+)?\b/i,
  /^source\s*:/i,
  /^generated\s+(by|with)\b/i,
  /^created\s+(by|with)\b/i,
  /^\*?\s*(note|notes|tip|disclaimer)\s*[:\-–]/i,
  /^[-–—\s]*$/,
];

/* ========================================================================== *
 * 2. Low level helpers
 * ========================================================================== */

const clone = (re) => new RegExp(re.source, re.flags);
const findAll = (text, re) => text.match(clone(re)) ?? [];
const has = (text, re) => clone(re).test(text);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a whitespace/dash tolerant matcher out of a literal boilerplate string
 * so `WEBSITE BUTTON PRESENT may already have one` also matches
 * `WEBSITE BUTTON PRESENT - may already have one`.
 */
function tolerantMatcher(literal) {
  const normalised = literal.replace(/\s*\/\s*/g, '/');
  const body = normalised
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s*[-\\u2013\\u2014]?\\s*');
  return new RegExp(body, 'i');
}

const WEBSITE_MATCHERS = WEBSITE_STATUS_PATTERNS.map((value) => ({
  value,
  re: tolerantMatcher(value),
}));

/** Short-hand forms Claude also uses, mapped to the canonical boilerplate. */
const WEBSITE_SYNONYMS = [
  [/\bno\s*website\b|\bnone\b|\bn\/?a\b/i, 'No website shown'],
  [/\bwebsite\s*button\s*(is\s*)?present\b|\bhas\s*(a\s*)?website\b|\bwebsite\s*present\b/i, 'WEBSITE BUTTON PRESENT may already have one'],
  [/\binstagram\b|\byoutube\b|\bfacebook\b|\bwhatsapp\b/i, 'Website button links to Instagram/YouTube only'],
  [/\bunverified\b|\bcropped\b/i, 'Unverified (top of listing cropped)'],
];

/** Normalise raw `pdf-parse` output without destroying line structure. */
function normaliseText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** Vocabulary that only ever appears in a table HEADER row. */
const HEADER_VOCABULARY = new Set([
  'business', 'business name', 'name', 'category', 'categories', 'niche',
  'phone', 'phone no', 'phone number', 'number', 'contact', 'google',
  'google rating', 'rating', 'ratings', 'reviews', 'address', 'website',
  'website status', 'website button', 'status', 'star', 'city', 'area',
  'pin', 'pin code', 'locality', 'remarks', 'owner', 'email', 'hours',
]);

/** True when the line is table chrome (header row, page furniture, notes). */
function isBoilerplateLine(line) {
  if (!line) return true;
  if (/^Notes for Outreach/i.test(line)) return true;
  if (/^Before you pitch/i.test(line)) return true;
  if (/^Page \d+/i.test(line)) return true;
  if (/^Businesses with no website/i.test(line)) return true;
  if (/^All \d+ businesses/i.test(line)) return true;
  if (/^\d+ (boutiques|caterers|plumbers|gyms|businesses|shops|stores) across/i.test(line)) return true;
  if (/^Web Development Lead List/i.test(line)) return true;
  if (/^#\s*\|/.test(line)) return true;
  if (/^#/.test(line) && /business|category|phone|rating|niche|website/i.test(line)) return true;

  if (line.includes('|')) {
    // Every single cell is a header word -> `| Star | Rating | Status |`
    const cells = line.split('|').map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (cells.length >= 2 && cells.every((c) => HEADER_VOCABULARY.has(c))) return true;
    // Shouted continuation of the header row: `| Google Rating | Website |`
    const letters = line.replace(/[^A-Za-z]/g, '');
    if (letters.length > 0 && letters === letters.toUpperCase() && /[A-Z]{4,}/.test(letters)) return true;
  }

  if (EXTRA_BOILERPLATE_RE.some((re) => re.test(line))) return true;
  return false;
}

/** A section header like `Howrah Gyms`, `BOUTIQUES`, `3. Mangaluru Plumbers`. */
function sectionNicheOf(line) {
  if (!line || line.includes('|')) return null;
  if (has(line, PHONE_REGEX) || has(line, RATING_REGEX)) return null;
  if (line.length > 70) return null;
  if (isBoilerplateLine(line)) return null;

  // Drop list numbering: `3. Mangaluru Plumbers`, `Section 2 - BOUTIQUES`
  const numbered = line.replace(/^\(?\s?\d{1,2}\s*[.)\]:-]\s*/, '');
  const stripped = numbered.replace(/^section\s*\d+\s*[-–—:]?\s*/i, '').trim();
  if (!stripped || stripped.length > 60) return null;
  if (/\d/.test(stripped)) return null; // real data (house numbers, ratings)
  if (stripped.split(' ').length > 5) return null;

  const upper = stripped.toUpperCase();
  const looksLikeHeader =
    upper === stripped || // SHOUTY CAPS
    /\bs$/i.test(stripped) || // Howrah Gyms / Boutiques / Plumbers
    /^(the\s+)?(gyms?|boutiques?|caterers?|plumbers?|restaurants?|stores?|shops?|list)$/i.test(stripped);
  if (!looksLikeHeader) return null;

  for (const [re, niche] of SECTION_NICHE_KEYWORDS) {
    if (re.test(stripped)) return niche;
  }
  return null;
}

/** Longest, most specific niche label present in a chunk (newline tolerant). */
function nicheFromChunk(chunk) {
  const haystack = chunk.replace(/\s+/g, ' ').toLowerCase();
  let best = null;
  for (const label of NICHE_PATTERNS) {
    if (!haystack.includes(label.toLowerCase())) continue;
    if (!best || label.length > best.length) best = label;
  }
  return best;
}

function tidyAddress(parts) {
  return parts
    .map((p) => p.replace(/^[\s,;|]+|[\s,;|]+$/g, ''))
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripRowIndex(text) {
  return text.replace(ROW_INDEX_RE, '');
}

function normalisePhone(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/* ========================================================================== *
 * 3. Field extraction for a single record block
 * ========================================================================== */

/** Split a block into residual segments, dropping index / phone / rating / website cells. */
function residualSegments(chunkText) {
  let masked = stripRowIndex(chunkText);

  let websiteStatus = null;
  for (const { value, re } of WEBSITE_MATCHERS) {
    if (has(masked, re)) {
      websiteStatus = value;
      masked = masked.replace(clone(re), ' ');
    }
  }
  if (!websiteStatus) {
    for (const [re, value] of WEBSITE_SYNONYMS) {
      if (has(masked, re)) {
        websiteStatus = value;
        masked = masked.replace(clone(re), ' ');
        break;
      }
    }
  }

  masked = masked
    .split(PHONE_REGEX)
    .join(' ')
    .split(PHONE_LOOSE_REGEX)
    .join(' ')
    .split(RATING_REGEX)
    .join(' ')
    .split(RATING_LOOSE_REGEX)
    .join(' ');

  const segments = masked
    .split(/[|\n]/)
    .map((s) => s.replace(/^[|\s]+|[|\s]+$/g, '').replace(/[ \t]{2,}/g, ' ').trim())
    // Leading row index that survived (e.g. `12)`)
    .filter((s, i) => !(i < 2 && /^\(?\d{1,2}\)?[.)\]]?$/.test(s)))
    // Standalone niche cell (`| Gym |`, `| Caterer |`) - keep the label, drop the cell
    .filter((s) => !NICHE_LABELS.has(s.toLowerCase()))
    // Pure phone residue (7+ digits / separators only) that no regex claimed
    .filter((s) => !/^[\d\s\-()+/.]{7,}$/.test(s))
    .filter(Boolean);

  return { segments, websiteStatus: websiteStatus ?? DEFAULT_WEBSITE_STATUS };
}

/**
 * Pull name + address out of the residual segments.
 * Layout inside a record is always `Name | ... | Address ...` (both column
 * orders keep the business name first), and the address is the run of segments
 * that terminates on a 6-digit Indian PIN code.
 */
function splitNameAndAddress(segments) {
  const isPinSegment = (s) => PIN_REGEX.test(s) || s.toLowerCase().includes(ADDRESS_UNAVAILABLE.toLowerCase());
  const isAddressLookalike = (s) => /^\d+\s*[,\/]/.test(s) || /\b(road|rd\.|street|st\.|nagar|colony|avenue|ave\.|lane|sector|block|flat|shop|plot|building|complex|market|bzr|cross)\b/i.test(s);

  let pinIdx = -1;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (isPinSegment(segments[i])) {
      pinIdx = i;
      break;
    }
  }

  if (pinIdx === 0) {
    // Address is the very first residual cell -> no usable name in this block.
    return { nameSegments: [], addressSegments: segments.slice(0, pinIdx + 1) };
  }

  if (pinIdx > 0) {
    // Walk back over wrapped address cells, never past the first cell (the name).
    let start = pinIdx;
    while (start > 1 && isAddressLookalike(segments[start - 1])) start -= 1;
    return { nameSegments: segments.slice(0, start), addressSegments: segments.slice(start, pinIdx + 1) };
  }

  // No PIN: fall back to a leading house-number / street-keyword cell run.
  if (segments.length >= 2 && isAddressLookalike(segments[1])) {
    return { nameSegments: segments.slice(0, 1), addressSegments: segments.slice(1) };
  }

  return { nameSegments: segments, addressSegments: [] };
}

/**
 * Business name = the leading cell(s) of a record, rejoined across wraps.
 *
 * Redundant niche labels were already removed as standalone cells in
 * `residualSegments()` (`| Fitness Addiction Xtreme | Gym |` -> `Fitness
 * Addiction Xtreme`). A niche word glued onto the end of a real name
 * (`Star Iron Gym`, `Sai Lakshmi Catering Services`) is part of the business
 * name and is deliberately preserved.
 */
function cleanCustomerName(segments) {
  return segments
    .join(' ')
    .replace(/^#\s*/, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Extract every field from ONE record block (assumes <= 1 phone). */
function extractFields(chunkText, sectionNiche, pool = {}) {
  const chunk = chunkText.trim();
  if (!chunk) return null;

  let phones = findAll(chunk, PHONE_REGEX);
  if (phones.length === 0) {
    // Loose fallback, but never accept a 6 digit PIN as a phone.
    const pin = chunk.match(clone(PIN_REGEX));
    phones = findAll(chunk, PHONE_LOOSE_REGEX).filter(
      (p) => !(pin && p.replace(/\D/g, '').length === 6),
    );
  }

  let ratings = findAll(chunk, RATING_REGEX);
  if (ratings.length === 0) ratings = findAll(chunk, RATING_LOOSE_REGEX);

  const phone = normalisePhone(phones[0] ?? pool.phones?.shift() ?? '');
  const ratingRaw = ratings[0] ?? pool.ratings?.shift() ?? '';

  const { segments, websiteStatus } = residualSegments(chunk);
  const { nameSegments, addressSegments } = splitNameAndAddress(segments);

  let address = tidyAddress(addressSegments);
  if (/address not visible/i.test(address)) address = ADDRESS_UNAVAILABLE;
  if (!address && pool.addresses?.length) address = pool.addresses.shift();

  const customerName = cleanCustomerName(nameSegments) || (pool.names?.length ? pool.names.shift() : '');

  const businessNiche = nicheFromChunk(chunk) ?? sectionNiche ?? 'Business';

  if (!phone) return null;

  return {
    customerName,
    phoneNumber: phone,
    address,
    businessNiche,
    googleRating: ratingRaw.replace(/^\*?\s*/, '').replace(/\s+/g, ' ').trim(),
    websiteStatus: websiteStatus !== DEFAULT_WEBSITE_STATUS ? websiteStatus : (pool.websiteStatus ?? DEFAULT_WEBSITE_STATUS),
  };
}

/* ========================================================================== *
 * 4. Record segmentation (anchor based)
 * ========================================================================== */

/**
 * Locate the `# |` row-index markers that actually start a record.
 *
 * A marker is only accepted when the text it introduces (up to the next
 * candidate) contains a phone number. That filters out false positives such as
 * a review count wrapping onto its own line - `(8) | WEBSITE BUTTON PRESENT ...`
 * looks exactly like row 8 but owns no phone.
 */
function rowMarkerOffsets(text, requirePipe) {
  const candidates = [];
  const re = /^\(?\s?\d{1,2}\s*(?:\||\.|\)|:)\s+/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    const lineEnd = text.indexOf('\n', match.index);
    const line = text.slice(match.index, lineEnd === -1 ? text.length : lineEnd);
    if (requirePipe && !line.includes('|')) continue;
    candidates.push(match.index);
  }

  return candidates.filter((offset, i) => {
    const end = i + 1 < candidates.length ? candidates[i + 1] : text.length;
    const region = text.slice(offset, end);
    return has(region, PHONE_REGEX) || has(region, PHONE_LOOSE_REGEX);
  });
}

/**
 * A block can hold two logical rows when the PDF wrapped them together.
 * Split it back into its constituent rows.
 */
function splitMergedRow(chunkText) {
  const phones = [];
  const phoneRe = clone(PHONE_REGEX);
  let m;
  while ((m = phoneRe.exec(chunkText)) !== null) phones.push({ start: m.index, end: m.index + m[0].length });
  if (phones.length < 2) return [chunkText];

  const markers = rowMarkerOffsets(chunkText, false).filter((o) => o > 0);
  if (markers.length >= 1) {
    const parts = [];
    let cursor = 0;
    for (const offset of markers) {
      parts.push(chunkText.slice(cursor, offset));
      cursor = offset;
    }
    parts.push(chunkText.slice(cursor));
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  // No inner row marker: fall back to the last line break before the 2nd phone.
  const newline = chunkText.lastIndexOf('\n', phones[1].start);
  const boundary = newline >= phones[0].end ? newline : phones[0].end;
  return [chunkText.slice(0, boundary), chunkText.slice(boundary)]
    .map((p) => p.trim())
    .filter(Boolean);
}

/* ========================================================================== *
 * 5. Public API
 * ========================================================================== */

/**
 * Parse raw Claude-PDF text into normalised lead records.
 * @param {string} rawText
 * @returns {Array<Object>}
 */
export function parseClaudeLeadText(rawText) {
  const text = normaliseText(rawText);
  if (!text) return [];

  // 1. Drop header / footer boilerplate and tag each surviving line with the
  //    section niche that is active at that point in the document.
  const lines = [];
  let currentNiche = null;
  for (const rawLine of text.split('\n')) {
    if (isBoilerplateLine(rawLine)) continue;
    const headerNiche = sectionNicheOf(rawLine);
    if (headerNiche) {
      currentNiche = headerNiche;
      continue;
    }
    lines.push({ text: rawLine, niche: currentNiche });
  }

  const body = lines.map((l) => l.text).join('\n');
  if (!body.trim()) return [];

  // 2. Split the body into logical row blocks (keeping exact char offsets so we
  //    can resolve which section header a block belongs to).
  const requirePipe = body.includes('|');
  const markers = rowMarkerOffsets(body, requirePipe);
  /** @type {Array<{ text: string, start: number }>} */
  let blocks;
  if (markers.length > 0) {
    blocks = [];
    for (let i = 0; i < markers.length; i += 1) {
      const end = i + 1 < markers.length ? markers[i + 1] : body.length;
      blocks.push({ text: body.slice(markers[i], end), start: markers[i] });
    }
  } else {
    // Pipe-less export: one physical line per row, wrapping absorbed per line.
    blocks = [];
    let cursor = 0;
    for (const line of lines) {
      const start = body.indexOf(line.text, cursor);
      if (start !== -1) cursor = start + line.text.length;
      blocks.push({ text: line.text, start });
    }
  }

  // 3. Anchor based field extraction per block, un-merging wrapped rows.
  const leads = [];

  for (const block of blocks) {
    const nicheForBlock = lineNicheAt(lines, block.start);
    for (const sub of splitMergedRow(block.text)) {
      const lead = extractFields(sub, nicheForBlock);
      if (!lead || !lead.phoneNumber) continue;
      leads.push(finaliseLead(lead));
    }
  }

  return dedupe(leads);
}

/** Niche of the section header that is active at `offset` inside `body`. */
function lineNicheAt(lines, offset) {
  if (offset < 0) return null;
  let cursor = 0;
  let niche = null;
  for (const line of lines) {
    if (offset < cursor + line.text.length) return line.niche;
    niche = line.niche;
    cursor += line.text.length + 1; // + '\n'
  }
  return niche;
}

function finaliseLead(lead) {
  const fallbackName = `${UNKNOWN_NAME_PREFIX} (${lead.phoneNumber})`;
  return {
    customerName: lead.customerName || fallbackName,
    phoneNumber: lead.phoneNumber,
    address: lead.address || '',
    businessNiche: lead.businessNiche || 'Business',
    googleRating: lead.googleRating || '',
    websiteStatus: lead.websiteStatus || DEFAULT_WEBSITE_STATUS,
  };
}

function dedupe(leads) {
  const seen = new Set();
  const out = [];
  for (const lead of leads) {
    const key = lead.phoneNumber.replace(/\D/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

/**
 * Parse an in-memory PDF buffer. Never throws on a bad PDF.
 * @param {Buffer} buffer
 * @returns {{ fileName: string|null, leads: Array<Object>, warnings: string[] }}
 */
export async function parseClaudeLeadPdf(buffer, fileName = null) {
  const warnings = [];
  let text = '';
  let readFailed = false;
  let parser = null;

  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = typeof result?.text === 'string' ? result.text : '';
  } catch (error) {
    readFailed = true;
    warnings.push(`Could not read this file as a PDF: ${error?.message ?? 'unknown error'}`);
    text = '';
  } finally {
    try {
      await parser?.destroy();
    } catch {
      /* the worker is already gone - nothing to clean up */
    }
  }

  const leads = parseClaudeLeadText(text);

  if (leads.length === 0 && !readFailed) {
    warnings.push(
      text.trim()
        ? 'No lead rows were detected in this PDF. Confirm it is a Claude "Lead List" export.'
        : 'No selectable text found. The PDF is probably a scan or image - run it through OCR first.',
    );
  }

  return { fileName, leads, warnings };
}

export default parseClaudeLeadPdf;
