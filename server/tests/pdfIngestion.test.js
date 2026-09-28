import test from 'node:test';
import assert from 'node:assert/strict';

import { parseClaudeLeadPdf } from '../utils/claudePdfParser.js';
import { makeTextPdf } from './fixtures/makeTextPdf.js';
import { HOWRAH_GYMS_PDF, WEB_DEV_LEADS_PDF } from './fixtures/claudePdfs.js';

test('parseClaudeLeadPdf reads a real binary PDF buffer', async () => {
  const buffer = makeTextPdf(HOWRAH_GYMS_PDF.split('\n'));
  const { fileName, leads, warnings } = await parseClaudeLeadPdf(buffer, 'Howrah_Gym_Leads.pdf');

  assert.equal(fileName, 'Howrah_Gym_Leads.pdf');
  assert.deepEqual(warnings, []);
  assert.equal(leads.length, 4, JSON.stringify(leads, null, 2));
  assert.equal(leads[0].customerName, 'Fitness Addiction Xtreme');
  assert.equal(leads[0].phoneNumber, '062908 79580');
  assert.equal(leads[0].address, '42, Sarat Banerjee Road, Salkia, Howrah, West Bengal 711102');
  assert.equal(leads[0].googleRating, '4.8 (763)');
  assert.equal(leads[0].websiteStatus, 'No website shown');
});

test('parseClaudeLeadPdf handles the niche-sub-label format end to end', async () => {
  const buffer = makeTextPdf(WEB_DEV_LEADS_PDF.split('\n'));
  const { leads } = await parseClaudeLeadPdf(buffer, 'web_dev_leads.pdf');
  assert.equal(leads.length, 9);
  assert.equal(leads.find((l) => l.phoneNumber === '093200 41276').businessNiche, 'Catering food & drink supplier');
});

test('parseClaudeLeadPdf degrades gracefully on a non-PDF buffer', async () => {
  const { leads, warnings } = await parseClaudeLeadPdf(Buffer.from('this is not a pdf'), 'broken.pdf');
  assert.deepEqual(leads, []);
  assert.equal(warnings.length, 1);
});

test('parseClaudeLeadPdf degrades gracefully on a text-only PDF', async () => {
  const { leads, warnings } = await parseClaudeLeadPdf(makeTextPdf(['just some prose', 'with no leads']), 'prose.pdf');
  assert.deepEqual(leads, []);
  assert.match(warnings[0], /Claude/i);
});
