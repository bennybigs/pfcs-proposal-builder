// Quick lead capture from the Leads screen. Creates contact (lead_status
// 'new' — stays in the inbox until worked, same as an inbound API lead) plus
// a deal at Inquiry, optionally assigned. Dedup by email/phone offers "use
// existing" instead of silently duplicating.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { SourceDetailInput } from '@/components/crm/ContactDialog';
import { useContacts } from '@/lib/crm/api/contacts';
import { useTeam, memberName } from '@/lib/crm/api/team';
import { logActivity } from '@/lib/crm/api/activities';
import { refreshLeadBadge } from '@/lib/crm/leadBadge';
import {
  SEGMENTS,
  SEGMENT_META,
  SOURCES,
  SOURCE_LABEL,
  type Contact,
  type ContactSource,
  type Deal,
  type DealSegment,
} from '@/lib/crm/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UNASSIGNED = '__unassigned__';

const empty = {
  name: '',
  phone: '',
  email: '',
  address: '',
  segment: 'other' as DealSegment,
  source: 'website' as ContactSource,
  source_detail: '',
  assignee: UNASSIGNED,
  notes: '',
};

const digits = (v: string) => v.replace(/\D/g, '');

export function NewLeadDialog({ open, onOpenChange }: Props) {
  const { data: contacts = [] } = useContacts();
  const { data: team = [] } = useTeam();
  const me = useSessionEmail();
  const iAmAdmin = !!team.find((t) => t.email === me)?.is_admin;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  // dedup: null = not checked yet; Contact = match found, awaiting choice
  const [duplicate, setDuplicate] = useState<Contact | null>(null);

  useEffect(() => {
    if (open) {
      // reps' new leads default to themselves; admins pick (or leave unassigned)
      setForm({ ...empty, assignee: iAmAdmin ? UNASSIGNED : me || UNASSIGNED });
      setDuplicate(null);
    }
  }, [open, iAmAdmin, me]);

  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }));
  const valid = form.name.trim() && (form.phone.trim() || form.email.trim());

  const findDuplicate = (): Contact | undefined => {
    const email = form.email.trim().toLowerCase();
    const ph = digits(form.phone);
    return contacts.find((c) => {
      if (email && c.email.trim().toLowerCase() === email) return true;
      if (ph.length >= 7) {
        const cd = digits(c.phone);
        return cd.length >= 7 && cd.slice(-10) === ph.slice(-10);
      }
      return false;
    });
  };

  const submit = async (useExisting?: Contact | 'create_new') => {
    if (!valid || busy) return;
    // first submit: check for an existing person before creating anything
    if (!useExisting) {
      const dup = findDuplicate();
      if (dup) {
        setDuplicate(dup);
        return;
      }
    }
    setBusy(true);
    const assignee = form.assignee === UNASSIGNED ? null : form.assignee;
    try {
      let contact: Contact;
      if (useExisting && useExisting !== 'create_new') {
        contact = useExisting;
        // they inquired again — pull dormant contacts back into the inbox
        await sb()
          .from('contacts')
          .update({ lead_status: 'new', lead_hold_until: null })
          .eq('id', contact.id)
          .in('lead_status', ['none', 'disqualified']);
      } else {
        const { data, error } = await sb()
          .from('contacts')
          .insert({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            source: form.source,
            source_detail: form.source_detail.replace(/\s+/g, ' ').trim() || null,
            lead_status: 'new',
          })
          .select()
          .single();
        if (error) throw error;
        contact = data as Contact;
      }

      // deal at Inquiry — direct insert (NOT createDeal) so the contact stays
      // 'new' in the Leads inbox until someone actually works it, exactly
      // like an inbound API lead. The DB trigger notifies the assignee.
      const { data: deal, error: dealErr } = await sb()
        .from('deals')
        .insert({
          contact_id: contact.id,
          title: `${contact.name} — ${SEGMENT_META[form.segment].short}`,
          segment: form.segment,
          assigned_to: assignee,
          created_via: 'app',
        })
        .select()
        .single();
      if (dealErr) throw dealErr;

      await logActivity({
        contact_id: contact.id,
        deal_id: (deal as Deal).id,
        type: 'note',
        body: `Lead created${assignee ? ` — assigned to ${memberName(team, assignee)}` : ''}${form.notes.trim() ? ` — "${form.notes.trim()}"` : ''}`,
      });

      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      void refreshLeadBadge();
      void fetch('/api/notify-flush', { method: 'POST' }).catch(() => undefined);
      toast.success('Lead created', assignee ? `Assigned to ${memberName(team, assignee)}.` : 'Landed in the Leads inbox, unassigned.');
      onOpenChange(false);
      navigate(`/crm/pipeline?deal=${(deal as Deal).id}`);
    } catch (err) {
      toast.error('Could not create lead', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const activeTeam = useMemo(() => team, [team]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>

        {duplicate ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="font-medium">Looks like {duplicate.name} already exists.</div>
              <div className="mt-0.5 text-xs">
                {[duplicate.phone, duplicate.email].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="grid gap-2">
              <Button onClick={() => submit(duplicate)} disabled={busy}>
                Use existing contact (adds a new deal)
              </Button>
              <Button variant="outline" onClick={() => submit('create_new')} disabled={busy}>
                Create new contact anyway
              </Button>
              <Button variant="outline" onClick={() => setDuplicate(null)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <>
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
              <Field label="Address (optional)">
                <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Segment">
                  <Select value={form.segment} onValueChange={(v) => set({ segment: v as DealSegment })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((s) => (
                        <SelectItem key={s} value={s}>{SEGMENT_META[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Source">
                  <Select value={form.source} onValueChange={(v) => set({ source: v as ContactSource })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Source detail — campaign or referrer (optional)">
                <SourceDetailInput
                  value={form.source_detail}
                  source={form.source}
                  onChange={(v) => set({ source_detail: v })}
                />
              </Field>
              <Field label="Assigned to">
                {iAmAdmin ? (
                  <Select value={form.assignee} onValueChange={(v) => set({ assignee: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned (triage later)</SelectItem>
                      {activeTeam.map((t) => (
                        <SelectItem key={t.email} value={t.email}>
                          {t.display_name || t.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={memberName(team, me)} disabled />
                )}
              </Field>
              <Field label="Notes">
                <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => submit()} disabled={!valid || busy}>
                {busy ? 'Creating…' : 'Create lead'}
              </Button>
            </DialogFooter>
            <p className="-mt-1 text-xs text-brand-steel">
              Name plus a phone or email is enough. Creates the contact and a deal at Inquiry.
            </p>
          </>
        )}
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
