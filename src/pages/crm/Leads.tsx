// /crm/leads — the triage inbox, now a filtered view of THE pipeline itself:
// every row is the same card (same deal ID) that runs Lead → Won. No
// promotion, no conversion — Advance simply moves the card to Follow Up.
// On Hold is an overlay (stage stays, clock pauses until the callback date);
// Lost requires a reason. Admin territory — reps live in My Leads.
// All row actions are the SHARED CardActions components — identical code
// paths to the board card face and the opened drawer.
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, MoreHorizontal, PauseCircle, Phone, Plus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { NewLeadDialog } from '@/components/crm/NewLeadDialog';
import {
  AdvanceButton,
  AssigneePicker,
  HoldDialog,
  LogButton,
  LostDialog,
  todayIso,
} from '@/components/crm/CardActions';
import { useSessionEmail } from '@/lib/crm/session';
import { agingFor, hoursLabel, useCrmSettings, DEFAULT_CRM_SETTINGS, type CrmSettings } from '@/lib/crm/aging';
import { useContacts } from '@/lib/crm/api/contacts';
import { useDeals, useDealMutations } from '@/lib/crm/api/deals';
import { useTeam, memberName, type TeamMember } from '@/lib/crm/api/team';
import { useLeadBadge } from '@/lib/crm/leadBadge';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/crm/phone';
import { SOURCE_LABEL, formatDollars, type Contact, type Deal } from '@/lib/crm/types';
import { formatDateUS } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Leads() {
  const { data: contacts = [], isLoading, error } = useContacts();
  const { data: deals = [], isLoading: dealsLoading } = useDeals();
  const { data: team = [] } = useTeam();
  const me = useSessionEmail();
  const iAmAdmin = !!team.find((t) => t.email === me)?.is_admin;
  const qc = useQueryClient();
  const badgeCount = useLeadBadge((s) => s.count);
  const { data: crmSettings = DEFAULT_CRM_SETTINGS } = useCrmSettings();
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  // when the badge moves while this page is open (a lead just arrived), refetch
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['deals'] });
    qc.invalidateQueries({ queryKey: ['contacts'] });
  }, [badgeCount, qc]);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const leadCards = useMemo(
    () =>
      deals
        .filter((d) => {
          if (d.stage !== 'lead' || d.archived_at) return false;
          const c = contactById.get(d.contact_id);
          return !!c && !c.archived;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [deals, contactById]
  );
  const today = todayIso();
  const active = leadCards
    .filter((d) => !d.held_until || d.held_until <= today)
    .sort((a, b) => {
      const la = agingFor(a, crmSettings).level;
      const lb = agingFor(b, crmSettings).level;
      const w = (l: string) => (l === 'red' ? 0 : l === 'amber' ? 1 : 2);
      if (w(la) !== w(lb)) return w(la) - w(lb);
      return b.created_at.localeCompare(a.created_at);
    });
  const onHold = leadCards.filter((d) => d.held_until && d.held_until > today);

  const unassigned = useMemo(
    () =>
      deals
        .filter((d) => {
          if (d.assigned_to || d.archived_at || ['won', 'lost', 'lead'].includes(d.stage)) return false;
          const c = contactById.get(d.contact_id);
          return !!c && !c.archived;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [deals, contactById]
  );

  if (team.length > 0 && me && !iAmAdmin) return <Navigate to="/crm/my" replace />;

  return (
    <div className="pb-20 sm:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-black">Leads</h1>
        {active.length > 0 && <Badge variant="secondary">{active.length}</Badge>}
        <div className="flex-1" />
        <Button size="sm" className="hidden sm:inline-flex" onClick={() => setNewLeadOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New lead
        </Button>
      </div>
      <p className="mt-1 text-sm text-brand-steel">
        New inquiries waiting on a first move — the same cards that run the pipeline, sitting at
        the <span className="font-medium">Lead</span> stage. Call fast, then{' '}
        <span className="font-medium">Advance</span> to Follow Up, put{' '}
        <span className="font-medium">On hold</span> with a callback date, or mark it lost. This
        list should trend toward empty.
      </p>

      {error ? (
        <p className="mt-8 text-sm text-red-600">Could not load leads: {String(error)}</p>
      ) : isLoading || dealsLoading ? (
        <p className="mt-8 text-sm text-brand-steel">Loading…</p>
      ) : active.length === 0 && onHold.length === 0 ? (
        <div className="mt-8 rounded-lg border bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-brand-black">Inbox zero — no leads waiting.</p>
          <p className="mt-1 text-sm text-brand-steel">
            New inquiries from the website land here automatically, with a red counter on the CRM
            tab.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {active.length > 0 && (
            <Section title="Lead" hint="untouched — call these first" tone="red">
              {active.map((d) => (
                <LeadRow key={d.id} deal={d} contact={contactById.get(d.contact_id)} team={team} me={me} iAmAdmin={iAmAdmin} settings={crmSettings} />
              ))}
            </Section>
          )}
          {onHold.length > 0 && (
            <Section title="On hold" hint="clock paused until the callback date">
              {onHold.map((d) => (
                <LeadRow key={d.id} deal={d} contact={contactById.get(d.contact_id)} team={team} me={me} iAmAdmin={iAmAdmin} settings={crmSettings} />
              ))}
            </Section>
          )}
        </div>
      )}

      {iAmAdmin && unassigned.length > 0 && (
        <div className="mt-6">
          <Section title="Unassigned deals" hint="past the Lead stage but nobody owns them">
            {unassigned.map((d) => (
              <UnassignedRow key={d.id} deal={d} contact={contactById.get(d.contact_id)} team={team} me={me} />
            ))}
          </Section>
        </div>
      )}

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

function LeadRow({
  deal,
  contact,
  team,
  me,
  iAmAdmin,
  settings,
}: {
  deal: Deal;
  contact: Contact | undefined;
  team: TeamMember[];
  me: string;
  iAmAdmin: boolean;
  settings: CrmSettings;
}) {
  const [holdOpen, setHoldOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  if (!contact) return null;
  const aging = agingFor(deal, settings);
  const held = !!deal.held_until && deal.held_until > todayIso();
  const phoneOk = isValidPhone(contact.phone);

  return (
    <div className="border-b px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <Link to={`/crm/pipeline?deal=${deal.id}`} className="min-w-0 flex-1 hover:opacity-80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-brand-black">{contact.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {SOURCE_LABEL[contact.source]}
              {contact.source_detail ? ` \u00b7 ${contact.source_detail}` : ''}
            </Badge>
            {held && deal.held_until && (
              <span className="flex items-center gap-1 text-[11px] text-brand-steel">
                <PauseCircle className="h-3 w-3" /> until {formatDateUS(deal.held_until)}
              </span>
            )}
            {deal.value > 0 && (
              <span className="text-[11px] font-semibold text-brand-black">{formatDollars(deal.value)}</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-brand-steel">
            {[phoneOk ? formatPhone(contact.phone) : contact.phone, contact.email, contact.address]
              .filter(Boolean)
              .join(' \u00b7 ')}
          </div>
        </Link>
        <span
          title={held ? 'Clock paused — on hold' : `Waiting ${hoursLabel(aging.hoursIn)}`}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            aging.level === 'red' ? 'bg-red-100 text-red-700'
            : aging.level === 'amber' ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-brand-steel'
          )}
        >
          <Clock className="h-3 w-3" /> {hoursLabel(aging.hoursIn)}
        </span>
      </div>
      {/* the same shared action components the board card and drawer use */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {phoneOk && (
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href={`tel:${normalizePhone(contact.phone)}`}>
              <Phone className="mr-1.5 h-3.5 w-3.5" /> Call
            </a>
          </Button>
        )}
        <LogButton deal={deal} contact={contact} />
        <AdvanceButton deal={deal} />
        <Button variant="outline" size="sm" className="h-8" onClick={() => setHoldOpen(true)}>
          <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Hold
        </Button>
        <AssigneePicker deal={deal} team={team} me={me} iAmAdmin={iAmAdmin} />
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
            <DropdownMenuItem className="text-red-600" onClick={() => setLostOpen(true)}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Mark lost\u2026
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <HoldDialog deal={deal} contact={contact} open={holdOpen} onOpenChange={setHoldOpen} />
      <LostDialog deal={deal} contact={contact} open={lostOpen} onOpenChange={setLostOpen} />
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
            { deal, toEmail, assigneeName: memberName(team, toEmail), byName: memberName(team, me) },
            {
              onSuccess: () => toast.success('Assigned', `${deal.title} → ${memberName(team, toEmail)}`),
              onError: (err) => toast.error('Could not assign', err instanceof Error ? err.message : String(err)),
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
