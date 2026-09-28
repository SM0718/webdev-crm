import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentUpload, Star1, Trash, TickCircle, Warning2, CloseSquare } from 'iconsax-react';
import { toast } from 'sonner';

import api, { toMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { nicheVariant } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MAX_MB = 10;

/** @type {Array<Object>} rows held in local edit state between parse and import. */
const createRow = (raw) => ({
  key: raw.id ?? `${raw.phoneNumber}-${raw.customerName}`,
  selected: !raw.isDuplicate,
  isDuplicate: Boolean(raw.isDuplicate),
  customerName: raw.customerName ?? '',
  phoneNumber: raw.phoneNumber ?? '',
  businessNiche: raw.businessNiche ?? '',
  address: raw.address ?? '',
  googleRating: raw.googleRating ?? '',
  websiteStatus: raw.websiteStatus ?? 'No website shown',
});

export default function PdfUploadDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [phase, setPhase] = useState('upload'); // 'upload' | 'preview'

  const reset = useCallback(() => {
    setFile(null);
    setRows([]);
    setFileName('');
    setWarnings([]);
    setIsParsing(false);
    setIsSaving(false);
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
        setRows((data.parsedLeads ?? []).map(createRow));
        setFileName(data.fileName ?? picked.name);
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
    onDropRejected: (rejections) => {
      const reason = rejections?.[0]?.errors?.[0]?.message;
      toast.error(reason ?? 'That file could not be accepted.');
    },
  });

  /* --------------------------------------------------------- row editing */

  const patchRow = (key, field, value) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const toggleRow = (key, checked) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, selected: checked } : row)));
  };

  const toggleAll = (checked) => {
    setRows((current) => current.map((row) => ({ ...row, selected: checked })));
  };

  const clearDuplicates = () => {
    setRows((current) => current.map((row) => (row.isDuplicate ? { ...row, selected: false } : row)));
  };

  const selectAll = () => {
    setRows((current) => current.map((row) => ({ ...row, selected: true })));
  };

  const selectedRows = useMemo(() => rows.filter((row) => row.selected), [rows]);
  const duplicateCount = useMemo(() => rows.filter((row) => row.isDuplicate).length, [rows]);

  /** Rows the admin must still fix before they can be imported. */
  const incompleteRows = useMemo(
    () => selectedRows.filter((row) => !row.customerName.trim() || !row.phoneNumber.trim() || !row.businessNiche.trim()),
    [selectedRows],
  );

  /* ------------------------------------------------------------- import */

  const handleImport = async () => {
    if (incompleteRows.length > 0) {
      toast.error('Fill in the highlighted name, phone and niche cells before importing.');
      return;
    }

    setIsSaving(true);
    try {
      const { data } = await api.post('/leads/bulk-save', {
        fileName,
        leads: selectedRows.map(({ selected, isDuplicate, key, ...row }) => row),
      });
      toast.success(data.message ?? `Imported ${data.leads?.length ?? 0} leads.`);
      onImported?.();
      handleOpenChange(false);
    } catch (error) {
      toast.error(toMessage(error, 'Import failed. Nothing was saved.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={phase === 'preview' ? 'max-w-6xl' : 'max-w-lg'}
        onInteractOutside={(event) => {
          if (isParsing || isSaving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {phase === 'preview' ? 'Review parsed leads' : 'Upload Claude Lead List PDF'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'preview'
              ? 'Every cell is editable. Untick anything you do not want, then confirm.'
              : 'The PDF is parsed in memory and never stored on the server.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'upload' ? (
          <UploadStep
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            inputRef={inputRef}
            isDragActive={isDragActive}
            isParsing={isParsing}
            onBrowse={openFileDialog}
            file={file}
          />
        ) : (
          <PreviewStep
            rows={rows}
            warnings={warnings}
            fileName={fileName}
            duplicateCount={duplicateCount}
            onPatch={patchRow}
            onToggle={toggleRow}
            onToggleAll={toggleAll}
            onSelectAll={selectAll}
            onClearDuplicates={clearDuplicates}
            onBack={reset}
          />
        )}

        {phase === 'preview' && (
          <DialogFooter className="sm:items-center">
            <div className="mr-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="nums">
                <strong className="text-foreground">{selectedRows.length}</strong> of {rows.length} selected
              </span>
              {duplicateCount > 0 && (
                <span className="nums inline-flex items-center gap-1 text-warning">
                  <Warning2 className="h-3.5 w-3.5" />
                  {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} (unticked)
                </span>
              )}
              {incompleteRows.length > 0 && (
                <span className="nums text-destructive">{incompleteRows.length} row(s) need a name, phone or niche</span>
              )}
            </div>
            <Button variant="outline" onClick={reset} disabled={isSaving}>
              Start over
            </Button>
            <Button onClick={handleImport} disabled={isSaving || selectedRows.length === 0}>
              {isSaving ? 'Importing…' : `Import ${selectedRows.length} Selected Lead${selectedRows.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ step 1 */

function UploadStep({ getRootProps, getInputProps, inputRef, isDragActive, isParsing, onBrowse, file }) {
  return (
    <div className="space-y-4">
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
            {isParsing ? 'Reading the PDF…' : isDragActive ? 'Drop it here' : 'Drag & drop your lead list PDF'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Claude exports such as <span className="font-mono">Howrah_Gym_Leads.pdf</span> · max {MAX_MB} MB
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBrowse} disabled={isParsing}>
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

function PreviewStep({
  rows,
  warnings,
  fileName,
  duplicateCount,
  onPatch,
  onToggle,
  onToggleAll,
  onSelectAll,
  onClearDuplicates,
  onBack,
}) {
  const allSelected = rows.length > 0 && rows.every((row) => row.selected);
  const someSelected = rows.some((row) => row.selected);

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
          {fileName}
        </Badge>
        <Badge variant="muted" className="nums">
          {rows.length} row{rows.length === 1 ? '' : 's'} parsed
        </Badge>
        {duplicateCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7" onClick={onClearDuplicates}>
            <CloseSquare className="h-3.5 w-3.5" />
            Untick {duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'}
          </Button>
        )}
        {someSelected && !allSelected && (
          <Button variant="ghost" size="sm" className="h-7" onClick={onSelectAll}>
            Tick everything
          </Button>
        )}
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr className="border-b">
              <th className="w-10 px-2 py-2 text-left">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(value) => onToggleAll(value === true)}
                  aria-label="Select all rows"
                />
              </th>
              <th className="min-w-[13rem] px-2 py-2 text-left font-medium">Customer name</th>
              <th className="min-w-[8.5rem] px-2 py-2 text-left font-medium">Phone</th>
              <th className="min-w-[9rem] px-2 py-2 text-left font-medium">Niche</th>
              <th className="min-w-[7.5rem] px-2 py-2 text-left font-medium">Rating</th>
              <th className="min-w-[16rem] px-2 py-2 text-left font-medium">Address</th>
              <th className="min-w-[12rem] px-2 py-2 text-left font-medium">Website status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const incomplete = row.selected && (!row.customerName.trim() || !row.phoneNumber.trim() || !row.businessNiche.trim());
              return (
                <tr
                  key={row.key}
                  className={[
                    'border-b last:border-0 transition-colors',
                    row.selected ? 'bg-card' : 'bg-muted/40 opacity-60',
                    row.isDuplicate ? 'outline outline-1 -outline-offset-1 outline-warning/40' : '',
                  ].join(' ')}
                >
                  <td className="px-2 py-1.5 align-top">
                    <Checkbox
                      checked={row.selected}
                      onCheckedChange={(value) => onToggle(row.key, value === true)}
                      aria-label={`Select ${row.customerName || row.phoneNumber}`}
                    />
                  </td>

                  <td className="px-2 py-1.5 align-top">
                    <Input
                      value={row.customerName}
                      onChange={(event) => onPatch(row.key, 'customerName', event.target.value)}
                      placeholder="Business name"
                      className="h-8 text-xs"
                    />
                  </td>

                  <td className="px-2 py-1.5 align-top">
                    <Input
                      value={row.phoneNumber}
                      onChange={(event) => onPatch(row.key, 'phoneNumber', event.target.value)}
                      placeholder="Phone"
                      className="nums h-8 text-xs"
                    />
                  </td>

                  <td className="px-2 py-1.5 align-top">
                    <div className="flex flex-wrap items-center gap-1">
                      <Input
                        value={row.businessNiche}
                        onChange={(event) => onPatch(row.key, 'businessNiche', event.target.value)}
                        placeholder="Niche"
                        className="h-7 min-w-[5.5rem] text-[11px]"
                      />
                      <Badge variant={nicheVariant(row.businessNiche)} className="pointer-events-none">
                        {row.businessNiche || '—'}
                      </Badge>
                    </div>
                  </td>

                  <td className="px-2 py-1.5 align-top">
                    {row.googleRating ? (
                      <span className="nums inline-flex items-center gap-1 whitespace-nowrap text-amber-500">
                        <Star1 className="h-3.5 w-3.5" variant="fill" />
                        {row.googleRating}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-2 py-1.5 align-top">
                    <Input
                      value={row.address}
                      onChange={(event) => onPatch(row.key, 'address', event.target.value)}
                      placeholder="Address"
                      className="h-8 text-xs"
                    />
                  </td>

                  <td className="px-2 py-1.5 align-top">
                    <p className="text-[11px] leading-snug text-muted-foreground">{row.websiteStatus}</p>
                    {row.isDuplicate && (
                      <Badge variant="warning" className="mt-1">
                        Duplicate in CRM
                      </Badge>
                    )}
                    {incomplete && (
                      <Badge variant="destructive" className="mt-1">
                        Needs a value
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Trash className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No lead rows were found in that PDF.</p>
          <Button variant="outline" size="sm" onClick={onBack}>
            Try another file
          </Button>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">
              Nothing is saved until you click Import.
            </span>
          </TooltipTrigger>
          <TooltipContent>Parse only reads the PDF. Import performs the database write.</TooltipContent>
        </Tooltip>
      </p>
    </div>
  );
}
