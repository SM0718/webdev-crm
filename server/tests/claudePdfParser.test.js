import test from 'node:test';
import assert from 'node:assert/strict';

import { parseClaudeLeadText } from '../utils/claudePdfParser.js';
import {
  HOWRAH_GYMS_PDF,
  INDORE_MANGALURU_PDF,
  WEB_DEV_LEADS_PDF,
  MERGED_ROW_WITH_MARKER_PDF,
} from './fixtures/claudePdfs.js';

const byPhone = (leads, phone) => leads.find((l) => l.phoneNumber.replace(/\s/g, '') === phone.replace(/\s/g, ''));
const phoneOf = (leads, nameFragment) => {
  const lead = leads.find((l) => l.customerName.toLowerCase().includes(nameFragment.toLowerCase()));
  assert.ok(lead, `expected a lead matching "${nameFragment}" in ${JSON.stringify(leads.map((l) => l.customerName))}`);
  return lead;
};

/* ------------------------------------------------------------------ FORMAT 1 */
test('Howrah_Gym_Leads.pdf -> 4 gyms, clean names, merged wrapped PINs', () => {
  const leads = parseClaudeLeadText(HOWRAH_GYMS_PDF);
  assert.equal(leads.length, 4);

  const addiction = phoneOf(leads, 'Fitness Addiction Xtreme');
  assert.equal(addiction.customerName, 'Fitness Addiction Xtreme', 'standalone "Gym" cell must be stripped');
  assert.equal(addiction.phoneNumber, '062908 79580');
  assert.equal(addiction.businessNiche, 'Gym');
  assert.equal(addiction.googleRating, '4.8 (763)', 'leading "*" must be stripped');
  assert.equal(addiction.websiteStatus, 'No website shown');
  assert.equal(
    addiction.address,
    '42, Sarat Banerjee Road, Salkia, Howrah, West Bengal 711102',
    'wrapped address must be joined with a comma',
  );

  const ironTemple = phoneOf(leads, 'Iron Temple');
  assert.equal(ironTemple.googleRating, '4.9 (78)');
  assert.equal(ironTemple.websiteStatus, 'WEBSITE BUTTON PRESENT may already have one');
  assert.equal(ironTemple.address, '12/3 G.T. Road, Shibpur, Howrah, West Bengal', 'address without a PIN is still recovered');

  const starIron = phoneOf(leads, 'Star Iron');
  assert.equal(starIron.customerName, 'Star Iron Gym & Health Club', 'a niche word inside a real name is preserved');
  assert.equal(starIron.googleRating, '4.5 (1.2K)');
  assert.equal(starIron.address, '88, Jagadish Chandra Bose Road, Shibpur, Howrah, West Bengal 711102');

  const bodyZone = byPhone(leads, '033 2499 7526');
  assert.equal(bodyZone.customerName, 'Body Zone Fitness Centre');
  assert.equal(bodyZone.businessNiche, 'Gym');
  assert.equal(bodyZone.address, '5, Mallik Ghat, Strand Road, Howrah, West Bengal 700007');
});

test('Howrah_Gym_Leads.pdf -> no page furniture leaks into a lead', () => {
  const leads = parseClaudeLeadText(HOWRAH_GYMS_PDF);
  for (const lead of leads) {
    const blob = JSON.stringify(lead).toLowerCase();
    for (const noise of ['page 1', 'notes for outreach', 'before you pitch', 'all 10 businesses', 'web development lead list', '#']) {
      assert.ok(!blob.includes(noise), `"${noise}" leaked into ${lead.customerName}`);
    }
  }
});

/* ------------------------------------------------------------------ FORMAT 2 */
test('indore/mangaluru -> section headers drive the niche for both cities', () => {
  const leads = parseClaudeLeadText(INDORE_MANGALURU_PDF);
  assert.equal(leads.length, 9);
  for (const lead of leads) {
    assert.equal(lead.businessNiche, 'Plumber', `${lead.customerName} should be a Plumber`);
  }
});

test('indore/mangaluru -> merged row 3+4 is un-merged into two correct leads', () => {
  const leads = parseClaudeLeadText(INDORE_MANGALURU_PDF);

  const row3 = byPhone(leads, '076048 61188');
  assert.equal(row3.customerName, 'Star Iron Gym');
  assert.equal(row3.googleRating, '4.5 (1.2K)', 'a rating that wrapped to the next line is recovered');
  assert.equal(row3.address, '44, Rajwada, Indore, Madhya Pradesh');

  const row4 = byPhone(leads, '044 2499 7526');
  assert.equal(row4.customerName, 'Sagar Pipes & Sanitary');
  assert.equal(row4.googleRating, '4.9 (78)');
  assert.equal(row4.address, '7, M.G. Road, Indore, Madhya Pradesh, 452017', 'wrapped PIN is merged back into the address');
});

test('indore/mangaluru -> rating that wrapped across a line break is recovered', () => {
  const leads = parseClaudeLeadText(INDORE_MANGALURU_PDF);
  const row3 = byPhone(leads, '076048 61188');
  assert.equal(row3.googleRating, '4.5 (1.2K)');
});

test('indore/mangaluru -> "Address not visible in screenshot" and all website variants', () => {
  const leads = parseClaudeLeadText(INDORE_MANGALURU_PDF);
  const goyal = byPhone(leads, '099911 22880');
  assert.equal(goyal.customerName, 'Goyal Electrical & Plumbing');
  assert.equal(goyal.address, 'Address not visible in screenshot');
  assert.equal(goyal.websiteStatus, 'Unverified (top of listing cropped)');

  assert.equal(byPhone(leads, '098277 10542').websiteStatus, 'WEBSITE BUTTON PRESENT may already have one');
  assert.equal(byPhone(leads, '093200 41276').address, '22, Annapurna Road, Vijay Nagar, Indore, Madhya Pradesh 452010');
});

/* ------------------------------------------------------------------ FORMAT 3 */
test('web_dev_leads.pdf -> 9 leads across three sections', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  assert.equal(leads.length, 9, JSON.stringify(leads, null, 2));
});

test('web_dev_leads.pdf -> wrapped business names are rejoined', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  assert.equal(phoneOf(leads, 'Anusha J').customerName, 'Anusha J Couture');
  assert.equal(phoneOf(leads, 'Sai Lakshmi').customerName, 'Sai Lakshmi Catering Services');
  assert.equal(phoneOf(leads, 'Ziya').customerName, 'Ziya Fashion');
  assert.equal(phoneOf(leads, 'New Kolkata').customerName, 'New Kolkata Plumbing');
  assert.equal(phoneOf(leads, 'Aspiring').customerName, 'Aspiring Home Services');
});

test('web_dev_leads.pdf -> a wrapped review count is not mistaken for a row index', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  assert.equal(phoneOf(leads, 'Aspiring').googleRating, '4.1 (8)');
});

test('web_dev_leads.pdf -> most specific niche sub-label wins', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  assert.equal(phoneOf(leads, 'Anusha J').businessNiche, "Women's clothing store");
  assert.equal(phoneOf(leads, 'Ziya').businessNiche, 'Designer clothing store');
  assert.equal(phoneOf(leads, 'Saree Ghar').businessNiche, 'Dress store');
  assert.equal(phoneOf(leads, 'Sai Lakshmi').businessNiche, 'Catering food & drink supplier');
  assert.equal(phoneOf(leads, 'Royal Rasoi').businessNiche, 'Caterer');
  assert.equal(phoneOf(leads, 'Baba Pipe').businessNiche, 'Plumber');
});

test('web_dev_leads.pdf -> every website-status boilerplate value is mapped', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  assert.equal(phoneOf(leads, 'Anusha J').websiteStatus, 'No website shown');
  assert.equal(phoneOf(leads, 'Ziya').websiteStatus, 'WEBSITE BUTTON PRESENT may already have one');
  assert.equal(phoneOf(leads, 'Sai Lakshmi').websiteStatus, 'Website button links to Instagram/YouTube only');
  assert.equal(phoneOf(leads, 'Annapurna').websiteStatus, 'Unverified (top of listing cropped)');
});

test('web_dev_leads.pdf -> the two-row table header never becomes a lead', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  const names = leads.map((l) => l.customerName).join(' | ');
  assert.ok(!/business/i.test(names), `header leaked: ${names}`);
  assert.ok(!/^Star$/m.test(names), 'second header row leaked: ' + names);
});

test('web_dev_leads.pdf -> wrapped website column is resolved per row', () => {
  const leads = parseClaudeLeadText(WEB_DEV_LEADS_PDF);
  assert.equal(phoneOf(leads, 'Saree Ghar').websiteStatus, 'No website shown');
  assert.equal(phoneOf(leads, 'Annapurna').googleRating, '4.2 (37)');
  assert.equal(phoneOf(leads, 'Annapurna').address, '82, Barrackpore Trunk Road, Kolkata, West Bengal, 700035');
  assert.equal(phoneOf(leads, 'Baba Pipe').address, '31, Belgharia Road, Kolkata, West Bengal, 700056', 'PIN wrapped onto the next pipe line is merged back');
  assert.equal(phoneOf(leads, 'Baba Pipe').googleRating, '4.5 (140)');
});

/* ------------------------------------------------------------------- MISC */
test('merged row that keeps its marker parses as two leads', () => {
  const leads = parseClaudeLeadText(MERGED_ROW_WITH_MARKER_PDF);
  assert.equal(leads.length, 2);
  assert.equal(byPhone(leads, '076048 61188').customerName, 'Star Iron Gym');
  assert.equal(byPhone(leads, '044 2499 7526').customerName, 'Sagar Pipes & Sanitary');
  assert.equal(byPhone(leads, '044 2499 7526').googleRating, '4.9 (78)');
});

test('two phone numbers stacked in one block produce two leads', () => {
  const stacked = `Plumbers
# | Business | Phone | Address | Niche | Google Rating | Website
3 | Star Iron Gym | 076048 61188 | 44, Rajwada, Kolkata, West Bengal 700001 | Plumber |
4.5 (1.2K) | No website shown
4 | Iron Temple Gym | 044 2499 7526 | 7, M.G. Road, Kolkata, West Bengal 700017 | Plumber
| 4.9 (78) | No website shown
`;
  const leads = parseClaudeLeadText(stacked);
  assert.equal(leads.length, 2);
  assert.equal(leads[0].customerName, 'Star Iron Gym');
  assert.equal(leads[1].customerName, 'Iron Temple Gym');
  assert.equal(leads[0].googleRating, '4.5 (1.2K)');
  assert.equal(leads[1].googleRating, '4.9 (78)');
  assert.equal(leads[1].address, '7, M.G. Road, Kolkata, West Bengal 700017');
});

test('a row whose business name vanished still yields an editable placeholder lead', () => {
  const broken = `Plumbers
# | Business | Phone | Address | Niche | Google Rating | Website
3 | Star Iron Gym | 076048 61188 | 44, Rajwada, Kolkata, West Bengal 700001 | Plumber |
4.5 (1.2K) | No website shown
4 |  | 044 2499 7526 | 7, M.G. Road, Kolkata, West Bengal 700017 | Plumber | 4.9 (78)
| No website shown
`;
  const leads = parseClaudeLeadText(broken);
  assert.equal(leads.length, 2);
  assert.equal(leads[1].customerName, 'Unnamed lead (044 2499 7526)');
});

test('duplicate phone numbers inside one PDF collapse to one lead', () => {
  const leads = parseClaudeLeadText(MERGED_ROW_WITH_MARKER_PDF + MERGED_ROW_WITH_MARKER_PDF);
  assert.equal(leads.length, 2);
});

test('empty / junk input returns an empty array instead of throwing', () => {
  assert.deepEqual(parseClaudeLeadText(''), []);
  assert.deepEqual(parseClaudeLeadText(null), []);
  assert.deepEqual(parseClaudeLeadText('Notes for Outreach\nPage 1\n'), []);
});
