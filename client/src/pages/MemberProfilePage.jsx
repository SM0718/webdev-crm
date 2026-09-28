import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Call,
  Copy,
  DocumentText,
  DocumentUpload,
  Filter,
  Location,
  MessageText1,
  Refresh,
  Star1,
  TickCircle,
  UserOctagon,
  UserTick,
} from 'iconsax-react';
import { toast } from 'sonner';

import api, { downloadFile, toMessage } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { useDebounced } from '@/hooks/useDebounced';
import { usePageSize, PAGE_SIZE_OPTIONS } from '@/hooks/usePageSize';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard, formatCurrency, initialsOf, relativeTime, telHref, truncate } from '@/lib/format';
import { LEAD_STATUSES, nicheVariant, parseRating } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AssignLeadsDialog from '@/components/AssignLeadsDialog';
import LeadDetailSheet from '@/components/LeadDetailSheet';

export default function MemberProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [assignOpen, setAssignOpen] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('__any__');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize();

  const { data: teamData, isLoading: isLoadingTeam, reload: reloadTeam } = useApi(() => api.get('/team'), []);

  const member = useMemo(
    () => teamData?.team?.find((person) => String(person.id) === String(id)) ?? null,
    [teamData, id],
  );

  const debouncedSearch = useDebounced(search);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('assignedTo', id);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (status !== '__any__') params.set('status', status);
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    return params.toString();
  }, [id, debouncedSearch, status, page, pageSize]);

  const { data, isLoading, isRefreshing, reload } = useApi(
    () => api.get(`/leads?${query}`),
    [query],
  );

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const totalLeads = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));

  /**
   * Filters reset the page number in the same update, so a single request is
   * made instead of one for the old page followed by another for page 1.
   */
  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const refreshAll = () => {
    reload({ silent: true });
    reloadTeam({ silent: true });
  };

  const onToggleActive = async () => {
    try {
      const { data: result } = await api.patch(`/team/${member.id}/toggle`);
      toast.success(result.message);
      reloadTeam({ silent: true });
    } catch (error) {
      toast.error(toMessage(error, 'Could not change that account.'));
    }
  };

  if (isLoadingTeam) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/team')}>
          <ArrowLeft className="h-4 w-4" />
          Back to team
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <UserOctagon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">That team member no longer exists.</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/team')}>
              Back to team
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusCounts = member.statusCounts ?? {};
  const canToggle = member.role !== 'admin' && member.id !== user.id;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/team')}>
        <ArrowLeft className="h-4 w-4" />
        Team
      </Button>

      {/* ---------------------------------------------------------- identity */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-5 p-5">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{initialsOf(member.name)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{member.name}</h1>
              <Badge variant={member.role === 'admin' ? 'default' : 'muted'} className="capitalize">
                {member.role}
              </Badge>
              {member.isActive ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="destructive">Deactivated</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{member.email}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Joined {relativeTime(member.createdAt)} · {member.conversionRate}% conversion
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing || isLoading}>
              <Refresh className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
            {canToggle && (
              <Button variant="ghost" size="sm" onClick={onToggleActive} className="text-xs">
                <Refresh className="h-3.5 w-3.5" />
                {member.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <DocumentUpload className="h-4 w-4" />
              Assign Leads
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------- stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserTick} label="Assigned leads" value={member.assignedCount ?? 0} hint="In this member's book" />
        <StatCard icon={Call} label="Contacted" value={member.contacted ?? 0} hint="Statuses past first touch" />
        <StatCard icon={TickCircle} label="Converted" value={member.converted ?? 0} hint="Deals actually closed" />
        <StatCard
          icon={Briefcase}
          label="Interested"
          value={(member.interested ?? 0) + (member.freeDemoSent ?? 0)}
          hint="Warm, demo requested or sent"
        />
      </div>

      {/* ---------------------------------------------------- funnel summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Where this member's leads currently sit in the funnel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_STATUSES.map((option) => {
              const count = statusCounts[option] ?? 0;
              return (
                <span
                  key={option}
                  className={[
                    'nums inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                    count > 0 ? 'bg-card font-medium' : 'bg-muted/40 text-muted-foreground',
                  ].join(' ')}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor(option) }} />
                  {option}
                  <span className="nums text-muted-foreground">{count}</span>
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------- leads + filters */}
      <div className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            value={search}
            onChange={(event) => applyFilter(setSearch)(event.target.value)}
            placeholder="Search this member's leads…"
            aria-label="Search this member's leads"
          />
          <Select value={status} onValueChange={applyFilter(setStatus)}>
            <SelectTrigger aria-label="Filter by status">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All statuses</SelectItem>
              {LEAD_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => setAssignOpen(true)} className="h-7">
            <DocumentUpload className="h-3.5 w-3.5" />
            Assign more from a PDF
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------- table */}
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
                <TableHead className="min-w-[15rem]">Business / Customer</TableHead>
                <TableHead className="min-w-[8rem]">Niche</TableHead>
                <TableHead className="min-w-[7.5rem]">Rating</TableHead>
                <TableHead className="min-w-[9rem]">Phone</TableHead>
                <TableHead className="min-w-[14rem]">Address</TableHead>
                <TableHead className="min-w-[11rem]">Status</TableHead>
                <TableHead className="min-w-[11rem]">Remarks</TableHead>
                <TableHead className="min-w-[8.5rem] text-right">Remaining</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading && leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-14 text-center text-sm text-muted-foreground">
                    Loading leads…
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-14 text-center">
                    <EmptyState
                      hasLeads={member.totalAssigned > 0}
                      memberName={member.name}
                      onUpload={() => setAssignOpen(true)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <MemberLeadRow
                    key={lead._id}
                    lead={lead}
                    onOpen={() => setActiveLead(lead)}
                    onChanged={refreshAll}
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

      <AssignLeadsDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        member={member}
        onAssigned={refreshAll}
      />

      <LeadDetailSheet
        lead={activeLead}
        open={Boolean(activeLead)}
        onOpenChange={(next) => !next && setActiveLead(null)}
        onChanged={(updated) => {
          setActiveLead(updated);
          refreshAll();
        }}
        onDeleted={refreshAll}
      />
    </div>
  );
}

/* ------------------------------------------------------------- sub-parts */

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="nums mt-1.5 text-2xl font-semibold tracking-tight">{value ?? 0}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Inline colour for the funnel dots, kept out of the Tailwind class string. */
const DOT_COLORS = {
  New: 'var(--color-muted-foreground)',
  Assigned: '#3b82f6',
  Contacted: '#0ea5e9',
  'Called - No Answer': '#f59e0b',
  Interested: '#8b5cf6',
  'Free Demo Sent': '#a855f7',
  'Follow-Up': '#f97316',
  Converted: '#22c55e',
  'Not Interested': '#ef4444',
  'Invalid Number': '#dc2626',
};

const dotColor = (status) => DOT_COLORS[status] ?? 'var(--color-muted-foreground)';

function MemberLeadRow({ lead, onOpen, onChanged }) {
  const rating = parseRating(lead.googleRating);
  const latestRemark = lead.remarks?.length
    ? [...lead.remarks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    : null;

  const onCopy = async (event) => {
    event.stopPropagation();
    const ok = await copyToClipboard(lead.phoneNumber);
    if (ok) toast.success('Phone number copied.');
    else toast.error('Clipboard is blocked by the browser.');
  };

  const onQuickStatus = async (next) => {
    try {
      await api.patch(`/leads/${lead._id}/status`, { status: next });
      toast.success(`${lead.customerName} → ${next}`);
      onChanged();
    } catch (error) {
      toast.error(toMessage(error, 'Could not change the status.'));
    }
  };

  return (
    <TableRow>
      <TableCell>
        <button type="button" onClick={onOpen} className="group block max-w-full text-left">
          <span className="block truncate font-medium leading-tight group-hover:text-primary">
            {lead.customerName}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{lead.websiteStatus}</span>
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
              <Button variant="ghost" size="icon-sm" onClick={onCopy} aria-label={`Copy ${lead.phoneNumber}`}>
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
        <Select value={lead.status} onValueChange={onQuickStatus}>
          <SelectTrigger
            className="h-7 w-full min-w-[8.5rem] rounded-full border-transparent px-2.5 text-[11px] shadow-none"
            aria-label={`Status for ${lead.customerName}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor(lead.status) }} />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor(option) }} />
                  {option}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell>
        {latestRemark ? (
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

      <TableCell
        className={`nums whitespace-nowrap text-right text-xs font-medium ${
          lead.advanceAmount > 0 && lead.amountRemaining > 0 ? 'text-amber-600' : ''
        }`}
      >
        {formatCurrency(lead.amountRemaining)}
      </TableCell>

      <TableCell>
        <DownloadLeadPdfButton lead={lead} />
      </TableCell>
    </TableRow>
  );
}

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

function EmptyState({ hasLeads, memberName, onUpload }) {
  if (hasLeads) {
    return <p className="text-sm text-muted-foreground">No leads match these filters.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <DocumentUpload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {memberName} has no leads yet. Upload a lead list PDF to fill their book of work.
      </p>
      <Button size="sm" onClick={onUpload}>
        <ArrowRight className="h-4 w-4" />
        Assign Leads
      </Button>
    </div>
  );
}
