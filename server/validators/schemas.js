import { z } from 'zod';

import { LEAD_STATUSES, USER_ROLES } from '../constants.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Not a valid id');

/* ------------------------------------------------------------------- auth */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/* ------------------------------------------------------------------ leads */

const leadRowSchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required').max(160),
  phoneNumber: z.string().trim().min(1, 'Phone number is required').max(32),
  address: z.string().trim().max(400).default(''),
  businessNiche: z.string().trim().min(1, 'Business niche is required').max(80),
  googleRating: z.string().trim().max(40).default(''),
  websiteStatus: z.string().trim().max(120).default('No website shown'),
});

export const bulkSaveSchema = z.object({
  fileName: z.string().trim().max(200).optional(),
  leads: z.array(leadRowSchema).min(1, 'Select at least one lead to import.').max(500, 'Import at most 500 leads at a time.'),
});

export const listLeadsQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  businessNiche: z.string().trim().min(1).max(80).optional(),
  assignedTo: z
    .string()
    .trim()
    .transform((v) => (v === 'unassigned' ? 'null' : v))
    .pipe(z.union([objectId, z.literal('null')]))
    .optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const bulkAssignSchema = z.object({
  leadIds: z.array(objectId).min(1, 'Select at least one lead.').max(500),
  memberId: objectId.nullable(),
});

/** `memberId` arrives as a multipart text field next to the uploaded PDF. */
export const assignPdfSchema = z.object({
  memberId: objectId,
});

export const updateStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES, { errorMap: () => ({ message: 'Pick a valid status.' }) }),
  remark: z.string().trim().max(2000).optional(),
});

export const addRemarkSchema = z.object({
  text: z.string().trim().min(1, 'Write a remark before saving.').max(2000),
});

const amount = z.coerce
  .number()
  .min(0, 'Amount cannot be negative')
  .max(10000000, 'Amount looks too large')
  .refine((n) => Number.isFinite(n), 'Enter a valid number');

export const updatePaymentSchema = z
  .object({
    advanceAmount: amount,
    amountPaidToSalesman: amount,
  })
  .refine((data) => data.amountPaidToSalesman <= data.advanceAmount, {
    message: 'Amount paid to the salesman cannot be more than the advance amount.',
    path: ['amountPaidToSalesman'],
  });

/* ------------------------------------------------------------------- team */

export const createMemberSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(USER_ROLES).default('member'),
});

export const idParamSchema = z.object({ id: objectId });

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
