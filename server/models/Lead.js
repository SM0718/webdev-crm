import mongoose from 'mongoose';

import { DEFAULT_WEBSITE_STATUS, LEAD_STATUSES } from '../constants.js';
import { paymentBreakdown } from '../utils/leadMoney.js';

const remarkSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Remark text is required'],
      trim: true,
      maxlength: [2000, 'Remark cannot exceed 2000 characters'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    statusAtRemark: {
      type: String,
      enum: LEAD_STATUSES,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const leadSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [160, 'Customer name cannot exceed 160 characters'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
      maxlength: [32, 'Phone number cannot exceed 32 characters'],
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    businessNiche: {
      type: String,
      required: [true, 'Business niche is required'],
      trim: true,
      index: true,
      maxlength: [80, 'Business niche cannot exceed 80 characters'],
    },
    googleRating: {
      type: String,
      trim: true,
      default: '',
    },
    websiteStatus: {
      type: String,
      trim: true,
      default: DEFAULT_WEBSITE_STATUS,
    },
    status: {
      type: String,
      enum: {
        values: LEAD_STATUSES,
        message: 'Unknown lead status',
      },
      default: 'New',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    remarks: {
      type: [remarkSchema],
      default: [],
    },
    sourcePdfName: {
      type: String,
      trim: true,
      default: '',
    },

    // Salesman money trail: what we advanced, what he has been given so far.
    advanceAmount: {
      type: Number,
      default: 0,
      min: [0, 'Advance amount cannot be negative'],
      max: [10000000, 'Advance amount looks too large'],
    },
    amountPaidToSalesman: {
      type: Number,
      default: 0,
      min: [0, 'Amount paid to salesman cannot be negative'],
      max: [10000000, 'Amount paid to salesman looks too large'],
    },
  },
  {
    timestamps: true,
  },
);

// What is still owed to the salesman, never stored so it can never drift.
leadSchema.virtual('amountRemaining').get(function amountRemaining() {
  return paymentBreakdown(this).amountRemaining;
});

// `true` only once a real advance is fully settled.
leadSchema.virtual('isPaid').get(function isPaid() {
  return paymentBreakdown(this).isPaid;
});

leadSchema.set('toJSON', { virtuals: true });
leadSchema.set('toObject', { virtuals: true });

// Admin search box hits name / phone / address.
leadSchema.index({ customerName: 'text', phoneNumber: 'text', address: 'text' });
// Common dashboard + filter combinations.
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ businessNiche: 1, status: 1 });

export const Lead = mongoose.models.Lead ?? mongoose.model('Lead', leadSchema);
export default Lead;
