import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Call,
  Copy,
  DocumentText,
  DocumentUpload,
  Filter,
  Location,
  MessageText1,
  Profile2User,
  Refresh,
  SearchNormal1,
  Star1,
  TickCircle,
  UserTag,
  CloseSquare,
} from 'iconsax-react';
import { toast } from 'sonner';

import api, { downloadFile, toMessage } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { usePageSize, PAGE_SIZE_OPTIONS } from '@/hooks/usePageSize';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard, formatCurrency, initialsOf, relativeTime, telHref, truncate } from '@/lib/format';
import { LEAD_STATUSES, STATUS_VARIANTS, nicheVariant, parseRating } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import PdfUploadDialog from '@/components/PdfUploadDialog';
import LeadDetailSheet from '@/components/LeadDetailSheet';

const ANY = '__any__';
const UNASSIGNED = '__unassigned__';

export default function LeadsPage() {
  const { isAdmin, user } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ANY);
  const [niche, setNiche] = useState(ANY);
  const [assignee, setAssignee] = useState(ANY);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assignTo, setAssignTo] = useState(ANY);
  const [isAssigning, setIsAssigning] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize();

  const debouncedSearch = useDebounced(search);

  const { data: analytics } = useApi(() => api.get('/leads/analytics'), []);
  const { data: teamData } = useApi(() => api.get('/team'), [], { immediate: isAdmin });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (status !== ANY) params.set('status', status);
    if (niche !== ANY) params.set('businessNiche', niche);
    // The API understands `unassigned` for leads nobody owns.
    if (isAdmin && assignee === UNASSIGNED) params.set('assignedTo', 'unassigned');
    else if (isAdmin && assignee !== ANY) params.set('assignedTo', assignee);
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    return params.toString();
  }, [debouncedSearch, status, niche, assignee, isAdmin, page, pageSize]);

  const { data, isLoading, isRefreshing, reload } = useApi(
    () => api.get(`/leads?${query}`),
    [query],
  );

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const niches = useMemo(() => analytics?.businessNiches ?? [], [analytics]);
  const team = useMemo(() => teamData?.team ?? [], [teamData]);
  const totalLeads = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));

  /**
   * Every filter and page-size change goes through here so the page number is
   * reset in the same update. Resetting it from an effect instead would change
   * the filter and the page in two steps, firing a request for the old page
   * number first and briefly showing the wrong rows.
   */
  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  // Dropping rows can leave us past the end; step back to a page that exists.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Drop selections that are no longer on screen (filtered out or deleted).
  useEffect(() => {
    setSelectedIds((current) => {
      const visible = new Set(leads.map((lead) => lead._id));
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [leads]);

  const visibleIds = useMemo(() => leads.map((lead) => lead._id), [leads]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = (checked) => setSelectedIds(checked ? visibleIds : []);
  const toggleOne = (id, checked) =>
    setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((x) => x !== id)));

  const resetFilters = () => {
    setSearch('');
    setStatus(ANY);
    setNiche(ANY);
    setAssignee(ANY);
    setPage(1);
  };

  const hasFilters = Boolean(search.trim()) || status !== ANY || niche !== ANY || (isAdmin && assignee !== ANY);

  const onBulkAssign = useCallback(async () => {
    if (assignTo === ANY || selectedIds.length === 0) return;

    setIsAssigning(true);
    try {
      const { data: result } = await api.patch('/leads/bulk-assign', {
        leadIds: selectedIds,
        memberId: assignTo === UNASSIGNED ? null : assignTo,
      });
      toast.success(result.message);
      setSelectedIds([]);
      setAssignTo(ANY);
      reload({ silent: true });
    } catch (error) {
      toast.error(toMessage(error, 'Could not assign those leads.'));
    } finally {
      setIsAssigning(false);
    }
  }, [assignTo, selectedIds, reload]);

  const patchLeadInPlace = (updated) => {
    setActiveLead(updated);
    reload({ silent: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        isAdmin={isAdmin}
        onUpload={() => setUploadOpen(true)}
        isRefreshing={isRefreshing}
        onRefresh={() => reload({ silent: true })}
        total={data?.pagination?.total ?? 0}
      />

      {/* ------------------------------------------------------ filter bar */}
      <div className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <SearchNormal1 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => applyFilter(setSearch)(event.target.value)}
              placeholder="Search name, phone or address…"
              className="pl-8"
              aria-label="Search leads"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => applyFilter(setSearch)('')}
                aria-label="Clear search"
              >
                <CloseSquare className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <FilterSelect
            icon={Filter}
            value={status}
            onChange={applyFilter(setStatus)}
            placeholder="All statuses"
            ariaLabel="Filter by status"
            options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
          />

          <FilterSelect
            icon={Briefcase}
            value={niche}
            onChange={applyFilter(setNiche)}
            placeholder={niches.length ? 'All niches' : 'All niches'}
            ariaLabel="Filter by business niche"
            options={niches.map((n) => ({ value: n, label: n }))}
          />

          {isAdmin && (
            <FilterSelect
              icon={UserTag}
              value={assignee}
              onChange={applyFilter(setAssignee)}
              placeholder="Anyone"
              ariaLabel="Filter by assigned member"
              options={[
                { value: UNASSIGNED, label: 'Unassigned' },
                { value: user.id, label: 'Assigned to me' },
                ...team
                  .filter((member) => member.role === 'member' && member.id !== user.id)
                  .map((member) => ({ value: member.id, label: member.name })),
              ]}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={status} onValueChange={applyFilter(setStatus)}>
            <TabsList>
              <TabsTrigger value={ANY}>All</TabsTrigger>
              {LEAD_STATUSES.slice(0, 5).map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-7" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- table */}
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-card shadow-sm transition-opacity',
          (isLoading || isRefreshing) && leads.length > 0 && 'opacity-60',
        )}
        aria-busy={isLoading || isRefreshing}
      >
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(value) => toggleAll(value === true)}
                      aria-label="Select all visible leads"
                    />
                  </TableHead>
                )}
                <TableHead className="min-w-[15rem]">Business / Customer</TableHead>
                <TableHead className="min-w-[8rem]">Niche</TableHead>
                <TableHead className="min-w-[7.5rem]">Rating</TableHead>
                <TableHead className="min-w-[9rem]">Phone</TableHead>
                <TableHead className="min-w-[14rem]">Address</TableHead>
                <TableHead className="min-w-[10rem]">Assigned To</TableHead>
                <TableHead className="min-w-[11rem]">Status</TableHead>
                <TableHead className="min-w-[11rem]">Remarks</TableHead>
                <TableHead className="min-w-[7.5rem] text-right">Advance</TableHead>
                <TableHead className="min-w-[8.5rem] text-right">Paid to salesman</TableHead>
                <TableHead className="min-w-[8.5rem] text-right">Remaining</TableHead>
                <TableHead className="min-w-[6rem]">Paid</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading && leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 14 : 13} className="py-14 text-center text-sm text-muted-foreground">
                    Loading leads…
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 14 : 13} className="py-14 text-center">
                    <EmptyState hasFilters={hasFilters} isAdmin={isAdmin} onUpload={() => setUploadOpen(true)} onReset={resetFilters} />
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <LeadRow
                    key={lead._id}
                    lead={lead}
                    isAdmin={isAdmin}
                    isSelected={selectedIds.includes(lead._id)}
                    onToggle={toggleOne}
                    onOpen={() => setActiveLead(lead)}
                    onQuickStatus={async (next) => {
                      try {
                        await api.patch(`/leads/${lead._id}/status`, { status: next });
                        toast.success(`${lead.customerName} → ${next}`);
                        reload({ silent: true });
                      } catch (error) {
                        toast.error(toMessage(error, 'Could not change the status.'));
                      }
                    }}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {totalLeads > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={totalLeads}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            itemNoun="leads"
          />
        )}
      </div>

      {/* ------------------------------------------------ floating bulk bar */}
      {isAdmin && selectedIds.length > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto w-full max-w-fit animate-fade-in">
          <div className="flex flex-wrap items-center gap-3 rounded-full border bg-card/95 px-4 py-2.5 shadow-xl backdrop-blur">
            <Badge variant="default" className="nums">
              {selectedIds.length} selected
            </Badge>

            <div className="w-48">
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger className="h-8 rounded-full text-xs" aria-label="Choose a team member">
                  <Profile2User className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassign</SelectItem>
                  {team
                    .filter((member) => member.role === 'member' && member.isActive)
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" className="rounded-full" onClick={onBulkAssign} disabled={assignTo === ANY || isAssigning}>
              {isAssigning ? 'Assigning…' : 'Assign Leads'}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSelectedIds([])}
              aria-label="Clear selection"
            >
              <CloseSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <PdfUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onImported={() => reload({ silent: true })}
      />

      <LeadDetailSheet
        lead={activeLead}
        open={Boolean(activeLead)}
        onOpenChange={(next) => !next && setActiveLead(null)}
        onChanged={patchLeadInPlace}
        onDeleted={() => reload({ silent: true })}
      />
    </div>
  );
}

/* ------------------------------------------------------------- sub-parts */

function PageHeader({ isAdmin, onUpload, onRefresh, isRefreshing, total }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isAdmin
            ? 'Every scraped business. Filter, assign in bulk and track outreach.'
            : 'Your assigned book of work. Use the rating and website status as your opener.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="nums hidden text-xs text-muted-foreground sm:inline">{total} in CRM</span>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <Refresh className="h-4 w-4" />
          Refresh
        </Button>
        {isAdmin && (
          <Button size="sm" onClick={onUpload}>
            <DocumentUpload className="h-4 w-4" />
            Upload Claude PDF
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ icon: Icon, value, onChange, options, placeholder, ariaLabel }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel}>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeadRow({ lead, isAdmin, isSelected, onToggle, onOpen, onQuickStatus }) {
  const rating = parseRating(lead.googleRating);
  const latestRemark = lead.remarks?.length ? [...lead.remarks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] : null;

  const onCopy = async (event) => {
    event.stopPropagation();
    const ok = await copyToClipboard(lead.phoneNumber);
    if (ok) toast.success('Phone number copied.');
    else toast.error('Clipboard is blocked by the browser.');
  };

  return (
    <TableRow className={isSelected ? 'bg-primary/[0.05]' : undefined}>
      {isAdmin && (
        <TableCell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(value) => onToggle(lead._id, value === true)}
            aria-label={`Select ${lead.customerName}`}
          />
        </TableCell>
      )}

      <TableCell>
        <button type="button" onClick={onOpen} className="group block max-w-full text-left">
          <span className="block truncate font-medium leading-tight group-hover:text-primary">
            {lead.customerName}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {lead.websiteStatus}
          </span>
        </button>
      </TableCell>

      <TableCell>
        <Badge variant={nicheVariant(lead.businessNiche)}>{lead.businessNiche}</Badge>
      </TableCell>

      <TableCell>
        {rating.score ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="nums inline-flex items-center gap-1 whitespace-nowrap text-amber-500">
                <Star1 className="h-3.5 w-3.5" variant="fill" />
                {lead.googleRating}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {rating.reviews} Google reviews{rating.isStrong ? ' · strong social proof' : ''}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1">
          <a
            href={telHref(lead.phoneNumber)}
            onClick={(event) => event.stopPropagation()}
            className="nums inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"
            title="Open the dialler"
          >
            <Call className="h-3.5 w-3.5" />
            {lead.phoneNumber}
          </a>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCopy}
                aria-label={`Copy ${lead.phoneNumber}`}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy number</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>

      <TableCell>
        {lead.address ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex max-w-[22rem] items-start gap-1.5 text-xs text-muted-foreground">
                <Location className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{truncate(lead.address, 60)}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{lead.address}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell>
        {lead.assignedTo ? (
          <span className="flex items-center gap-1.5">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[9px]">{initialsOf(lead.assignedTo.name)}</AvatarFallback>
            </Avatar>
            <span className="max-w-[7rem] truncate text-xs">{lead.assignedTo.name}</span>
          </span>
        ) : (
          <Badge variant="muted">Unassigned</Badge>
        )}
      </TableCell>

      <TableCell>
        <Select value={lead.status} onValueChange={onQuickStatus}>
          <SelectTrigger
            className="h-7 w-full min-w-[8.5rem] rounded-full border-transparent px-2.5 text-[11px] shadow-none"
            aria-label={`Status for ${lead.customerName}`}
          >
            <span className={`inline-flex items-center gap-1.5`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                <span className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[option]} className="h-1.5 w-1.5 rounded-full p-0" />
                  {option}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell>
        {lead.remarks?.length ? (
          <button
            type="button"
            onClick={onOpen}
            className="group flex w-full max-w-[13rem] items-center gap-1.5 text-left"
          >
            <Badge variant="secondary" className="nums shrink-0">
              <MessageText1 className="h-3 w-3" />
              {lead.remarks.length}
            </Badge>
            <span className="truncate text-[11px] text-muted-foreground group-hover:text-foreground">
              {latestRemark.text}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="text-[11px] text-muted-foreground/70 underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Add remark · {relativeTime(lead.createdAt)}
          </button>
        )}
      </TableCell>

      <TableCell className="nums whitespace-nowrap text-right text-xs font-medium">
        {formatCurrency(lead.advanceAmount)}
      </TableCell>

      <TableCell className="nums whitespace-nowrap text-right text-xs text-muted-foreground">
        {formatCurrency(lead.amountPaidToSalesman)}
      </TableCell>

      <TableCell
        className={`nums whitespace-nowrap text-right text-xs font-medium ${
          lead.advanceAmount > 0 && lead.amountRemaining > 0 ? 'text-amber-600' : ''
        }`}
      >
        {formatCurrency(lead.amountRemaining)}
      </TableCell>

      <TableCell>
        <PaidBadge lead={lead} />
      </TableCell>

      <TableCell>
        <DownloadLeadPdfButton lead={lead} />
      </TableCell>
    </TableRow>
  );
}

/** Nothing advanced yet reads as "not applicable", a partly paid lead as "Part paid". */
function PaidBadge({ lead }) {
  if (!lead.advanceAmount) {
    return <span className="text-[11px] text-muted-foreground/70">—</span>;
  }

  if (lead.isPaid) {
    return (
      <Badge variant="success" className="gap-1">
        <TickCircle className="h-3 w-3" />
        Paid
      </Badge>
    );
  }

  if (lead.amountPaidToSalesman > 0) {
    return <Badge variant="warning">Part paid</Badge>;
  }

  return <Badge variant="muted">Unpaid</Badge>;
}

/** Per-row PDF export. Stops the click so it does not open the detail sheet. */
function DownloadLeadPdfButton({ lead }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const onDownload = async (event) => {
    event.stopPropagation();
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDownload}
          disabled={isDownloading}
          aria-label={`Download PDF for ${lead.customerName}`}
        >
          {isDownloading ? <Refresh className="h-3.5 w-3.5 animate-spin" /> : <DocumentText className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Download lead details as PDF</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({ hasFilters, isAdmin, onUpload, onReset }) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Filter className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No leads match these filters.</p>
        <Button variant="outline" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <DocumentUpload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {isAdmin ? 'No leads yet — upload your first Claude lead list PDF.' : 'Nothing has been assigned to you yet.'}
      </p>
      {isAdmin && (
        <Button size="sm" onClick={onUpload}>
          <DocumentUpload className="h-4 w-4" />
          Upload Claude PDF
        </Button>
      )}
    </div>
  );
}
