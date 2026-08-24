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
import { useContactMutations } from '@/lib/crm/api/contacts';
import { SOURCES, SOURCE_LABEL, type Contact, type ContactSource } from '@/lib/crm/types';

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
  tags: '' as string, // comma-separated in the form
  notes: '',
};

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
            tags: contact.tags.join(', '),
            notes: contact.notes,
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
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    notes: form.notes,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-brand-steel">{label}</Label>
      {children}
    </div>
  );
}
