// Add/edit contact. Radix Dialog; the shared dialog styles already render
// bottom-sheet-like on narrow screens via their responsive classes.
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useContactMutations, useContacts } from '@/lib/crm/api/contacts';
import { refreshLeadBadge } from '@/lib/crm/leadBadge';
import {
  LEAD_STATUSES,
  LEAD_STATUS_META,
  SOURCES,
  SOURCE_LABEL,
  type Contact,
  type ContactSource,
  type LeadStatus,
} from '@/lib/crm/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null; // undefined/null = create
  onCreated?: (contact: Contact) => void;
}

const empty = {
  name: '',
  email: '',
  phone: '',
  address: '',
  company_name: '',
  source: 'other' as ContactSource,
  source_detail: '',
  tags: '' as string, // comma-separated in the form
  notes: '',
  lead_status: 'new' as LeadStatus, // new contacts land in the Leads inbox by default
};

/** Collapse runs of whitespace, trim ends — casing preserved. */
const cleanDetail = (v: string) => v.replace(/\s+/g, ' ').trim();

export function ContactDialog({ open, onOpenChange, contact, onCreated }: Props) {
  const { create, update } = useContactMutations();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setForm(
      contact
        ? {
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
            company_name: contact.company_name,
            source: contact.source,
            source_detail: contact.source_detail ?? '',
            tags: contact.tags.join(', '),
            notes: contact.notes,
            lead_status: contact.lead_status,
          }
        : empty
    );
  }, [open, contact]);

  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }));
  const payload = () => ({
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
    company_name: form.company_name.trim(),
    source: form.source,
    source_detail: cleanDetail(form.source_detail) || null,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    notes: form.notes,
    lead_status: form.lead_status,
    // switching away from on-hold clears the resurface date
    lead_hold_until: form.lead_status === 'on_hold' ? (contact?.lead_hold_until ?? null) : null,
  });

  const save = async () => {
    try {
      if (contact) {
        await update.mutateAsync({ id: contact.id, patch: payload() });
        toast.success('Contact updated');
      } else {
        const created = await create.mutateAsync(payload());
        toast.success('Contact added');
        onCreated?.(created);
      }
      void refreshLeadBadge();
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save contact', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : 'New contact'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company / farm">
              <Input value={form.company_name} onChange={(e) => set({ company_name: e.target.value })} />
            </Field>
            <Field label="Source">
              <Select value={form.source} onValueChange={(v) => set({ source: v as ContactSource })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Source detail — the specific campaign or referrer (optional)">
            <SourceDetailInput
              value={form.source_detail}
              source={form.source}
              excludeId={contact?.id}
              onChange={(v) => set({ source_detail: v })}
            />
          </Field>
          <Field label="Lead stage — New shows in the Leads inbox">
            <Select
              value={form.lead_status}
              onValueChange={(v) => set({ lead_status: v as LeadStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tags (comma-separated)">
            <Input
              value={form.tags}
              placeholder="repeat customer, wants quote in spring"
              onChange={(e) => set({ tags: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!form.name.trim() || create.isPending || update.isPending}>
            {contact ? 'Save changes' : 'Add contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Typeahead over existing source_detail values for the chosen bucket, so the
 * team converges on one spelling of "Home Show 2026" instead of five.
 * Plain input + suggestion list built from Radix-free primitives (no new
 * libraries); still accepts brand-new values.
 */
export function SourceDetailInput({
  value,
  source,
  excludeId,
  onChange,
}: {
  value: string;
  source: ContactSource;
  excludeId?: string;
  onChange: (v: string) => void;
}) {
  const { data: contacts = [] } = useContacts();
  const [open, setOpen] = useState(false);
  const suggestions = [...new Set(
    contacts
      .filter((c) => c.source === source && c.id !== excludeId && c.source_detail)
      .map((c) => c.source_detail!.trim())
  )]
    .filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()) && s !== value.trim())
    .sort()
    .slice(0, 6);
  return (
    <div className="relative">
      <Input
        value={value}
        placeholder='e.g. "Home Show 2026" or "John Miller"'
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-white shadow-md">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-gray-bg"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-brand-steel">{label}</Label>
      {children}
    </div>
  );
}
