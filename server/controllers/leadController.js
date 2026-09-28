import mongoose from 'mongoose';

import { CONTACTED_STATUSES, LEAD_STATUSES } from '../constants.js';
import { Lead } from '../models/Lead.js';
import { User } from '../models/User.js';
import { parseClaudeLeadPdf } from '../utils/claudePdfParser.js';
import { buildLeadPdf } from '../utils/leadPdf.js';
import { withPaymentFields } from '../utils/leadMoney.js';
import { ApiError, asyncHandler } from '../middlewares/error.js';

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Phone numbers are scraped with inconsistent spacing, so exact matches are not
 * enough. Indexes whatever the CRM already holds by digits-only phone number so
 * a parsed row can be traced back to the lead it duplicates.
 *
 * @returns {Promise<Map<string, object>>} digits-only phone -> stored lead (lean)
 */
const indexStoredLeadsByPhone = async (parsedLeads) => {
  const byDigits = new Map();

  const record = (row) => {
    const key = digitsOnly(row.phoneNumber);
    if (key && !byDigits.has(key)) byDigits.set(key, row);
  };

  const exact = await Lead.find(
    { phoneNumber: { $in: parsedLeads.map((lead) => lead.phoneNumber) } },
    { phoneNumber: 1 },
  ).lean();
  exact.forEach(record);

  // Second pass for the rows the exact match missed, e.g. a stored
  // `06290879580` against a parsed `062908 79580`.
  const missing = [...new Set(parsedLeads.map((lead) => digitsOnly(lead.phoneNumber)))].filter(
    (key) => key && !byDigits.has(key),
  );

  if (missing.length > 0) {
    const loose = await Lead.collection.find(
      { $expr: { $in: [{ $toString: '$phoneNumber' }, missing] } },
      { projection: { phoneNumber: 1 } },
    ).toArray();
    loose.forEach(record);
  }

  return byDigits;
};

/** Collapses rows the parser emitted twice for the same business. */
const dedupeByPhone = (parsedLeads) => {
  const seen = new Set();
  return parsedLeads.filter((lead) => {
    const key = digitsOnly(lead.phoneNumber);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* ------------------------------------------------------- PDF preview (step 1) */

export const parsePdf = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Attach a PDF file before parsing.');

  const { fileName, leads, warnings } = await parseClaudeLeadPdf(req.file.buffer, req.file.originalname);

  if (leads.length === 0) {
    return res.status(422).json({
      success: false,
      message: warnings[0] ?? 'No leads could be extracted from this PDF.',
      fileName,
      parsedLeads: [],
      warnings,
    });
  }

  const storedByPhone = await indexStoredLeadsByPhone(leads);

  const parsedLeads = leads.map((lead) => ({
    id: `${lead.phoneNumber}-${lead.customerName}`.slice(0, 120),
    ...lead,
    isDuplicate: storedByPhone.has(digitsOnly(lead.phoneNumber)),
  }));

  return res.json({ success: true, fileName, parsedLeads, warnings });
});

/* --------------------------------------------------------- Bulk save (step 2) */

export const bulkSave = asyncHandler(async (req, res) => {
  const { fileName, leads } = req.body;

  const docs = leads.map((lead) => ({
    customerName: lead.customerName,
    phoneNumber: lead.phoneNumber,
    address: lead.address ?? '',
    businessNiche: lead.businessNiche,
    googleRating: lead.googleRating ?? '',
    websiteStatus: lead.websiteStatus || 'No website shown',
    sourcePdfName: fileName ?? '',
    status: 'New',
    assignedTo: null,
    assignedAt: null,
  }));

  const inserted = await Lead.insertMany(docs, { ordered: false }).catch((error) => {
    // Partial success is fine here: the admin already reviewed the preview.
    if (error?.writeErrors?.length) {
      const reasons = error.writeErrors.map((e) => e.err?.errmsg ?? e.message);
      console.warn('[leads] some rows were skipped:', reasons);
      return null;
    }
    throw error;
  });

  const saved = inserted ?? (await Lead.find({ sourcePdfName: fileName, phoneNumber: { $in: docs.map((d) => d.phoneNumber) } }).lean());

  res.status(201).json({
    success: true,
    message: `Imported ${saved.length} lead${saved.length === 1 ? '' : 's'} into the CRM.`,
    imported: saved.length,
    leads: saved,
  });
});

/* ------------------------------------------------------------------ Listing */

export const listLeads = asyncHandler(async (req, res) => {
  const { status, businessNiche, assignedTo, search, page, limit } = req.validatedQuery ?? req.query;

  const filter = {};

  // Members are hard-scoped to their own book of work.
  if (req.user.role === 'member') {
    filter.assignedTo = req.user._id;
  } else if (assignedTo !== undefined) {
    filter.assignedTo = assignedTo === 'null' ? null : assignedTo;
  }

  if (status) filter.status = status;
  if (businessNiche) filter.businessNiche = businessNiche;

  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ customerName: rx }, { phoneNumber: rx }, { address: rx }];
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .populate('assignedTo', 'name username isActive role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  res.json({
    success: true,
    leads: leads.map(withPaymentFields),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name username isActive role').lean();
  if (!lead) throw ApiError.notFound('That lead no longer exists.');

  if (req.user.role === 'member' && String(lead.assignedTo?._id ?? lead.assignedTo) !== String(req.user._id)) {
    throw ApiError.forbidden('This lead is not assigned to you.');
  }

  res.json({ success: true, lead: withPaymentFields(lead) });
});

/* -------------------------------------------------- Per-lead PDF download */

export const downloadLeadPdf = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id).populate('assignedTo', 'name username isActive role').lean();
  if (!lead) throw ApiError.notFound('That lead no longer exists.');

  if (req.user.role === 'member' && String(lead.assignedTo?._id ?? lead.assignedTo) !== String(req.user._id)) {
    throw ApiError.forbidden('This lead is not assigned to you.');
  }

  const { buffer, fileName } = await buildLeadPdf(withPaymentFields(lead));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.end(buffer);
});

/* ---------------------------------------------------------- Bulk assignment */

export const bulkAssign = asyncHandler(async (req, res) => {
  const { leadIds, memberId } = req.body;

  if (memberId) {
    const member = await User.findById(memberId);
    if (!member) throw ApiError.badRequest('That team member does not exist.');
    if (!member.isActive) throw ApiError.badRequest('That team member is deactivated. Reactivate them first.');
  }

  const now = new Date();
  const ids = { _id: { $in: leadIds } };

  if (memberId) {
    // `New` -> `Assigned` on first touch; anything further along keeps its status.
    await Lead.updateMany({ ...ids, status: 'New' }, { $set: { assignedTo: memberId, assignedAt: now, status: 'Assigned' } });
    await Lead.updateMany({ ...ids, status: { $ne: 'New' } }, { $set: { assignedTo: memberId, assignedAt: now } });
  } else {
    // Unassigning sends a still-`Assigned` lead back to the top of the funnel.
    await Lead.updateMany({ ...ids, status: 'Assigned' }, { $set: { assignedTo: null, assignedAt: null, status: 'New' } });
    await Lead.updateMany({ ...ids, status: { $ne: 'Assigned' } }, { $set: { assignedTo: null, assignedAt: null } });
  }

  const affected = await Lead.countDocuments({ _id: { $in: leadIds } });

  res.json({
    success: true,
    message: memberId ? `Assigned ${affected} lead${affected === 1 ? '' : 's'}.` : `Unassigned ${affected} lead${affected === 1 ? '' : 's'}.`,
    affected,
  });
});

/* ------------------------------------------ Assign a whole PDF to one member */

/**
 * One-shot hand-off used from a team member's profile: the admin uploads a
 * Claude lead-list PDF and every lead in it lands in that member's book.
 *
 * Leads already in the CRM (matched on phone number) are reassigned rather than
 * duplicated, so re-uploading the same PDF is safe and acts as a top-up.
 */
export const assignLeadsFromPdf = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Attach a PDF file before assigning.');

  const { memberId } = req.body;

  const member = await User.findById(memberId);
  if (!member) throw ApiError.badRequest('That team member does not exist.');
  if (!member.isActive) throw ApiError.badRequest(`${member.name} is deactivated. Reactivate them first.`);

  const { fileName, leads, warnings } = await parseClaudeLeadPdf(req.file.buffer, req.file.originalname);
  const rows = dedupeByPhone(leads);

  if (rows.length === 0) {
    throw ApiError.badRequest(warnings[0] ?? 'No leads could be extracted from this PDF.');
  }

  const now = new Date();
  const storedByPhone = await indexStoredLeadsByPhone(rows);

  // Split the PDF into leads we must create and leads we must hand over.
  const existingIds = [];
  const docs = [];

  for (const row of rows) {
    const stored = storedByPhone.get(digitsOnly(row.phoneNumber));

    if (stored) {
      existingIds.push(stored._id);
      continue;
    }

    docs.push({
      customerName: row.customerName,
      phoneNumber: row.phoneNumber,
      address: row.address ?? '',
      businessNiche: row.businessNiche,
      googleRating: row.googleRating ?? '',
      websiteStatus: row.websiteStatus || 'No website shown',
      sourcePdfName: fileName ?? '',
      status: 'Assigned',
      assignedTo: memberId,
      assignedAt: now,
    });
  }

  if (docs.length > 0) {
    // Partial success is fine: a schema clash on one row should not lose the rest.
    await Lead.insertMany(docs, { ordered: false }).catch((error) => {
      if (error?.writeErrors?.length) {
        console.warn('[leads] some PDF rows were skipped:', error.writeErrors.map((e) => e.err?.errmsg ?? e.message));
        return null;
      }
      throw error;
    });
  }

  if (existingIds.length > 0) {
    // Same funnel rule as bulkAssign: only `New` leads are promoted to `Assigned`.
    const ids = { _id: { $in: existingIds } };
    await Lead.updateMany({ ...ids, status: 'New' }, { $set: { assignedTo: memberId, assignedAt: now, status: 'Assigned' } });
    await Lead.updateMany({ ...ids, status: { $ne: 'New' } }, { $set: { assignedTo: memberId, assignedAt: now } });
  }

  // `createdAt >= now` counts only the rows this call inserted, since a handover
  // only ever moves existing leads between members.
  const created = docs.length
    ? await Lead.countDocuments({ phoneNumber: { $in: docs.map((d) => d.phoneNumber) }, createdAt: { $gte: now } })
    : 0;
  const reassigned = existingIds.length;
  const total = created + reassigned;

  res.status(201).json({
    success: true,
    message: `Assigned ${total} lead${total === 1 ? '' : 's'} to ${member.name} (${created} new, ${reassigned} reassigned).`,
    fileName,
    total,
    created,
    reassigned,
    warnings,
  });
});

/* ------------------------------------------------------------- Status/notes */

const assertCanEdit = (lead, user) => {
  if (user.role === 'admin') return;
  if (String(lead.assignedTo) !== String(user._id)) {
    throw ApiError.forbidden('This lead is not assigned to you.');
  }
};

export const updateStatus = asyncHandler(async (req, res) => {
  const { status, remark } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) throw ApiError.notFound('That lead no longer exists.');
  assertCanEdit(lead, req.user);

  lead.status = status;
  if (remark) {
    lead.remarks.push({
      text: remark,
      author: req.user._id,
      authorName: req.user.name,
      statusAtRemark: status,
      createdAt: new Date(),
    });
  }

  await lead.save();
  res.json({ success: true, lead });
});

export const addRemark = asyncHandler(async (req, res) => {
  const { text } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) throw ApiError.notFound('That lead no longer exists.');
  assertCanEdit(lead, req.user);

  lead.remarks.push({
    text,
    author: req.user._id,
    authorName: req.user.name,
    statusAtRemark: lead.status,
    createdAt: new Date(),
  });

  await lead.save();
  res.status(201).json({ success: true, lead });
});

export const deleteLead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.badRequest('Not a valid lead id.');

  const lead = await Lead.findByIdAndDelete(req.params.id);
  if (!lead) throw ApiError.notFound('That lead no longer exists.');

  res.json({ success: true, message: `Deleted ${lead.customerName}.` });
});

/* ----------------------------------------------------- Salesman money trail */

export const updatePayment = asyncHandler(async (req, res) => {
  const { advanceAmount, amountPaidToSalesman } = req.body;

  const lead = await Lead.findById(req.params.id);
  if (!lead) throw ApiError.notFound('That lead no longer exists.');

  lead.advanceAmount = advanceAmount;
  lead.amountPaidToSalesman = amountPaidToSalesman;

  await lead.save();
  res.json({ success: true, lead: withPaymentFields(lead) });
});

/* --------------------------------------------------------------- Analytics */

export const analytics = asyncHandler(async (req, res) => {
  const isMember = req.user.role === 'member';
  const scope = isMember ? { assignedTo: req.user._id } : {};

  const [total, byStatus, unassigned, converted, niches, recent] = await Promise.all([
    Lead.countDocuments(scope),
    Lead.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    isMember ? Promise.resolve(0) : Lead.countDocuments({ assignedTo: null }),
    Lead.aggregate([
      { $match: scope },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'member' } },
      { $unwind: '$member' },
      { $project: { _id: 0, name: '$member.name', username: '$member.username', count: 1 } },
    ]),
    Lead.distinct('businessNiche', isMember ? { assignedTo: req.user._id } : {}),
    Lead.find(scope).sort({ createdAt: -1 }).limit(5).select('customerName businessNiche status googleRating websiteStatus').lean(),
  ]);

  const statusCounts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) statusCounts[row._id] = row.count;

  const contacted = CONTACTED_STATUSES.reduce((sum, s) => sum + statusCounts[s], 0);

  res.json({
    success: true,
    scope: isMember ? 'member' : 'admin',
    stats: {
      totalLeads: total,
      assigned: total - (isMember ? 0 : unassigned),
      unassigned,
      contacted,
      converted: statusCounts.Converted,
      interested: statusCounts.Interested + statusCounts['Free Demo Sent'],
      conversionRate: total ? Math.round((statusCounts.Converted / total) * 100) : 0,
    },
    statusCounts,
    topPerformers: converted,
    recentLeads: recent,
    businessNiches: niches.filter(Boolean).sort((a, b) => a.localeCompare(b)),
  });
});
