import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { People, Add, ArrowRight, Send, UserTick, UserTag, Warning2, Refresh, Lock } from 'iconsax-react';
import { toast } from 'sonner';

import api, { toMessage } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { initialsOf, relativeTime } from '@/lib/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const PASSWORD_SCHEMA = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const memberSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(80, 'Keep the name short'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: PASSWORD_SCHEMA,
});

const resetSchema = z.object({ password: PASSWORD_SCHEMA });

export default function TeamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, reload } = useApi(() => api.get('/team'), []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);

  const team = useMemo(() => data?.team ?? [], [data]);
  const members = useMemo(() => team.filter((person) => person.role === 'member'), [team]);
  const admins = useMemo(() => team.filter((person) => person.role === 'admin'), [team]);

  const counts = data?.counts ?? {};
  const convertedBy = useMemo(
    () => new Map((data?.topPerformers ?? []).map((row) => [row.email, row.count])),
    [data?.topPerformers],
  );

  const onToggle = async (person) => {
    try {
      const { data: result } = await api.patch(`/team/${person.id}/toggle`);
      toast.success(result.message);
      reload({ silent: true });
    } catch (error) {
      toast.error(toMessage(error, 'Could not change that account.'));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Admins see every lead. Members only see the leads assigned to them.
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Add className="h-4 w-4" />
          Add member
        </Button>
      </div>

      {/* --------------------------------------------------- headline stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={People}
          label="Members"
          value={members.length}
          hint={`${admins.length} admin account${admins.length === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={UserTick}
          label="Assigned leads"
          value={counts.assigned ?? 0}
          hint="Sitting with a team member"
        />
        <StatCard icon={UserTag} label="Unassigned" value={counts.unassigned ?? 0} hint="Waiting to be picked up" />
        <StatCard icon={Send} label="Converted" value={counts.converted ?? 0} hint="Deals actually closed" />
      </div>

      {/* ------------------------------------------------------- roster table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            Open a member to see their pipeline, or hand them a lead list PDF in one upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem]">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Contacted</TableHead>
                  <TableHead>Converted</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10">
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-9 w-full" />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  [...admins, ...members].map((person) => (
                    <TableRow
                      key={person.id}
                      className={`group cursor-pointer ${person.isActive ? '' : 'opacity-60'}`}
                      onClick={() => navigate(`/team/${person.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px]">{initialsOf(person.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium group-hover:text-primary">{person.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{person.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={person.role === 'admin' ? 'default' : 'muted'} className="capitalize">
                          {person.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="nums">{person.assignedCount ?? 0}</TableCell>
                      <TableCell className="nums">{person.contacted ?? 0}</TableCell>
                      <TableCell className="nums">{convertedBy.get(person.email) ?? person.converted ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{relativeTime(person.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setResetTarget(person)}
                            aria-label={`Reset password for ${person.name}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggle(person)}
                            disabled={person.role === 'admin' || person.id === user.id}
                            className="text-xs"
                          >
                            <Refresh className="h-3.5 w-3.5" />
                            {person.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/team/${person.id}`)}
                            className="text-xs"
                          >
                            Profile
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && team.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      No team members yet. Add the first one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Warning2 className="mt-px h-3.5 w-3.5 shrink-0" />
        Deactivating an account blocks sign-in but keeps every remark and status change they logged. Leads stay assigned
        until you reassign them.
      </p>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={() => {
          setInviteOpen(false);
          reload({ silent: true });
        }}
      />

      <ResetPasswordDialog
        person={resetTarget}
        onOpenChange={(next) => !next && setResetTarget(null)}
        onDone={() => {
          setResetTarget(null);
          reload({ silent: true });
        }}
      />
    </div>
  );
}

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

function InviteDialog({ open, onOpenChange, onCreated }) {
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const { data } = await api.post('/team', values);
      toast.success(`${data.user.name} can now sign in.`);
      reset();
      onCreated();
    } catch (error) {
      setServerError(toMessage(error, 'Could not add that member.'));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setServerError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            They will only see leads that are assigned to them. Share the password over a secure channel and ask them to
            change it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
            >
              <Warning2 className="mt-px h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="member-name">Full name</Label>
            <Input
              id="member-name"
              placeholder="Priya Sharma"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              placeholder="priya@agency.com"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="member-password">Temporary password</Label>
            <Input
              id="member-password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Must include a letter and a number.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ person, onOpenChange, onDone }) {
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const { data } = await api.patch(`/team/${person.id}/password`, values);
      toast.success(data.message);
      reset();
      onDone();
    } catch (error) {
      setServerError(toMessage(error, 'Could not reset that password.'));
    }
  };

  return (
    <Dialog
      open={Boolean(person)}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setServerError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {person ? `Set a new password for ${person.name} and share it over a secure channel.` : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
            >
              <Warning2 className="mt-px h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Update password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
