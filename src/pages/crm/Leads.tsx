// /crm/leads — the triage inbox. Shows only contacts still in the lead
// funnel (new / on hold / contacted) and exists to trend toward empty:
// every lead either becomes a deal (Qualify), waits with a date (Hold),
// leaves the funnel (Move to contacts), or gets disqualified with a reason.
// Speed-to-first-call is the point — every row wears its age.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Briefcase,
  Clock,
  MoreHorizontal,
  PauseCircle,
  Phone,
  Plus,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { NewLeadDialog } from '@/components/crm/NewLeadDialog';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { useContacts, useContactMutations, setLeadStatus } from '@/lib/crm/api/contacts';
import { useDeals, useDealMutations } from '@/lib/crm/api/deals';
import { useTeam, memberName, type TeamMember } from '@/lib/crm/api/team';
import { useLogActivity, logActivity } from '@/lib/crm/api/activities';
import { useLeadBadge, refreshLeadBadge } from '@/lib/crm/leadBadge';
import { LEAD_STATUS_META, SOURCE_LABEL, formatDollars, type Contact, type Deal } from '@/lib/crm/types';
import { formatDateUS } from '@/lib/format';
import { cn } from '@/lib/utils';

/** "12m" / "3h" / "5d" — how long this lead has been waiting. */
function age(iso: string): { label: string; hours: number } {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const hours = mins / 60;
  if (mins < 60) return { label: `${mins}m`, hours };
  if (hours < 48) return { label: `${Math.floor(hours)}h`, hours };
  return { label: `${Math.floor(hours / 24)}d`, hours };
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Leads() {
  const { data: contacts = [], isLoading, error } = useContacts();
  const { data: deals = [] } = useDeals();
  const { data: team = [] } = useTeam();
  const me = useSessionEmail();
  const iAmAdmin = !!team.find((t) => t.email === me)?.is_admin;
  const qc = useQueryClient();
  const badgeCount = useLeadBadge((s) => s.count);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  // The badge polls every minute from anywhere; when it moves while this
  // page is open (a lead just arrived), pull the fresh rows.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
  }, [badgeCount, qc]);

  const live = useMemo(() => contacts.filter((c) => !c.archived), [contacts]);
  const newest = (a: Contact, b: Contact) => b.created_at.localeCompare(a.created_at);
  const fresh = useMemo(() => live.filter((c) => c.lead_status === 'new').sort(newest), [live]);
  const inProgress = useMemo(
    () => live.filter((c) => c.lead_status === 'contacted').sort(newest),
    [live]
  );
  const onHold = useMemo(
    () =>
      live
        .filter((c) => c.lead_status === 'on_hold')
        .sort((a, b) => (a.lead_hold_until ?? '9999').localeCompare(b.lead_hold_until ?? '9999')),
    [live]
  );

  const total = fresh.length + inProgress.length + onHold.length;

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const unassigned = useMemo(
    () =>
      deals
        .filter(
          (d) =>
            !d.assigned_to &&
            !['won', 'lost'].includes(d.stage) &&
            !contactById.get(d.contact_id)?.archived
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [deals, contactById]
  );

  return (
    <div className="pb-20 sm:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-black">Leads</h1>
        {total > 0 && <Badge variant="secondary">{total}</Badge>}
        <div className="flex-1" />
        <Button size="sm" className="hidden sm:inline-flex" onClick={() => setNewLeadOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New lead
        </Button>
      </div>
      <p className="mt-1 text-sm text-brand-steel">
        New inquiries waiting on a first move. Call fast, then{' '}
        <span className="font-medium">Qualify</span> into the pipeline, put{' '}
        <span className="font-medium">On hold</span> with a callback date, or pass. This list
        should trend toward empty.
      </p>

      {error ? (
        <p className="mt-8 text-sm text-red-600">Could not load leads: {String(error)}</p>
      ) : isLoading ? (
        <p className="mt-8 text-sm text-brand-steel">Loading…</p>
      ) : total === 0 ? (
        <div className="mt-8 rounded-lg border bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-brand-black">Inbox zero — no leads waiting.</p>
          <p className="mt-1 text-sm text-brand-steel">
            New inquiries from the website or a teammate land here automatically, with a red
            counter on the CRM tab.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {fresh.length > 0 && (
            <Section title="New" hint="untouched — call these first" tone="red">
              {fresh.map((c) => (
                <LeadRow key={c.id} contact={c} deals={deals} />
              ))}
            </Section>
          )}
          {onHold.length > 0 && (
            <Section title="On hold" hint="waiting on a date or a callback">
              {onHold.map((c) => (
                <LeadRow key={c.id} contact={c} deals={deals} />
              ))}
            </Section>
          )}
          {inProgress.length > 0 && (
            <Section title="Contacted" hint="first touch made — qualify or close out">
              {inProgress.map((c) => (
                <LeadRow key={c.id} contact={c} deals={deals} />
              ))}
            </Section>
          )}
        </div>
      )}

      {iAmAdmin && unassigned.length > 0 && (
        <div className="mt-6">
          <Section title="Unassigned deals" hint="nobody owns these yet — hand them out">
            {unassigned.map((d) => (
              <UnassignedRow key={d.id} deal={d} contact={contactById.get(d.contact_id)} team={team} me={me} />
            ))}
          </Section>
        </div>
      )}

      {/* mobile: floating New-lead button, thumb-reachable */}
      <button
        onClick={() => setNewLeadOpen(true)}
        title="New lead"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange text-white shadow-lg hover:brightness-95 sm:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      <NewLeadDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} />
    </div>
  );
}

/** One unassigned deal with an inline hand-out select (admins only see these). */
function UnassignedRow({
  deal,
  contact,
  team,
  me,
}: {
  deal: Deal;
  contact: Contact | undefined;
  team: TeamMember[];
  me: string;
}) {
  const { assign } = useDealMutations();
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <Link to={`/crm/pipeline?deal=${deal.id}`} className="min-w-0 flex-1 hover:opacity-80">
        <div className="truncate text-sm font-medium text-brand-black">{deal.title}</div>
        <div className="mt-0.5 truncate text-xs text-brand-steel">
          {contact?.name ?? '—'} · {formatDollars(deal.value)}
          {deal.created_via === 'api' && ' · via API'}
        </div>
      </Link>
      <select
        value=""
        disabled={assign.isPending}
        onChange={(e) => {
          const toEmail = e.target.value;
          if (!toEmail) return;
          assign.mutate(
            {
              deal,
              toEmail,
              assigneeName: memberName(team, toEmail),
              byName: memberName(team, me),
            },
            {
              onSuccess: () => toast.success('Assigned', `${deal.title} → ${memberName(team, toEmail)}`),
              onError: (err) =>
                toast.error('Could not assign', err instanceof Error ? err.message : String(err)),
            }
          );
        }}
        className="h-8 shrink-0 cursor-pointer rounded-md border bg-white px-2 text-xs text-brand-black"
      >
        <option value="">Assign to…</option>
        {team.map((t) => (
          <option key={t.email} value={t.email}>
            {t.display_name || t.email}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({
  title,
  hint,
  tone,
  children,
}: {
  title: string;
  hint: string;
  tone?: 'red';
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-brand-black">
        <span className={cn(tone === 'red' && 'text-red-600')}>{title}</span>
        <span className="text-xs font-normal text-brand-steel">{hint}</span>
      </h2>
      <div className="mt-2 overflow-hidden rounded-lg border bg-white shadow-sm">{children}</div>
    </section>
  );
}

function LeadRow({ contact, deals }: { contact: Contact; deals: { id: string; contact_id: string; stage: string }[] }) {
  const log = useLogActivity();
  const qc = useQueryClient();
  const { update: updateContact } = useContactMutations();
  const { create: createDeal } = useDealMutations();
  const [holdOpen, setHoldOpen] = useState(false);
  const [dqOpen, setDqOpen] = useState(false);

  const a = age(contact.created_at);
  const isNew = contact.lead_status === 'new';
  const holdDue = contact.lead_status === 'on_hold' &&
    !!contact.lead_hold_until && contact.lead_hold_until <= todayIso();

  const openDeal = deals.find(
    (d) => d.contact_id === contact.id && !['won', 'lost'].includes(d.stage)
  );

  const logCall = async () => {
    try {
      await log.mutateAsync({ contact_id: contact.id, type: 'call', body: 'Called from Leads inbox' });
      toast.success('Call logged', isNew ? `${contact.name} moved to Contacted.` : undefined);
    } catch (err) {
      toast.error('Could not log call', err instanceof Error ? err.message : String(err));
    }
  };

  const qualify = async () => {
    try {
      if (!openDeal) {
        await createDeal.mutateAsync({
          contact_id: contact.id,
          title: `${contact.name} — new project`,
        });
      } else {
        await setLeadStatus(contact.id, 'qualified');
        qc.invalidateQueries({ queryKey: ['contacts'] });
      }
      toast.success('Qualified', `${contact.name} is in the pipeline${openDeal ? '' : ' at Inquiry'}.`);
    } catch (err) {
      toast.error('Could not qualify', err instanceof Error ? err.message : String(err));
    }
  };

  const makeContact = async () => {
    try {
      await updateContact.mutateAsync({ id: contact.id, patch: { lead_status: 'none', lead_hold_until: null } });
      void refreshLeadBadge();
      toast.success('Moved to Contacts', `${contact.name} left the lead funnel.`);
    } catch (err) {
      toast.error('Could not update', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={cn('border-b px-4 py-3 last:border-b-0', holdDue && 'bg-amber-50')}>
      <div className="flex items-center gap-3">
        <Link to={`/crm/contacts/${contact.id}`} className="min-w-0 flex-1 hover:opacity-80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-brand-black">{contact.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {SOURCE_LABEL[contact.source]}
              {contact.source_detail ? ` · ${contact.source_detail}` : ''}
            </Badge>
            {contact.lead_status === 'on_hold' && contact.lead_hold_until && (
              <span className={cn(
                'flex items-center gap-1 text-[11px]',
                holdDue ? 'font-semibold text-amber-700' : 'text-brand-steel'
              )}>
                <PauseCircle className="h-3 w-3" />
                {holdDue ? 'due — follow up' : `until ${formatDateUS(contact.lead_hold_until)}`}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-brand-steel">
            {[contact.phone, contact.email, contact.address].filter(Boolean).join(' · ')}
          </div>
        </Link>
        <span
          title={`Waiting ${a.label}`}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            isNew && a.hours >= 4 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-brand-steel'
          )}
        >
          <Clock className="h-3 w-3" /> {a.label}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {contact.phone && (
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href={`tel:${contact.phone}`}>
              <Phone className="mr-1.5 h-3.5 w-3.5" /> Call
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8" onClick={logCall} disabled={log.isPending}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Log call
        </Button>
        <Button size="sm" className="h-8" onClick={qualify} disabled={createDeal.isPending}>
          <Briefcase className="mr-1.5 h-3.5 w-3.5" /> Qualify
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setHoldOpen(true)}>
          <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Hold
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 px-2">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/crm/contacts/${contact.id}`}>Open contact</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={makeContact}>
              Move to Contacts (not a sales lead)
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={() => setDqOpen(true)}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Disqualify…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <HoldDialog contact={contact} open={holdOpen} onOpenChange={setHoldOpen} />
      <DisqualifyDialog contact={contact} open={dqOpen} onOpenChange={setDqOpen} />
    </div>
  );
}

function HoldDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { update } = useContactMutations();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setDate(contact.lead_hold_until ?? '');
      setNote('');
    }
  }, [open, contact.lead_hold_until]);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: contact.id,
        patch: { lead_status: 'on_hold', lead_hold_until: date || null },
      });
      if (note.trim() || date) {
        await logActivity({
          contact_id: contact.id,
          type: 'note',
          body: `On hold${date ? ` until ${formatDateUS(date)}` : ''}${note.trim() ? ` — ${note.trim()}` : ''}`,
        });
      }
      void refreshLeadBadge();
      toast.success('On hold', date ? `Resurfaces ${formatDateUS(date)} with a red counter.` : undefined);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Put {contact.name} on hold</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Follow up on (optional)</Label>
            <Input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-brand-steel">
              On that day they light the red counter again. Leave empty to hold indefinitely.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Why (goes on the timeline)</Label>
            <Input
              value={note}
              placeholder='e.g. "call back after harvest"'
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending}>Put on hold</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisqualifyDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { update } = useContactMutations();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: contact.id,
        patch: { lead_status: 'disqualified', lead_hold_until: null },
      });
      await logActivity({
        contact_id: contact.id,
        type: 'note',
        body: `Disqualified${reason.trim() ? ` — ${reason.trim()}` : ''}`,
      });
      void refreshLeadBadge();
      toast.success('Disqualified', 'Kept in Contacts with the reason on the timeline.');
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Disqualify {contact.name}?</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs text-brand-steel">Reason (helps your reports)</Label>
          <Input
            autoFocus
            value={reason}
            placeholder='e.g. "out of area", "budget", "tire-kicker"'
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <p className="text-xs text-brand-steel">
            Nothing is deleted — they stay in Contacts and can come back as a lead any time.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={save} disabled={update.isPending}>
            Disqualify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
