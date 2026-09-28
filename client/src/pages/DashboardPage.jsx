import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CallCalling,
  DocumentText,
  Grid1,
  Profile2User,
  Star1,
  Timer,
  Verify,
  Warning2,
} from 'iconsax-react';

import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { relativeTime, truncate } from '@/lib/format';
import { LEAD_STATUSES, STATUS_VARIANTS, nicheVariant, parseRating } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useApi(() => api.get('/leads/analytics'), []);

  const stats = data?.stats;
  const topPerformers = useMemo(() => data?.topPerformers ?? [], [data]);
  const recentLeads = useMemo(() => data?.recentLeads ?? [], [data]);

  const funnel = useMemo(() => {
    const statusCounts = data?.statusCounts ?? {};
    return LEAD_STATUSES.map((status) => ({
      status,
      count: statusCounts[status] ?? 0,
      share: stats?.totalLeads ? ((statusCounts[status] ?? 0) / stats.totalLeads) * 100 : 0,
    })).filter((row) => row.count > 0);
  }, [data, stats?.totalLeads]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isAdmin
            ? 'Pipeline health across every lead and every team member.'
            : 'Your personal outreach numbers. Rating and website status are your opening line.'}
        </p>
      </div>

      {/* ---------------------------------------------------------- KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={DocumentText}
          label={isAdmin ? 'Total leads' : 'Leads assigned to me'}
          value={stats?.totalLeads}
          isLoading={isLoading}
          hint={isAdmin ? `${stats?.unassigned ?? 0} waiting to be assigned` : 'Assigned by your admin'}
        />
        <KpiCard
          icon={CallCalling}
          label="Contacted"
          value={stats?.contacted}
          isLoading={isLoading}
          hint="Spoke to them at least once"
        />
        <KpiCard
          icon={Verify}
          label="Interested + demo"
          value={stats?.interested}
          isLoading={isLoading}
          hint="Said yes to a free demo"
        />
        <KpiCard
          icon={Profile2User}
          label="Converted"
          value={stats?.converted}
          isLoading={isLoading}
          hint={`${stats?.conversionRate ?? 0}% of all leads`}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------------------------------- status funnel */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>Where every lead currently sits in the funnel.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : funnel.length === 0 ? (
              <EmptyHint />
            ) : (
              <ul className="space-y-3">
                {funnel.map((row) => (
                  <li key={row.status} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <Badge variant={STATUS_VARIANTS[row.status]}>{row.status}</Badge>
                      <span className="nums text-muted-foreground">
                        {row.count} · {row.share.toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={row.share} className="h-1.5" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ----------------------------------------------- top performers */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Team leaderboard</CardTitle>
            <CardDescription>Converted leads per member.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : topPerformers.length === 0 ? (
              <EmptyHint message="No conversions yet — the leaderboard fills up as deals close." />
            ) : (
              <ol className="space-y-2.5">
                {topPerformers.map((performer, index) => (
                  <li key={performer.email} className="flex items-center gap-3">
                    <span className="nums flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{performer.name}</span>
                    <Badge variant="success" className="nums shrink-0">
                      {performer.count}
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------- latest leads */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle>Latest leads in the CRM</CardTitle>
            <CardDescription>Newest entries from your parsed PDFs.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/leads">
              <Grid1 className="h-4 w-4" />
              Open leads table
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Niche</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Opener angle</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((lead) => {
                  const rating = parseRating(lead.googleRating);
                  return (
                    <TableRow key={lead._id}>
                      <TableCell className="max-w-[16rem]">
                        <span className="block truncate font-medium">{lead.customerName}</span>
                        <span className="text-[11px] text-muted-foreground">{relativeTime(lead.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={nicheVariant(lead.businessNiche)}>{lead.businessNiche}</Badge>
                      </TableCell>
                      <TableCell>
                        {rating.score ? (
                          <span className="nums inline-flex items-center gap-1 whitespace-nowrap text-amber-500">
                            <Star1 className="h-3.5 w-3.5" variant="fill" />
                            {lead.googleRating}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[18rem]">
                        <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{truncate(openerAngle(lead.websiteStatus), 70)}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[lead.status] ?? 'muted'}>{lead.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && recentLeads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No leads yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint, isLoading, tone }) {
  return (
    <Card className={tone === 'success' ? 'border-success/30' : undefined}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <span
            className={[
              'flex h-7 w-7 items-center justify-center rounded-lg',
              tone === 'success' ? 'bg-success/12 text-success' : 'bg-primary/10 text-primary',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="mt-2.5 h-8 w-16" />
        ) : (
          <p className="nums mt-1.5 text-2xl font-semibold tracking-tight">{value ?? 0}</p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ message = 'Nothing to show yet. Import a lead list PDF to get started.' }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Warning2 className="h-6 w-6 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function openerAngle(websiteStatus = '') {
  const value = websiteStatus.toLowerCase();
  if (value.includes('no website')) return 'New website script';
  if (value.includes('instagram') || value.includes('youtube')) return 'Social profile only — pitch a real site';
  if (value.includes('unverified')) return 'Listing cropped — confirm the URL on the call';
  return 'May already have a site — pitch a free audit';
}
