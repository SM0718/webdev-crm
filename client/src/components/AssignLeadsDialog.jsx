import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentUpload, Star1, TickCircle, Warning2, Refresh, ArrowRight } from 'iconsax-react';
import { toast } from 'sonner';

import api, { toMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { nicheVariant } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MAX_MB = 10;

/**
 * Uploads a Claude lead-list PDF straight onto a team member's book of work.
 *
 * Every row in the PDF ends up assigned to `member`: rows that are new to the CRM
 * are created, rows that already exist are handed over. The preview step is a
 * read-only sanity check - unlike the general import wizard, nothing here is
 * editable, because the admin is not building a lead list, they are filling
 * somebody's pipeline.
 */
export default function AssignLeadsDialog({ open, onOpenChange, member, onAssigned }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [phase, setPhase] = useState('upload'); // 'upload' | 'preview' | 'done'

  const memberName = member?.name ?? 'this member';
  const isInactive = member ? !member.isActive : false;

  const reset = useCallback(() => {
    setFile(null);
    setRows([]);
    setWarnings([]);
    setIsParsing(false);
    setIsAssigning(false);
    setPhase('upload');
  }, []);

  const handleOpenChange = (next) => {
    onOpenChange(next);
    if (!next) reset();
  };

  /* ------------------------------------------------------------- parsing */

  const parseFile = useCallback(
    async (picked) => {
      if (!picked) return;
      if (picked.size > MAX_MB * 1024 * 1024) {
        toast.error(`That file is ${formatBytes(picked.size)}. Keep PDFs under ${MAX_MB} MB.`);
        return;
      }

      setFile(picked);
      setIsParsing(true);
      setWarnings([]);

      const form = new FormData();
      form.append('file', picked);

      try {
        const { data } = await api.post('/leads/parse-pdf', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setRows(data.parsedLeads ?? []);
        setWarnings(data.warnings ?? []);
        setPhase('preview');
      } catch (error) {
        reset();
        toast.error(toMessage(error, 'Could not read that PDF.'));
      } finally {
        setIsParsing(false);
      }
    },
    [reset],
  );

  const { getRootProps, getInputProps, inputRef, isDragActive, open: openFileDialog } = useDropzone({
    onDrop: (accepted) => parseFile(accepted?.[0]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    maxSize: MAX_MB * 1024 * 1024,
    noClick: true,
    noKeyboard: true,
    disabled: isInactive,
    onDropRejected: (rejections) => {
      const reason = rejections?.[0]?.errors?.[0]?.message;
      toast.error(reason ?? 'That file could not be accepted.');
    },
  });

  const existingCount = useMemo(() => rows.filter((row) => row.isDuplicate).length, [rows]);
  const newCount = rows.length - existingCount;

  /* ------------------------------------------------------------- assigning */

  const handleAssign = async () => {
    if (!file || !member) return;

    setIsAssigning(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('memberId', member.id);

      const { data } = await api.post('/leads/assign-pdf', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(data.message);
      onAssigned?.(data);
      setPhase('done');
    } catch (error) {
      toast.error(toMessage(error, 'Could not assign those leads.'));
    } finally {
      setIsAssigning(false);
    }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={phase === 'preview' ? 'max-w-4xl' : 'max-w-lg'}
        onInteractOutside={(event) => {
          if (isParsing || isAssigning) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === 'done' ? 'Leads assigned' : 'Assign leads from a PDF'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'done' ? (
              `${memberName} can now start working through the new list.`
            ) : (
              <>
                Every lead in the PDF goes to{' '}
                <span className="font-medium text-foreground">{memberName}</span>. New businesses are created and
                existing ones are handed over, so re-uploading the same file tops the list up instead of duplicating it.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === 'upload' && (
          <UploadStep
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            inputRef={inputRef}
            isDragActive={isDragActive}
            isParsing={isParsing}
            onBrowse={openFileDialog}
            file={file}
            isInactive={isInactive}
          />
        )}

        {phase === 'preview' && (
          <PreviewStep
            rows={rows}
            warnings={warnings}
            file={file}
            existingCount={existingCount}
            newCount={newCount}
            memberName={memberName}
            onBack={reset}
          />
        )}

        {phase === 'done' && (
          <DoneStep created={newCount} reassigned={existingCount} memberName={memberName} />
        )}

        {phase === 'preview' && (
          <DialogFooter className="sm:items-center">
            <div className="mr-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="nums">
                <strong className="text-foreground">{newCount}</strong> new
              </span>
              <span className="nums inline-flex items-center gap-1">
                <Refresh className="h-3.5 w-3.5" />
                <strong className="text-foreground">{existingCount}</strong> already in CRM
              </span>
            </div>
            <Button variant="outline" onClick={reset} disabled={isAssigning}>
              Start over
            </Button>
            <Button onClick={handleAssign} disabled={isAssigning || rows.length === 0 || isInactive}>
              {isAssigning ? 'Assigning…' : `Assign ${rows.length} Lead${rows.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        )}

        {phase === 'done' && (
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ step 1 */

function UploadStep({ getRootProps, getInputProps, inputRef, isDragActive, isParsing, onBrowse, file, isInactive }) {
  return (
    <div className="space-y-4">
      {isInactive && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
          <Warning2 className="mt-px h-4 w-4 shrink-0" />
          <span>This account is deactivated. Reactivate it before assigning new leads.</span>
        </div>
      )}

      <div
        {...getRootProps()}
        className={[
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
          isParsing ? 'pointer-events-none opacity-70' : '',
        ].join(' ')}
      >
        <input ref={inputRef} {...getInputProps()} className="sr-only" />
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <DocumentUpload className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {isParsing ? 'Reading the PDF…' : isDragActive ? 'Drop it here' : 'Drag & drop the lead list PDF'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Claude exports such as <span className="font-mono">Howrah_Gym_Leads.pdf</span> · max {MAX_MB} MB
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBrowse} disabled={isParsing || isInactive}>
          Browse files
        </Button>
      </div>

      {file && !isParsing && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <TickCircle className="h-3.5 w-3.5 text-success" />
          {file.name} · {formatBytes(file.size)}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ step 2 */

function PreviewStep({ rows, warnings, file, existingCount, newCount, memberName, onBack }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Warning2 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No lead rows were found in that PDF.</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Try another file
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="info" className="nums">
          {file?.name}
        </Badge>
        <Badge variant="muted" className="nums">
          {rows.length} lead{rows.length === 1 ? '' : 's'} → {memberName}
        </Badge>
        {newCount > 0 && <Badge variant="success">{newCount} will be created</Badge>}
        {existingCount > 0 && <Badge variant="warning">{existingCount} will be reassigned</Badge>}
      </div>

      <div className="-mx-1 min-h-0 max-h-[45vh] flex-1 overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr className="border-b">
              <th className="min-w-[13rem] px-2.5 py-2 text-left font-medium">Customer name</th>
              <th className="min-w-[8.5rem] px-2.5 py-2 text-left font-medium">Phone</th>
              <th className="min-w-[9rem] px-2.5 py-2 text-left font-medium">Niche</th>
              <th className="min-w-[7rem] px-2.5 py-2 text-left font-medium">Rating</th>
              <th className="min-w-[15rem] px-2.5 py-2 text-left font-medium">Address</th>
              <th className="px-2.5 py-2 text-left font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.phoneNumber}-${index}`} className="border-b last:border-0">
                <td className="px-2.5 py-1.5">
                  <p className="truncate font-medium">{row.customerName || '—'}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{row.websiteStatus}</p>
                </td>
                <td className="nums px-2.5 py-1.5 text-muted-foreground">{row.phoneNumber || '—'}</td>
                <td className="px-2.5 py-1.5">
                  <Badge variant={nicheVariant(row.businessNiche)}>{row.businessNiche || '—'}</Badge>
                </td>
                <td className="px-2.5 py-1.5">
                  {row.googleRating ? (
                    <span className="nums inline-flex items-center gap-1 whitespace-nowrap text-amber-500">
                      <Star1 className="h-3.5 w-3.5" variant="fill" />
                      {row.googleRating}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-muted-foreground">{row.address || '—'}</td>
                <td className="px-2.5 py-1.5">
                  {row.isDuplicate ? (
                    <Badge variant="warning">Handed over</Badge>
                  ) : (
                    <Badge variant="success">New lead</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Nothing is written until you confirm. Leads already further along the funnel keep their current status.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ step 3 */

function DoneStep({ created, reassigned, memberName }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 px-6 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
        <TickCircle className="h-7 w-7" />
      </span>
      <p className="text-sm font-medium">
        {created + reassigned} lead{created + reassigned === 1 ? '' : 's'} now belong to {memberName}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="success" className="nums">
          {created} new
        </Badge>
        <ArrowRight className="h-3.5 w-3.5" />
        <Badge variant="info" className="nums">
          {reassigned} reassigned
        </Badge>
      </div>
    </div>
  );
}
