/**
 * Salesman money trail helpers.
 *
 * `amountRemaining` and `isPaid` are never stored: they are derived from
 * `advanceAmount` and `amountPaidToSalesman` so the numbers can never drift
 * apart. Both mongoose documents (via the Lead virtuals) and `.lean()` query
 * results go through here so the two always agree.
 */

const toAmount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export const paymentBreakdown = (lead = {}) => {
  const advanceAmount = toAmount(lead.advanceAmount);
  const amountPaidToSalesman = toAmount(lead.amountPaidToSalesman);

  // An overpayment is clamped, never surfaced as a negative owed amount.
  const amountRemaining = Math.max(0, Math.round((advanceAmount - amountPaidToSalesman) * 100) / 100);

  return {
    advanceAmount,
    amountPaidToSalesman,
    amountRemaining,
    isPaid: advanceAmount > 0 && amountRemaining === 0,
  };
};

/** Adds the derived payment fields to a plain object (lean result, mock, ...). */
export const withPaymentFields = (lead) => {
  if (!lead) return lead;
  const plain = typeof lead.toObject === 'function' ? lead.toObject({ virtuals: true }) : lead;
  return { ...plain, ...paymentBreakdown(plain) };
};
