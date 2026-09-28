import { CONTACTED_STATUSES, LEAD_STATUSES } from '../constants.js';
import { Lead } from '../models/Lead.js';
import { User } from '../models/User.js';
import { ApiError, asyncHandler } from '../middlewares/error.js';
import { hashPassword } from './authController.js';

const emptyCounts = () => ({ totalAssigned: 0, contacted: 0, interested: 0, freeDemoSent: 0, converted: 0 });

/** Every status present so the member profile can render a full funnel. */
const blankStatusCounts = () => Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0]));

/**
 * Every team account (the admin plus all members) with their live lead workload,
 * plus headline counts for the roster header.
 */
export const listTeam = asyncHandler(async (req, res) => {
  const accounts = await User.find({ role: { $in: ['admin', 'member'] } }).sort({ createdAt: 1 }).lean();

  const [totals, statusStats] = await Promise.all([
    Lead.aggregate([{ $group: { _id: '$assignedTo', totalAssigned: { $sum: 1 } } }]),
    Lead.aggregate([{ $group: { _id: { member: '$assignedTo', status: '$status' }, count: { $sum: 1 } } }]),
  ]);

  const byMember = new Map();
  for (const row of totals) {
    if (!row._id) continue;
    byMember.set(String(row._id), { ...emptyCounts(), statusCounts: blankStatusCounts(), totalAssigned: row.totalAssigned });
  }
  for (const row of statusStats) {
    if (!row._id.member) continue;
    const entry = byMember.get(String(row._id.member)) ?? { ...emptyCounts(), statusCounts: blankStatusCounts() };
    const status = row._id.status;
    if (LEAD_STATUSES.includes(status)) entry.statusCounts[status] = row.count;
    if (status === 'Interested') entry.interested = row.count;
    else if (status === 'Free Demo Sent') entry.freeDemoSent = row.count;
    else if (status === 'Converted') entry.converted = row.count;
    if (CONTACTED_STATUSES.includes(status)) entry.contacted += row.count;
    byMember.set(String(row._id.member), entry);
  }

  const team = accounts.map((account) => {
    const counts = byMember.get(String(account._id)) ?? { ...emptyCounts(), statusCounts: blankStatusCounts() };
    return {
      id: account._id,
      name: account.name,
      username: account.username,
      role: account.role,
      isActive: account.isActive,
      createdAt: account.createdAt,
      ...counts,
      assignedCount: counts.totalAssigned,
      conversionRate: counts.totalAssigned ? Math.round((counts.converted / counts.totalAssigned) * 100) : 0,
    };
  });

  const [totalLeads, assigned, unassigned, converted] = await Promise.all([
    Lead.countDocuments({}),
    Lead.countDocuments({ assignedTo: { $ne: null } }),
    Lead.countDocuments({ assignedTo: null }),
    Lead.countDocuments({ status: 'Converted' }),
  ]);

  res.json({
    success: true,
    team,
    counts: {
      members: team.filter((person) => person.role === 'member').length,
      admins: team.filter((person) => person.role === 'admin').length,
      totalLeads,
      assigned,
      unassigned,
      converted,
    },
  });
});

export const createMember = asyncHandler(async (req, res) => {
  const { name, username, password, role } = req.body;

  const existing = await User.findOne({ username });
  if (existing) throw ApiError.conflict('That username is already taken.');

  const member = await User.create({
    name,
    username,
    passwordHash: await hashPassword(password),
    role,
    isActive: true,
  });

  res.status(201).json({ success: true, message: `${member.name} can now sign in.`, user: member.toSafeJSON() });
});

export const toggleMember = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id);
  if (!member) throw ApiError.notFound('That team member does not exist.');
  if (member.role === 'admin') throw ApiError.badRequest('The admin account cannot be deactivated.');
  if (String(member._id) === String(req.user._id)) throw ApiError.badRequest('You cannot deactivate your own account.');

  member.isActive = !member.isActive;
  await member.save();

  res.json({
    success: true,
    message: member.isActive ? `${member.name} is active again.` : `${member.name} has been deactivated.`,
    user: member.toSafeJSON(),
  });
});

export const resetMemberPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  const member = await User.findById(req.params.id).select('+passwordHash');
  if (!member) throw ApiError.notFound('That team member does not exist.');

  member.passwordHash = await hashPassword(password);
  await member.save();

  res.json({ success: true, message: `Password updated for ${member.name}.` });
});
