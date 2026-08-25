// CSV import with header→field mapping, a preview table, and duplicate
// warnings (matched on email or phone against existing contacts).
import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { createContact } from '@/lib/crm/api/contacts';
import { useQueryClient } from '@tanstack/react-query';
import { SOURCES, type Contact, type ContactSource } from '@/lib/crm/types';

const FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'company_name', label: 'Company / farm' },
  { key: 'source', label: 'Source' },
  { key: 'source_detail', label: 'Source detail / campaign' },
  { key: 'tags', label: 'Tags' },
  { key: 'notes', label: 'Notes' },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

// auto-map obvious header names
const guess = (header: string): FieldKey | '' => {
  const h = header.toLowerCase();
  if (/name|contact/.test(h) && !/company|farm|business/.test(h)) return 'name';
  if (/mail/.test(h)) return 'email';
  if (/phone|cell|mobile/.test(h)) return 'phone';
  if (/address|street|city/.test(h)) return 'address';
  if (/company|farm|business/.test(h)) return 'company_name';
  if (/detail|campaign/.test(h)) return 'source_detail';
  if (/source|how.*hear/.test(h)) return 'source';
  if (/tag/.test(h)) return 'tags';
  if (/note|comment/.test(h)) return 'notes';
  return '';
};

const normSource = (v: string): ContactSource => {
  const s = v.trim().toLowerCase();
  return (SOURCES as string[]).includes(s) ? (s as ContactSource) : 'other';
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: Contact[];
}

export function CsvImportDialog({ open, onOpenChange, existing }: Props) {
  const qc = useQueryClient();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, FieldKey | ''>>({});
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setHeaders([]);
    setRows([]);
    setMapping({});
  };

  const onFile = (file: File) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data as string[][];
        if (!data.length) return toast.error('CSV is empty');
        const [head, ...body] = data;
        setHeaders(head);
        setRows(body);
        const m: Record<number, FieldKey | ''> = {};
        head.forEach((h, i) => (m[i] = guess(h)));
        setMapping(m);
      },
      error: (err: Error) => toast.error('Could not read CSV', err.message),
    });
  };

  const parsed = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((cells) => {
      const rec: Record<FieldKey, string> = {
        name: '', email: '', phone: '', address: '', company_name: '', source: '', source_detail: '', tags: '', notes: '',
      };
      cells.forEach((cell, i) => {
        const field = mapping[i];
        if (field) rec[field] = rec[field] ? `${rec[field]} ${cell}`.trim() : cell.trim();
      });
      return rec;
    }).filter((r) => r.name);
  }, [rows, mapping]);

  const dupes = useMemo(() => {
    const byEmail = new Map(existing.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
    const byPhone = new Map(
      existing.filter((c) => c.phone).map((c) => [c.phone.replace(/\D/g, ''), c])
    );
    return parsed.map((r) => {
      const email = r.email.toLowerCase();
      const phone = r.phone.replace(/\D/g, '');
      return (email && byEmail.get(email)) || (phone && byPhone.get(phone)) || null;
    });
  }, [parsed, existing]);

  const importAll = async () => {
    setBusy(true);
    let created = 0;
    try {
      for (const rec of parsed) {
        await createContact({
          name: rec.name,
          email: rec.email,
          phone: rec.phone,
          address: rec.address,
          company_name: rec.company_name,
          source: normSource(rec.source),
          source_detail: rec.source_detail.replace(/\s+/g, ' ').trim() || null,
          tags: rec.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
          notes: rec.notes,
        });
        created++;
      }
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(`Imported ${created} contact${created === 1 ? '' : 's'}`);
      reset();
      onOpenChange(false);
    } catch (err) {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.error(
        `Import stopped after ${created} contact${created === 1 ? '' : 's'}`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setBusy(false);
    }
  };

  const dupeCount = dupes.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
        </DialogHeader>

        {!rows.length ? (
          <label className="block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm text-brand-steel hover:bg-brand-gray-bg">
            Choose a .csv file — the first row must be headers
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-32 truncate font-medium" title={h}>{h}</span>
                  <Select
                    value={mapping[i] || 'skip'}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [i]: v === 'skip' ? '' : (v as FieldKey) }))}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">— skip —</SelectItem>
                      {FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-brand-gray-bg">
                  <tr>
                    <th className="p-1.5 text-left">Name</th>
                    <th className="p-1.5 text-left">Phone</th>
                    <th className="p-1.5 text-left">Email</th>
                    <th className="p-1.5 text-left">Company</th>
                    <th className="p-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1.5">{r.name}</td>
                      <td className="p-1.5">{r.phone}</td>
                      <td className="p-1.5">{r.email}</td>
                      <td className="p-1.5">{r.company_name}</td>
                      <td className="p-1.5">
                        {dupes[i] && <Badge variant="secondary">possible duplicate</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-brand-steel">
              {parsed.length} row{parsed.length === 1 ? '' : 's'} ready
              {dupeCount > 0 && ` · ${dupeCount} look like existing contacts (matched on email/phone) — they'll import as new rows unless you remove them from the file`}
            </p>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={importAll} disabled={!parsed.length || busy}>
            {busy ? 'Importing…' : `Import ${parsed.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
