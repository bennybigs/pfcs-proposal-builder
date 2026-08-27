// Deal detail drawer (right sheet from Pipeline / Leads / My Leads / Contacts).
// §1+§2 of Ben's drawer brief:
//   - pinned intake note (the original inquiry) at the top, edit-logged
//   - one-tap note composer that doesn't require scrolling
//   - EVERYTHING editable in place — contact fields update the shared Contact
//     record (no forking) — behind an explicit Save/Cancel with dirty guard
//   - phones stored E.164, displayed formatted; Call/Text disable on bad phone
//   - field changes land on the timeline as immutable system entries (old → new)
//   - filterable activity timeline with author-only edit/delete of manual notes
// Won/Lost buttons and the plain stage select remain until §4's stepper.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Pin,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { useDealMutations } from '@/lib/crm/api/deals';
import { useContactMutations } from '@/lib/crm/api/contacts';
import { NewProposalButton } from '@/components/crm/NewProposalButton';
import { useDealProposalLinks } from '@/lib/crm/api/proposalLinks';
import {
  useContactActivities,
  useLogActivity,
  logSystem,
  updateActivity,
  deleteActivity,
} from '@/lib/crm/api/activities';
import { useTeam, memberName } from '@/lib/crm/api/team';
import { useSessionEmail } from '@/lib/crm/session';
import {
  AdvanceButton,
  AssigneePicker,
  HoldDialog,
  LogButton,
  LostDialog,
  StageChipControl,
  WonDialog,
} from '@/components/crm/CardActions';
import { useProposalStore } from '@/store/useProposalStore';
import { grandTotal } from '@/lib/pricing';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/crm/phone';
import { formatDateUS } from '@/lib/format';
import {
  ACTIVITY_META,
  SEGMENTS,
  SEGMENT_META,
  SOURCES,
  SOURCE_LABEL,
  STAGES,
  STAGE_META,
  formatDollars,
  type Activity,
  type Contact,
  type ContactSource,
  type Deal,
  type DealSegment,
  type DealStage,
} from '@/lib/crm/types';
import { cn } from '@/lib/utils';

interface Props {
  deal: Deal | null;
  contact: Contact | undefined;
  onClose: () => void;
}

const UNASSIGNED = '__unassigned__';

interface Draft {
  // contact
  name: string;
  phone: string;
  phone2: string;
  email: string;
  preferred_contact: string;
  address: string;
  source: ContactSource;
  // deal
  title: string;
  value: string;
  expected_close: string;
  probability: string;
  segment: DealSegment;
  site_address: string;
}

function draftFrom(contact: Contact | undefined, deal: Deal): Draft {
  return {
    name: contact?.name ?? '',
    phone: contact ? formatPhone(contact.phone) : '',
    phone2: contact ? formatPhone(contact.phone2) : '',
    email: contact?.email ?? '',
    preferred_contact: contact?.preferred_contact ?? '',
    address: contact?.address ?? '',
    source: contact?.source ?? 'other',
    title: deal.title,
    value: String(Math.round(deal.value)),
    expected_close: deal.expected_close ?? '',
    probability: String(deal.probability),
    segment: deal.segment,
    site_address: deal.site_address ?? '',
  };
}

export function DealDrawer({ deal, contact, onClose }: Props) {
  const { update: updateDeal, move, assign } = useDealMutations();
  const { update: updateContact } = useContactMutations();
  const { data: team = [] } = useTeam();
  const me = useSessionEmail();
  const iAmAdmin = !!team.find((t) => t.email === me)?.is_admin;
  const log = useLogActivity();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: links = [] } = useDealProposalLinks(deal ? [deal.id] : []);
  const { data: activities = [] } = useContactActivities(contact?.id);
  const localProposals = useProposalStore((s) => s.proposals);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [logForceOpen, setLogForceOpen] = useState(false);
  const pendingCallAt = useRef<number | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // the honest call log: tapping Call fires tel:, and when the app regains
  // focus we offer the log card (never forced — Dismiss discards silently)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pendingCallAt.current) {
        pendingCallAt.current = null;
        setLogForceOpen(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // re-seed the form when a different deal opens, or fresh data arrives while
  // the form is clean — never while the user has unsaved edits
  const dirty = !!draft && !!original && JSON.stringify(draft) !== JSON.stringify(original);
  useEffect(() => {
    if (!deal) {
      setDraft(null);
      setOriginal(null);
      return;
    }
    if (!dirty) {
      const d = draftFrom(contact, deal);
      setDraft(d);
      setOriginal(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id, contact, deal?.updated_at]);

  const phoneOk = !!contact && isValidPhone(contact.phone);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
  };

  if (!deal || !draft || !original) return null;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const save = async () => {
    if (!contact) return;
    // validate phones before anything writes
    const phoneNorm = draft.phone.trim() ? normalizePhone(draft.phone) : '';
    const phone2Norm = draft.phone2.trim() ? normalizePhone(draft.phone2) : '';
    if (phoneNorm === null || phone2Norm === null) {
      toast.error('Bad phone number', 'Use a 10-digit US number, e.g. (330) 555-0141.');
      phoneInputRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const changes: string[] = [];
      const diff = (label: string, from: string, to: string) => {
        if (from !== to) changes.push(`${label}: ${from || '—'} → ${to || '—'}`);
      };
      diff('Name', original.name, draft.name.trim());
      diff('Phone', formatPhone(contact.phone) || '—', phoneNorm ? formatPhone(phoneNorm) : '—');
      diff('Second phone', formatPhone(contact.phone2) || '—', phone2Norm ? formatPhone(phone2Norm) : '—');
      diff('Email', original.email, draft.email.trim());
      diff('Preferred contact', original.preferred_contact, draft.preferred_contact);
      diff('Mailing address', original.address, draft.address.trim());
      diff('Source', SOURCE_LABEL[original.source], SOURCE_LABEL[draft.source]);
      diff('Title', original.title, draft.title.trim());
      diff('Value', formatDollars(Number(original.value) || 0), formatDollars(Number(draft.value) || 0));
      diff('Expected close', original.expected_close, draft.expected_close);
      diff('Probability', `${original.probability}%`, `${draft.probability}%`);
      diff('Segment', SEGMENT_META[original.segment].label, SEGMENT_META[draft.segment].label);
      diff('Site address', original.site_address, draft.site_address.trim());

      await updateContact.mutateAsync({
        id: contact.id,
        patch: {
          name: draft.name.trim() || contact.name,
          phone: phoneNorm,
          phone2: phone2Norm,
          email: draft.email.trim(),
          preferred_contact: draft.preferred_contact || null,
          address: draft.address.trim(),
          source: draft.source,
        },
      });
      await updateDeal.mutateAsync({
        id: deal.id,
        patch: {
          title: draft.title.trim() || deal.title,
          value: Math.max(0, Math.round(Number(draft.value) || 0)),
          expected_close: draft.expected_close || null,
          probability: Math.min(100, Math.max(0, Math.round(Number(draft.probability) || 0))),
          segment: draft.segment,
          site_address: draft.site_address.trim(),
        },
      });
      for (const c of changes) await logSystem(contact.id, deal.id, c);
      const saved: Draft = {
        ...draft,
        phone: phoneNorm ? formatPhone(phoneNorm) : '',
        phone2: phone2Norm ? formatPhone(phone2Norm) : '',
      };
      setDraft(saved);
      setOriginal(saved);
      invalidate();
      toast.success('Saved', changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} logged to the timeline.` : undefined);
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const useTotal = async (total: number) => {
    await updateDeal.mutateAsync({ id: deal.id, patch: { value: Math.round(total) } });
    if (contact) await logSystem(contact.id, deal.id, `Value: ${formatDollars(deal.value)} → ${formatDollars(total)} (from proposal)`);
    set({ value: String(Math.round(total)) });
    setOriginal((o) => (o ? { ...o, value: String(Math.round(total)) } : o));
    toast.success('Deal value updated');
  };

  const open = !['won', 'lost'].includes(deal.stage);

  return (
    <Sheet open={!!deal} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent className="w-full overflow-y-auto pb-24 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8">{draft.title || deal.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <StageChipControl deal={deal} contact={contact} />
          {open && <AdvanceButton deal={deal} className="h-6 px-2 text-xs" />}
          {contact && (
            <Link to={`/crm/contacts/${contact.id}`} className="text-brand-orange hover:underline">
              {contact.name}
            </Link>
          )}
          {contact && (
            <span className="text-xs text-brand-steel">
              via {SOURCE_LABEL[contact.source]}
              {contact.source_detail ? ` · ${contact.source_detail}` : ''}
            </span>
          )}
        </div>

        {/* one-touch outreach — disabled honestly when the phone is bad */}
        {contact && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild={phoneOk} size="sm" variant="outline" className="flex-1" disabled={!phoneOk}>
              {phoneOk ? (
                <a
                  href={`tel:${normalizePhone(contact.phone)}`}
                  onClick={() => {
                    pendingCallAt.current = Date.now(); // offer the log card on return
                  }}
                >
                  <Phone className="mr-1.5 h-4 w-4" /> Call
                </a>
              ) : (
                <span><Phone className="mr-1.5 inline h-4 w-4" /> Call</span>
              )}
            </Button>
            <Button asChild={phoneOk} size="sm" variant="outline" className="flex-1" disabled={!phoneOk}>
              {phoneOk ? (
                <a href={`sms:${normalizePhone(contact.phone)}`}>
                  <MessageSquare className="mr-1.5 h-4 w-4" /> Text
                </a>
              ) : (
                <span><MessageSquare className="mr-1.5 inline h-4 w-4" /> Text</span>
              )}
            </Button>
            {contact.email && (
              <Button asChild size="sm" variant="outline" className="flex-1">
                <a
                  href={`mailto:${contact.email}`}
                  onClick={() =>
                    log.mutate({ contact_id: contact.id, deal_id: deal.id, type: 'email', direction: 'outbound', body: `Emailed ${contact.email}` })
                  }
                >
                  <Mail className="mr-1.5 h-4 w-4" /> Email
                </a>
              </Button>
            )}
            <LogButton
              deal={deal}
              contact={contact}
              className="flex-1"
              forceOpen={logForceOpen}
              onForceHandled={() => setLogForceOpen(false)}
              initialType="call"
            />
            {!phoneOk && (
              <button
                className="w-full text-left text-xs font-medium text-brand-orange underline-offset-2 hover:underline"
                onClick={() => {
                  phoneInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  phoneInputRef.current?.focus();
                }}
              >
                {contact.phone ? `"${contact.phone}" isn't a dialable number — fix it` : 'Add a phone number'}
              </button>
            )}
          </div>
        )}

        {/* pinned intake note — the customer's original words */}
        {contact && <IntakeNote contact={contact} dealId={deal.id} onSaved={invalidate} />}

        {/* note composer: always one tap away, no scrolling past the form */}
        {contact && <NoteComposer contactId={contact.id} dealId={deal.id} />}

        {/* ── editable record ── */}
        <div className="mt-4 grid gap-3">
          <SectionLabel>Contact — edits update this person everywhere</SectionLabel>
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                ref={phoneInputRef}
                type="tel"
                value={draft.phone}
                placeholder="(330) 555-0141"
                className={cn(draft.phone.trim() && normalizePhone(draft.phone) === null && 'border-red-500')}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </Field>
            <Field label="Second phone">
              <Input
                type="tel"
                value={draft.phone2}
                className={cn(draft.phone2.trim() && normalizePhone(draft.phone2) === null && 'border-red-500')}
                onChange={(e) => set({ phone2: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Prefers">
              <Select value={draft.preferred_contact || 'none'} onValueChange={(v) => set({ preferred_contact: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Mailing address">
            <Input value={draft.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Project site address">
            <Input value={draft.site_address} placeholder="Where the building goes (if different)" onChange={(e) => set({ site_address: e.target.value })} />
          </Field>
          <Field label="Source">
            <Select value={draft.source} onValueChange={(v) => set({ source: v as ContactSource })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <SectionLabel>Deal</SectionLabel>
          <Field label="Title">
            <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value ($)">
              <Input
                inputMode="numeric"
                value={draft.value}
                onChange={(e) => set({ value: e.target.value.replace(/[^\d]/g, '') })}
              />
            </Field>
            <Field label="Expected close">
              <Input type="date" value={draft.expected_close} onChange={(e) => set({ expected_close: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Probability (%)">
              <Input
                inputMode="numeric"
                value={draft.probability}
                onChange={(e) => set({ probability: e.target.value.replace(/[^\d]/g, '') })}
              />
            </Field>
            <Field label="Segment">
              <Select value={draft.segment} onValueChange={(v) => set({ segment: v as DealSegment })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>{SEGMENT_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* live controls (they log + notify on their own, outside Save) */}
          <Field label="Assigned to">
            <AssigneePicker deal={deal} team={team} me={me} iAmAdmin={iAmAdmin} className="h-9 w-full" />
            {deal.closed_by && (
              <p className="text-xs text-brand-steel">
                Closed by {memberName(team, deal.closed_by)} — locked in when the deal was won.
              </p>
            )}
          </Field>
        </div>

        {/* Proposals — unchanged behavior */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-black">Proposals</h3>
            {contact && <NewProposalButton contact={contact} deal={deal} />}
          </div>
          {links.length === 0 ? (
            <p className="mt-1 text-xs text-brand-steel">
              None linked yet — start one from the contact page, or use “Link to CRM” inside a
              proposal.
            </p>
          ) : (
            <div className="mt-2 grid gap-2">
              {links.map((pl) => {
                const local = localProposals[pl.proposal_id];
                return (
                  <div key={pl.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-brand-steel" />
                      <span className="min-w-0 flex-1 truncate font-medium">{pl.title || 'Proposal'}</span>
                      <span className="text-brand-steel">{formatDollars(pl.total)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {local && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            navigate(`/proposal/${pl.proposal_id}`, {
                              state: { from: location.pathname + location.search },
                            })
                          }
                        >
                          <Pencil className="mr-1 h-3 w-3" /> Edit proposal
                        </Button>
                      )}
                      {pl.share_url && (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <a href={pl.share_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-1 h-3 w-3" /> Open
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => useTotal(pl.total)}>
                        Use this total
                      </Button>
                      {local && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => useTotal(grandTotal(local))}>
                          <RefreshCw className="mr-1 h-3 w-3" /> Refresh from proposal
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* timeline */}
        {contact && (
          <Timeline
            activities={activities}
            me={me}
            onChanged={() => qc.invalidateQueries({ queryKey: ['activities'] })}
          />
        )}

        {/* terminal outcomes — visually separated from the flow, both confirmed */}
        {open && (
          <div className="mt-6 border-t pt-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-steel">
              Outcome
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setWonOpen(true)}>
                <Trophy className="mr-1.5 h-4 w-4" /> Won…
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setLostOpen(true)}>
                <X className="mr-1.5 h-4 w-4" /> Lost…
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setHoldOpen(true)}>
                Hold…
              </Button>
            </div>
          </div>
        )}

        {/* sticky Save/Cancel bar — appears only when there are unsaved edits */}
        {dirty && (
          <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-white p-3 shadow-lg sm:absolute">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-brand-orange">
                <span className="h-2 w-2 rounded-full bg-brand-orange" /> Unsaved changes
              </span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setDraft(original)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        {/* discard guard */}
        <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Discard unsaved changes?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-brand-steel">You edited fields that haven&apos;t been saved.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmDiscard(false);
                  setDraft(original);
                  onClose();
                }}
              >
                Discard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {contact && (
          <>
            <LostDialog deal={deal} contact={contact} open={lostOpen} onOpenChange={setLostOpen} />
            <HoldDialog deal={deal} contact={contact} open={holdOpen} onOpenChange={setHoldOpen} />
          </>
        )}
        <WonDialog deal={deal} open={wonOpen} onOpenChange={setWonOpen} />
      </SheetContent>
    </Sheet>
  );
}

/** The customer's original inquiry, pinned and edit-logged. */
function IntakeNote({ contact, dealId, onSaved }: { contact: Contact; dealId: string; onSaved: () => void }) {
  const { update } = useContactMutations();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const save = async () => {
    try {
      await update.mutateAsync({
        id: contact.id,
        patch: {
          intake_note: text.trim() || null,
          intake_source: contact.intake_source ?? 'added later',
          intake_at: contact.intake_at ?? new Date().toISOString(),
        },
      });
      await logSystem(contact.id, dealId, contact.intake_note ? 'Intake note edited' : 'Intake note added');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error('Could not save note', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
        <Pin className="h-3 w-3" /> Intake note
        {contact.intake_source && <span className="font-normal normal-case">· {contact.intake_source}</span>}
        {contact.intake_at && <span className="font-normal normal-case">· {formatDateUS(contact.intake_at)}</span>}
        <button
          className="ml-auto rounded p-0.5 text-amber-800/70 hover:text-amber-800"
          title={contact.intake_note ? 'Edit intake note' : 'Add intake note'}
          onClick={() => {
            setText(contact.intake_note ?? '');
            setEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      {editing ? (
        <div className="mt-2 grid gap-2">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" className="h-7" onClick={save} disabled={update.isPending}>Save</Button>
          </div>
        </div>
      ) : contact.intake_note ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">{contact.intake_note}</p>
      ) : (
        <p className="mt-1.5 text-sm italic text-amber-800/70">No intake note captured.</p>
      )}
    </div>
  );
}

/** Always-one-tap note box, right below the pinned note. */
function NoteComposer({ contactId, dealId }: { contactId: string; dealId: string }) {
  const log = useLogActivity();
  const [text, setText] = useState('');
  const add = async () => {
    if (!text.trim()) return;
    try {
      await log.mutateAsync({ contact_id: contactId, deal_id: dealId, type: 'note', body: text.trim() });
      setText('');
    } catch (err) {
      toast.error('Could not add note', err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <div className="mt-3 flex gap-2">
      <Input
        value={text}
        placeholder="Add a note to the timeline…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Button size="sm" className="h-9 shrink-0" onClick={add} disabled={!text.trim() || log.isPending}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

type TimelineFilter = 'all' | 'comms' | 'notes' | 'system';

function Timeline({
  activities,
  me,
  onChanged,
}: {
  activities: Activity[];
  me: string;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const visible = useMemo(() => {
    return activities.filter((a) => {
      if (filter === 'comms') return ['call', 'text', 'email'].includes(a.type);
      if (filter === 'notes') return a.type === 'note' && a.source === 'manual';
      if (filter === 'system') return a.source !== 'manual';
      return true;
    });
  }, [activities, filter]);

  const saveEdit = async (id: string) => {
    try {
      await updateActivity(id, editText.trim());
      setEditingId(null);
      onChanged();
    } catch (err) {
      toast.error('Could not edit', err instanceof Error ? err.message : String(err));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteActivity(id);
      onChanged();
    } catch (err) {
      toast.error('Could not delete', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-1 text-sm font-semibold text-brand-black">Timeline</h3>
        {(
          [
            ['all', 'All'],
            ['comms', 'Calls & Texts'],
            ['notes', 'Notes'],
            ['system', 'System'],
          ] as [TimelineFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-medium',
              filter === key
                ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-2 text-xs text-brand-steel">Nothing here yet.</p>
      ) : (
        <div className="mt-2">
          {visible.map((a) => {
            const mine = a.source === 'manual' && a.logged_by === me;
            return (
              <div key={a.id} className="group border-b py-2 text-sm last:border-b-0">
                {editingId === a.id ? (
                  <div className="grid gap-2">
                    <Textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" className="h-7" onClick={() => saveEdit(a.id)}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <span className={cn(
                        'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        a.source === 'manual' ? 'bg-brand-orange/10 text-brand-orange' : 'bg-gray-100 text-brand-steel'
                      )}>
                        {ACTIVITY_META[a.type]?.label ?? a.type}
                      </span>
                      <div className="min-w-0 flex-1 whitespace-pre-wrap text-brand-black">{a.body}</div>
                      {mine && (
                        <span className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            className="p-0.5 text-brand-steel hover:text-brand-orange"
                            onClick={() => { setEditingId(a.id); setEditText(a.body); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button className="p-0.5 text-brand-steel hover:text-red-600" onClick={() => remove(a.id)}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 pl-1 text-[11px] text-brand-steel">
                      {a.outcome && <span className="mr-2 font-medium">{a.outcome.replace('_', ' ')}</span>}
                      {a.duration_min != null && <span className="mr-2">{a.duration_min} min</span>}
                      {a.logged_by} · {formatDateUS(a.happened_at)}
                      {a.edited_at && ' · edited'}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-steel">
      {children}
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
