import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Call,
  Calendar,
  Copy,
  DocumentText,
  Flash,
  InfoCircle,
  Location,
  MessageText1,
  Refresh,
  Send,
  Star1,
  Timer,
  Trash,
  Warning2,
} from 'iconsax-react';
import { toast } from 'sonner';

import api, { downloadFile, toMessage } from '@/lib/api';
import { copyToClipboard, formatCurrency, formatDateTime, initialsOf, parseAmountInput, relativeTime, telHref } from '@/lib/format';
import { LEAD_STATUSES, STATUS_VARIANTS, nicheVariant, parseRating } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input, Textarea } from '@/components/ui/input';import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const updateSchema = z.object({
  status: z.enum(LEAD_STATUSES, { errorMap: () => ({ message: 'Pick a status.' }) }),
  remark: z.string().trim().max(2000, 'Keep remarks under 2000 characters.').optional(),
});

export default function LeadDetailSheet({ lead, open, onOpenChange, onChanged, onDeleted }) {
  const { isAdmin, user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [quickRemark, setQuickRemark] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const isOwner = lead?.assignedTo?._id && lead.assignedTo._id === user.id;
  const canEdit = isAdmin || Boolean(isOwner);

  const rating = useMemo(() => parseRating(lead?.googleRating), [lead?.googleRating]);
  const pitch = useMemo(() => buildPitch(lead), [lead]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(updateSchema),
    defaultValues: { status: 'New', remark: '' },
  });

  const [status, remark] = watch(['status', 'remark']);

  // Re-seed the form whenever a different lead is opened.
  useEffect(() => {
    if (lead) reset({ status: lead.status ?? 'New', remark: '' });
  }, [lead, reset]);

  if (!lead) return null;

  const remarks = [...(lead.remarks ?? [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );

  const onStatusChange = async (values) => {
    setIsSaving(true);
    try {
      const { data } = await api.patch(`/leads/${lead._id}/status`, {
        status: values.status,
        ...(values.remark?.trim() ? { remark: values.remark.trim() } : {}),
      });
      toast.success(`Status updated to ${values.status}.`);
      reset({ status: values.status, remark: '' });
      onChanged?.(data.lead);
    } catch (error) {
      toast.error(toMessage(error, 'Could not update this lead.'));
    } finally {
      setIsSaving(false);
    }
  };

  const onAddRemark = async (event) => {
    event.preventDefault();
    const text = remark?.trim();
    if (!text) return;

    setIsSaving(true);
    try {
      const { data } = await api.post(`/leads/${lead._id}/remarks`, { text });
      toast.success('Remark added.');
      setQuickRemark('');
      reset({ status, remark: '' });
      onChanged?.(data.lead);
    } catch (error) {
      toast.error(toMessage(error, 'Could not save the remark.'));
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete ${lead.customerName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/leads/${lead._id}`);
      toast.success(`${lead.customerName} deleted.`);
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      toast.error(toMessage(error, 'Could not delete this lead.'));
    }
  };

  const onCopy = async (value, label = 'Copied') => {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(label);
    else toast.error('Clipboard is blocked by the browser.');
  };

  const onDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      await downloadFile(`/leads/${lead._id}/pdf`);
      toast.success('Lead PDF downloaded.');
    } catch (error) {
      toast.error(toMessage(error, 'Could not build the PDF.'));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANTS[lead.status] ?? 'muted'}>{lead.status}</Badge>
            <Badge variant={nicheVariant(lead.businessNiche)}>{lead.businessNiche}</Badge>
            {lead.sourcePdfName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="muted" className="nums max-w-[14rem] truncate">
                    {lead.sourcePdfName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Imported from this PDF</TooltipContent>
              </Tooltip>
            )}
          </div>
          <SheetTitle className="mt-1 text-lg">{lead.customerName}</SheetTitle>
          <SheetDescription>
            {lead.assignedTo?.name
              ? `Assigned to ${lead.assignedTo.name}`
              : 'Unassigned — pick up from the Leads table'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* ---------------------------------------------- pitch helper card */}
          <Card className="border-primary/25 bg-primary/[0.04]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
                <Flash className="h-4 w-4" />
                Cold outreach pitch helper
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {pitch.map((line) => (
                <div key={line.label} className="flex gap-2.5 text-xs">
                  <line.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div>
                    <p className="font-medium">{line.label}</p>
                    <p className="text-muted-foreground">{line.text}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* -------------------------------------------------- lead details */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lead details</h3>

            <DetailRow icon={Call} label="Phone">
              <a
                href={telHref(lead.phoneNumber)}
                className="nums font-medium text-primary underline-offset-2 hover:underline"
              >
                {lead.phoneNumber}
              </a>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => onCopy(lead.phoneNumber, 'Phone number copied.')}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy phone number</TooltipContent>
              </Tooltip>
            </DetailRow>

            <DetailRow icon={Star1} label="Google rating">
              {lead.googleRating ? (
                <span className="nums inline-flex items-center gap-1.5 text-amber-500">
                  <Star1 className="h-3.5 w-3.5" variant="fill" />
                  {lead.googleRating}
                  <span className="text-muted-foreground">({rating.reviews} reviews)</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Not captured</span>
              )}
            </DetailRow>

            <DetailRow icon={Location} label="Address">
              {lead.address ? (
                <span className="text-foreground">{lead.address}</span>
              ) : (
                <span className="text-muted-foreground">Not captured</span>
              )}
            </DetailRow>

            <DetailRow icon={InfoCircle} label="Website status">
              <span className="text-foreground">{lead.websiteStatus || 'No website shown'}</span>
            </DetailRow>

            <DetailRow icon={Calendar} label="Added">
              <span className="text-muted-foreground">{formatDateTime(lead.createdAt)}</span>
            </DetailRow>
          </div>

          <Separator />

          {/* ------------------------------------------- status + new remark */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Update status &amp; log the call
            </h3>

            {canEdit ? (
              <form onSubmit={handleSubmit(onStatusChange)} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="sheet-status">Status</Label>
                  <Select value={status} onValueChange={(value) => reset({ status: value, remark })}>
                    <SelectTrigger id="sheet-status">
                      <SelectValue placeholder="Pick a status" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sheet-remark">Remark (optional, saved with the status change)</Label>
                  <Textarea
                    id="sheet-remark"
                    rows={3}
                    placeholder="Objection, outcome, follow-up date…"
                    aria-invalid={Boolean(errors.remark)}
                    {...register('remark')}
                  />
                  {errors.remark && <p className="text-xs text-destructive">{errors.remark.message}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={isSaving}>
                  <Send className="h-4 w-4" />
                  {isSaving ? 'Saving…' : 'Save status & remark'}
                </Button>
              </form>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                <Warning2 className="mt-px h-4 w-4 shrink-0" />
                <span>This lead is not assigned to you, so it is read-only.</span>
              </div>
            )}

            {canEdit && (
              <form onSubmit={onAddRemark} className="space-y-1.5 border-t pt-3" noValidate>
                <Label htmlFor="sheet-quick-remark">Log a remark without changing the status</Label>
                <div className="flex gap-2">
                  <Input
                    id="sheet-quick-remark"
                    value={quickRemark}
                    onChange={(event) => setQuickRemark(event.target.value)}
                    placeholder="Tried twice, still no answer…"
                    maxLength={2000}
                  />
                  <Button type="submit" variant="secondary" disabled={isSaving || !quickRemark.trim()}>
                    Add
                  </Button>
                </div>
              </form>
            )}
          </div>

          <Separator />

          {/* -------------------------------------------- salesman payment */}
          <PaymentCard lead={lead} isAdmin={isAdmin} onChanged={onChanged} />

          <Separator />

          {/* ------------------------------------------------ remarks history */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Remarks timeline
              </h3>
              <Badge variant="muted" className="nums">
                <MessageText1 className="h-3 w-3" />
                {remarks.length}
              </Badge>
            </div>

            {remarks.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                No remarks yet. Log the first call outcome above.
              </p>
            ) : (
              <ol className="space-y-3">
                {remarks.map((remark) => (
                  <li key={remark._id} className="relative pl-7">
                    <span className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                      {initialsOf(remark.authorName)}
                    </span>
                    <span className="absolute left-[9.5px] top-6 h-[calc(100%+0.75rem)] w-px bg-border last:hidden" />
                    <div className="rounded-lg border bg-card px-3 py-2">
                      <p className="text-xs leading-relaxed">{remark.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">{remark.authorName}</span>
                        <span>·</span>
                        <span title={formatDateTime(remark.createdAt)}>{relativeTime(remark.createdAt)}</span>
                        {remark.statusAtRemark && (
                          <>
                            <span>·</span>
                            <Badge variant={STATUS_VARIANTS[remark.statusAtRemark] ?? 'muted'} className="text-[9px]">
                              {remark.statusAtRemark}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-5">
          <Button variant="outline" size="sm" onClick={onDownloadPdf} disabled={isDownloading}>
            {isDownloading ? <Refresh className="h-4 w-4 animate-spin" /> : <DocumentText className="h-4 w-4" />}
            {isDownloading ? 'Preparing…' : 'Download PDF'}
          </Button>

          {isAdmin && (
            <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash className="h-4 w-4" />
              Delete lead
            </Button>
          )}
        </div>      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</span>
    </div>
  );
}

/**
 * Advance vs money actually handed to the salesman. Only admins move the
 * numbers; members still see what is owed on their own leads.
 */
function PaymentCard({ lead, isAdmin, onChanged }) {
  const [advance, setAdvance] = useState('');
  const [paid, setPaid] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const isOpen = !lead.advanceAmount && !lead.amountPaidToSalesman;

  // Re-seed the inputs whenever a different lead is opened.
  useEffect(() => {
    setAdvance(lead.advanceAmount ? String(lead.advanceAmount) : '');
    setPaid(lead.amountPaidToSalesman ? String(lead.amountPaidToSalesman) : '');
    setError(null);
  }, [lead._id, lead.advanceAmount, lead.amountPaidToSalesman]);

  const onSave = async (event) => {
    event.preventDefault();

    const nextAdvance = parseAmountInput(advance);
    const nextPaid = parseAmountInput(paid);

    if (Number.isNaN(nextAdvance) || Number.isNaN(nextPaid)) {
      setError('Enter amounts as plain numbers, for example 25000 or 25,000.');
      return;
    }

    if (nextPaid > nextAdvance) {
      setError('Amount paid to the salesman cannot be more than the advance amount.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const { data } = await api.patch(`/leads/${lead._id}/payment`, {
        advanceAmount: nextAdvance,
        amountPaidToSalesman: nextPaid,
      });
      toast.success('Payment details saved.');
      onChanged?.(data.lead);
    } catch (saveError) {
      toast.error(toMessage(saveError, 'Could not save the payment details.'));
    } finally {
      setIsSaving(false);
    }
  };

  const remaining = Math.max(0, (lead.advanceAmount ?? 0) - (lead.amountPaidToSalesman ?? 0));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Salesman payment
        </h3>
        {!lead.advanceAmount && <Badge variant="muted">Not advanced</Badge>}
        {lead.advanceAmount > 0 &&
          (lead.isPaid ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Part paid</Badge>)}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MoneyStat label="Advance" value={formatCurrency(lead.advanceAmount)} />
        <MoneyStat label="Paid to salesman" value={formatCurrency(lead.amountPaidToSalesman)} />
        <MoneyStat
          label="Remaining"
          value={formatCurrency(remaining)}
          tone={lead.advanceAmount > 0 && remaining > 0 ? 'warning' : 'default'}
        />
      </div>

      {isAdmin ? (
        <form onSubmit={onSave} className="space-y-2" noValidate>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="sheet-advance" className="text-[11px]">
                Advance amount
              </Label>
              <Input
                id="sheet-advance"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 25000"
                value={advance}
                onChange={(event) => {
                  setAdvance(event.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error)}
                className="nums h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sheet-paid" className="text-[11px]">
                Amount paid to salesman
              </Label>
              <Input
                id="sheet-paid"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 10000"
                value={paid}
                onChange={(event) => {
                  setPaid(event.target.value);
                  setError(null);
                }}
                aria-invalid={Boolean(error)}
                className="nums h-9"
              />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" variant="secondary" size="sm" className="w-full" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save payment details'}
          </Button>
        </form>
      ) : (
        !isOpen && (
          <p className="text-[11px] text-muted-foreground">
            Only an admin can change the advance and the paid amount.
          </p>
        )
      )}
    </div>
  );
}

function MoneyStat({ label, value, tone = 'default' }) {
  return (
    <div className="rounded-md border bg-muted/40 px-2 py-1.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`nums truncate text-sm font-semibold ${tone === 'warning' ? 'text-amber-600' : ''}`}>{value}</p>
    </div>
  );
}

/** Turn the rating + website columns into an actual opening line. */
function buildPitch(lead) {
  const lines = [];
  const { score, reviews, isStrong } = parseRating(lead?.googleRating);

  if (score) {
    lines.push({
      icon: Star1,
      label: 'Rapport opener',
      text: isStrong
        ? `Mention their ${score} rating (${reviews} reviews) — “I saw you are sitting on a ${score} star rating with ${reviews} reviews, that is real trust in the neighbourhood.”`
        : `Mention their ${score} rating (${reviews} reviews) — acknowledge it, then focus on turning reviews into enquiry.`,
    });
  } else {
    lines.push({
      icon: Star1,
      label: 'Rapport opener',
      text: 'No rating was captured. Open with the business name and the local area instead.',
    });
  }

  const website = (lead?.websiteStatus ?? '').toLowerCase();
  if (website.includes('no website')) {
    lines.push({
      icon: Flash,
      label: 'Pitch angle — New Website',
      text: 'They have no website at all. Lead with a 5-page starter site at a fixed price and a 7-day turnaround.',
    });
  } else if (website.includes('instagram') || website.includes('youtube')) {
    lines.push({
      icon: Flash,
      label: 'Pitch angle — Social only',
      text: 'Their "website" is just a social profile. Pitch a real site that owns the Google search traffic their posts cannot capture.',
    });
  } else if (website.includes('unverified')) {
    lines.push({
      icon: Flash,
      label: 'Pitch angle — Unverified listing',
      text: 'The listing was cropped before the website column. Confirm the URL on the call before quoting anything.',
    });
  } else {
    lines.push({
      icon: Flash,
      label: 'Pitch angle — Audit first',
      text: 'They may already have a website. Ask for the URL, then pitch a free 5-point audit rather than a rebuild.',
    });
  }

  lines.push({
    icon: Timer,
    label: 'Ask before you sell',
    text: '“Are you taking orders through the phone number on Google, or do you want people to message you?”',
  });

  return lines;
}
