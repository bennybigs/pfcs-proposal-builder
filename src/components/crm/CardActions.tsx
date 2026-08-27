// The ONE set of card actions, used identically on the board card face, the
// Leads rows, and the opened deal drawer. A stage change from any surface
// runs the same moveDealStage path and produces identical timeline entries.
//
//   StageChipControl — tap the stage chip, pick any stage; Won/Lost separated
//                      behind confirms (Won asks final value; Lost a reason)
//   AdvanceButton    — one tap to the next stage (the common case)
//   LogButton        — log a call / text / note without opening anything;
//                      connected call on a Lead offers "move to Follow Up";
//                      bad number / wrong person offers an inline phone fix
//   AssigneePicker   — admin select / read-only name
//   HoldDialog, LostDialog, WonDialog — shared everywhere
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useDealMutations, updateDeal } from '@/lib/crm/api/deals';
import { useContactMutations } from '@/lib/crm/api/contacts';
import { useLogActivity, logSystem } from '@/lib/crm/api/activities';
import { useTaskMutations } from '@/lib/crm/api/tasks';
import { memberName, type TeamMember } from '@/lib/crm/api/team';
import { refreshLeadBadge } from '@/lib/crm/leadBadge';
import { formatPhone, normalizePhone } from '@/lib/crm/phone';
import {
  CALL_OUTCOMES,
  STAGES,
  STAGE_META,
  formatDollars,
  type CallOutcome,
  type Contact,
  type Deal,
  type DealStage,
} from '@/lib/crm/types';
import { formatDateUS } from '@/lib/format';
import { cn } from '@/lib/utils';

export const LOST_REASONS = [
  'Out of area',
  'No budget',
  'Wrong service',
  'Bad contact info',
  'Duplicate',
  'Went with someone else',
  'No response',
] as const;

const NON_TERMINAL: DealStage[] = STAGES.filter((s) => s !== 'won' && s !== 'lost');

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Next stage in the flow, or null when only terminal outcomes remain. */
export function nextStage(stage: DealStage): DealStage | null {
  const i = NON_TERMINAL.indexOf(stage);
  if (i === -1) return null;
  return i + 1 < NON_TERMINAL.length ? NON_TERMINAL[i + 1] : 'won';
}

// ── stage chip: tap it, pick any stage ───────────────────────────────

export function StageChipControl({ deal, contact }: { deal: Deal; contact: Contact | undefined }) {
  const { move } = useDealMutations();
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  const to = async (s: DealStage) => {
    try {
      await move.mutateAsync({ deal, to: s });
      void refreshLeadBadge();
      toast.success(`${STAGE_META[deal.stage].label} → ${STAGE_META[s].label}`);
    } catch (err) {
      toast.error('Could not move', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            title="Change stage"
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              STAGE_META[deal.stage].color
            )}
          >
            {STAGE_META[deal.stage].label}
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
          {NON_TERMINAL.map((s) => (
            <DropdownMenuItem key={s} disabled={s === deal.stage} onClick={() => void to(s)}>
              <span className={cn('mr-1 h-2 w-2 rounded-full', STAGE_META[s].color.split(' ')[0])} />
              {STAGE_META[s].label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={deal.stage === 'won'} onClick={() => setWonOpen(true)}>
            🏆 Won…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={deal.stage === 'lost'}
            className="text-red-600"
            onClick={() => setLostOpen(true)}
          >
            ✕ Lost…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WonDialog deal={deal} open={wonOpen} onOpenChange={setWonOpen} />
      {contact && <LostDialog deal={deal} contact={contact} open={lostOpen} onOpenChange={setLostOpen} />}
    </>
  );
}

// ── Advance → : the common case in one tap ───────────────────────────

export function AdvanceButton({
  deal,
  size = 'sm',
  className,
}: {
  deal: Deal;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const { move } = useDealMutations();
  const [wonOpen, setWonOpen] = useState(false);
  const next = nextStage(deal.stage);
  if (!next) return null;

  const go = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (next === 'won') {
      setWonOpen(true);
      return;
    }
    try {
      await move.mutateAsync({ deal, to: next });
      void refreshLeadBadge();
      toast.success(`Moved to ${STAGE_META[next].label}`);
    } catch (err) {
      toast.error('Could not advance', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <Button size={size} className={cn('h-8', className)} onClick={go} disabled={move.isPending}>
        {next === 'won' ? 'Won' : 'Advance'} <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
      <WonDialog deal={deal} open={wonOpen} onOpenChange={setWonOpen} />
    </>
  );
}

// ── Log: call / text / note without opening anything ─────────────────

export function LogButton({
  deal,
  contact,
  label = 'Log',
  size = 'sm',
  className,
  /** external open control for the drawer's tap-Call-then-return prompt */
  forceOpen,
  onForceHandled,
  initialType,
}: {
  deal: Deal;
  contact: Contact;
  label?: string;
  size?: 'sm' | 'default';
  className?: string;
  forceOpen?: boolean;
  onForceHandled?: () => void;
  initialType?: 'call' | 'text' | 'note';
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      onForceHandled?.();
    }
  }, [forceOpen, onForceHandled]);
  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={cn('h-8', className)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> {label}
      </Button>
      <LogDialog deal={deal} contact={contact} open={open} onOpenChange={setOpen} initialType={initialType} />
    </>
  );
}

function LogDialog({
  deal,
  contact,
  open,
  onOpenChange,
  initialType,
}: {
  deal: Deal;
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialType?: 'call' | 'text' | 'note';
}) {
  const log = useLogActivity();
  const { move } = useDealMutations();
  const { create: createTask } = useTaskMutations();
  const { update: updateContact } = useContactMutations();
  const qc = useQueryClient();

  const [type, setType] = useState<'call' | 'text' | 'note'>('call');
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [body, setBody] = useState('');
  const [followUp, setFollowUp] = useState<'' | '1' | '3' | '7'>('');
  const [moveOn, setMoveOn] = useState(false);
  const [fixPhone, setFixPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setType(initialType ?? 'call');
      setOutcome('');
      setBody('');
      setFollowUp('');
      setMoveOn(false);
      setFixPhone('');
    }
  }, [open, initialType]);

  // a connected call on a Lead is the definition of "contact made"
  useEffect(() => {
    if (outcome === 'connected' && deal.stage === 'lead') setMoveOn(true);
  }, [outcome, deal.stage]);

  const badNumber = outcome === 'bad_number' || outcome === 'wrong_person';

  const save = async () => {
    setBusy(true);
    try {
      if (badNumber && fixPhone.trim()) {
        const norm = normalizePhone(fixPhone);
        if (!norm) {
          toast.error('Bad replacement number', 'Use a 10-digit US number.');
          setBusy(false);
          return;
        }
        await updateContact.mutateAsync({ id: contact.id, patch: { phone: norm } });
        await logSystem(contact.id, deal.id, `Phone: ${formatPhone(contact.phone) || '—'} → ${formatPhone(norm)}`);
      }
      const label =
        type === 'call' ? `Called ${formatPhone(contact.phone) || contact.name}`
        : type === 'text' ? `Texted ${formatPhone(contact.phone) || contact.name} (sent from device)`
        : '';
      await log.mutateAsync({
        contact_id: contact.id,
        deal_id: deal.id,
        type,
        direction: type === 'note' ? null : 'outbound',
        outcome: type === 'call' && outcome ? outcome : null,
        body: body.trim() || label,
      });
      if (followUp) {
        const due = new Date();
        due.setDate(due.getDate() + Number(followUp));
        await createTask.mutateAsync({
          contact_id: contact.id,
          deal_id: deal.id,
          title: `Follow up: ${contact.name}`,
          due_date: due.toISOString().slice(0, 10),
          ...(deal.assigned_to ? { assigned_to: deal.assigned_to } : {}),
        });
      }
      if (moveOn && deal.stage === 'lead') {
        await move.mutateAsync({ deal, to: 'follow_up' });
        void refreshLeadBadge();
      }
      qc.invalidateQueries({ queryKey: ['activities'] });
      toast.success(
        type === 'note' ? 'Note added' : `${type === 'call' ? 'Call' : 'Text'} logged`,
        moveOn && deal.stage === 'lead' ? 'Moved to Follow Up.' : followUp ? 'Follow-up task created.' : undefined
      );
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not log', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Log — {contact.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex gap-1.5">
            {(['call', 'text', 'note'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'flex-1 rounded-md border px-2 py-1.5 text-sm font-medium capitalize',
                  type === t
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {type === 'call' && (
            <div className="grid gap-1.5">
              <Label className="text-xs text-brand-steel">Outcome</Label>
              <div className="flex flex-wrap gap-1.5">
                {CALL_OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setOutcome(outcome === o.value ? '' : o.value)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium',
                      outcome === o.value
                        ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                        : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {badNumber && (
            <div className="grid gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2.5">
              <Label className="text-xs font-medium text-amber-800">
                Correct number (fixes the contact everywhere)
              </Label>
              <Input
                type="tel"
                value={fixPhone}
                placeholder="(330) 555-0141"
                onChange={(e) => setFixPhone(e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Notes (optional)</Label>
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Follow up in…</Label>
            <div className="flex gap-1.5">
              {(
                [
                  ['', 'No task'],
                  ['1', 'Tomorrow'],
                  ['3', '3 days'],
                  ['7', '1 week'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFollowUp(v)}
                  className={cn(
                    'flex-1 rounded-md border px-1.5 py-1.5 text-xs font-medium',
                    followUp === v
                      ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                      : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {deal.stage === 'lead' && (
            <label className="flex items-center gap-2 text-sm text-brand-black">
              <input
                type="checkbox"
                checked={moveOn}
                onChange={(e) => setMoveOn(e.target.checked)}
                className="h-4 w-4 accent-brand-orange"
              />
              Move to Follow Up
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Dismiss</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save log'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── assignee ─────────────────────────────────────────────────────────

export function AssigneePicker({
  deal,
  team,
  me,
  iAmAdmin,
  className,
}: {
  deal: Deal;
  team: TeamMember[];
  me: string;
  iAmAdmin: boolean;
  className?: string;
}) {
  const { assign } = useDealMutations();
  if (!iAmAdmin) {
    return (
      <span className={cn('text-xs text-brand-steel', className)}>
        {memberName(team, deal.assigned_to)}
      </span>
    );
  }
  return (
    <select
      value={deal.assigned_to ?? ''}
      disabled={assign.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const toEmail = e.target.value || null;
        assign.mutate(
          { deal, toEmail, assigneeName: memberName(team, toEmail), byName: memberName(team, me) },
          {
            onSuccess: () => toast.success(toEmail ? `Assigned to ${memberName(team, toEmail)}` : 'Unassigned'),
            onError: (err) => toast.error('Could not assign', err instanceof Error ? err.message : String(err)),
          }
        );
      }}
      title="Who owns this card"
      className={cn(
        'h-8 cursor-pointer rounded-md border bg-white px-2 text-xs',
        deal.assigned_to ? 'text-brand-black' : 'text-brand-steel',
        className
      )}
    >
      <option value="">Assign to…</option>
      {team.map((t) => (
        <option key={t.email} value={t.email}>
          {t.display_name || t.email}
        </option>
      ))}
    </select>
  );
}

// ── shared dialogs ───────────────────────────────────────────────────

/** On Hold is an overlay: the card keeps its stage, the clock pauses. */
export function HoldDialog({
  deal,
  contact,
  open,
  onOpenChange,
}: {
  deal: Deal;
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(deal.held_until ?? '');
      setNote(deal.hold_note ?? '');
    }
  }, [open, deal.held_until, deal.hold_note]);

  const save = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await updateDeal(deal.id, { held_until: date, hold_note: note.trim() || null });
      await logSystem(contact.id, deal.id, `On hold until ${formatDateUS(date)}${note.trim() ? ` — ${note.trim()}` : ''}`);
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      void refreshLeadBadge();
      toast.success('On hold', `Resurfaces ${formatDateUS(date)}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Put {contact.name} on hold</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Call back on (required)</Label>
            <Input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Why (goes on the timeline)</Label>
            <Input value={note} placeholder='e.g. "call back after harvest"' onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !date}>Put on hold</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Release a hold early (also happens automatically when the date arrives). */
export async function releaseHold(deal: Deal, contact: Contact): Promise<void> {
  await updateDeal(deal.id, { held_until: null, hold_note: null });
  await logSystem(contact.id, deal.id, 'Hold released');
  void refreshLeadBadge();
}

/** Lost requires a reason; the card stays searchable and revivable. */
export function LostDialog({
  deal,
  contact,
  open,
  onOpenChange,
}: {
  deal: Deal;
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { move } = useDealMutations();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [lostTo, setLostTo] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setDetail('');
      setLostTo('');
    }
  }, [open]);

  const save = async () => {
    if (!reason) return;
    try {
      const full = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
      await move.mutateAsync({ deal, to: 'lost', lostReason: full });
      if (lostTo.trim()) await updateDeal(deal.id, { lost_to: lostTo.trim() });
      void refreshLeadBadge();
      toast.success('Marked lost', 'Kept forever — revivable from the Lost filter.');
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Mark {contact.name} lost</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Reason (required)</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Pick a reason…" /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Lost to (competitor / price — optional)</Label>
            <Input value={lostTo} placeholder="Morton @ $210k" onChange={(e) => setLostTo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Detail (optional)</Label>
            <Input value={detail} placeholder="anything future-you should know" onChange={(e) => setDetail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={save} disabled={!reason}>
            Mark lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Won confirms and captures the final contract value. */
export function WonDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { move } = useDealMutations();
  const [finalValue, setFinalValue] = useState('');

  useEffect(() => {
    if (open) setFinalValue(String(Math.round(deal.value)));
  }, [open, deal.value]);

  const save = async () => {
    try {
      const v = Math.max(0, Math.round(Number(finalValue) || 0));
      if (v !== Math.round(deal.value)) await updateDeal(deal.id, { value: v });
      await move.mutateAsync({ deal, to: 'won' });
      toast.success('Won 🎉', formatDollars(v));
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not mark won', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Mark won 🏆</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs text-brand-steel">Final contract value ($)</Label>
          <Input
            inputMode="numeric"
            value={finalValue}
            onChange={(e) => setFinalValue(e.target.value.replace(/[^\d]/g, ''))}
            autoFocus
          />
          <p className="text-xs text-brand-steel">
            Locks commission credit to {deal.assigned_to ?? 'the current assignee'} and counts in
            Reports.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Confirm won</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** ⋯ overflow shared bits: Add task + On hold (Edit/Archive/Delete arrive with their phases). */
export function AddTaskDialog({
  deal,
  contact,
  open,
  onOpenChange,
}: {
  deal: Deal;
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { create } = useTaskMutations();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setDue('');
    }
  }, [open]);

  const save = async () => {
    if (!title.trim()) return;
    try {
      await create.mutateAsync({
        contact_id: contact.id,
        deal_id: deal.id,
        title: title.trim(),
        due_date: due || null,
        ...(deal.assigned_to ? { assigned_to: deal.assigned_to } : {}),
      });
      toast.success('Task added');
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not add task', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Add task — {contact.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Task</Label>
            <Input value={title} placeholder="e.g. send site plan" onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Due (optional)</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!title.trim()}>Add task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
