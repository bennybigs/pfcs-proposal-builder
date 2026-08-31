// /crm/pipeline — kanban by stage. Drag with dnd-kit (touch sensor with an
// activation delay so phones can still scroll), plus a Move-to select on
// every card as the no-drag fallback.
// DECISION: on mobile the columns scroll horizontally with scroll-snap
// (chosen over stage tabs — you can still see neighboring stages).
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Clock, MessageSquare, MoreHorizontal, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { DealDrawer } from '@/components/crm/DealDrawer';
import {
  AddTaskDialog,
  AssigneePicker,
  HoldDialog,
  LogButton,
  LostDialog,
  ArchiveDealDialog,
  restoreDeal,
  ReminderDialog,
  StageChipControl,
} from '@/components/crm/CardActions';
import { agingFor, agingWeight, hoursLabel, useCrmSettings, DEFAULT_CRM_SETTINGS, type Aging } from '@/lib/crm/aging';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/crm/phone';
import { formatDateUS } from '@/lib/format';
import { useContacts } from '@/lib/crm/api/contacts';
import { useDeals, useDealMutations } from '@/lib/crm/api/deals';
import { useTeam, memberName } from '@/lib/crm/api/team';
import { useSessionEmail } from '@/lib/crm/session';
import { useRecentActivities } from '@/lib/crm/api/activities';
import { useTasks } from '@/lib/crm/api/tasks';
import { goneQuietDealIds } from '@/lib/crm/health';
import {
  OPEN_STAGES,
  SEGMENTS,
  SEGMENT_META,
  SOURCE_LABEL,
  STAGES,
  STAGE_META,
  daysBetween,
  formatDollars,
  type Contact,
  type Deal,
  type DealSegment,
  type DealStage,
} from '@/lib/crm/types';
import type { TeamMember } from '@/lib/crm/api/team';
import { cn } from '@/lib/utils';

export default function Pipeline() {
  const { data: deals = [], isLoading } = useDeals();
  const { data: contacts = [] } = useContacts();
  const { data: activities = [] } = useRecentActivities();
  const { data: tasks = [] } = useTasks();
  const { move } = useDealMutations();
  const [params, setParams] = useSearchParams();
  const [dragging, setDragging] = useState<Deal | null>(null);
  const [segment, setSegment] = useState<DealSegment | null>(null);
  const { data: team = [] } = useTeam();
  const me = useSessionEmail();
  const iAmAdmin = !!team.find((t) => t.email === me)?.is_admin;
  const { data: crmSettings = DEFAULT_CRM_SETTINGS } = useCrmSettings();
  // '' = everyone, '__unassigned__' = nobody, else a member email
  const [assignee, setAssignee] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  // archived cards/contacts take their deals off the board and out of the numbers
  const archivedDeals = useMemo(() => deals.filter((d) => d.archived_at), [deals]);
  // the board shows live cards; the Archived view shows the put-away ones
  const activeDeals = useMemo(
    () =>
      deals.filter((d) =>
        showArchived
          ? !!d.archived_at
          : !d.archived_at && !contactById.get(d.contact_id)?.archived
      ),
    [deals, contactById, showArchived]
  );
  const quiet = useMemo(() => goneQuietDealIds(activeDeals, activities, tasks), [activeDeals, activities, tasks]);

  // every card's clock, from the shared settings — the same math the cron runs
  const agingMap = useMemo(() => {
    const m = new Map<string, Aging>();
    for (const d of activeDeals) m.set(d.id, agingFor(d, crmSettings));
    return m;
  }, [activeDeals, crmSettings]);
  const attentionCount = useMemo(
    () => activeDeals.filter((d) => ['amber', 'red'].includes(agingMap.get(d.id)?.level ?? '')).length,
    [activeDeals, agingMap]
  );

  const visible = useMemo(
    () =>
      activeDeals.filter((d) => {
        if (segment && d.segment !== segment) return false;
        if (attentionOnly && !['amber', 'red'].includes(agingMap.get(d.id)?.level ?? '')) return false;
        if (assignee === '__unassigned__') return !d.assigned_to;
        if (assignee) return d.assigned_to === assignee;
        return true;
      }),
    [activeDeals, segment, assignee, attentionOnly, agingMap]
  );
  const byStage = useMemo(() => {
    const m = new Map<DealStage, Deal[]>(STAGES.map((s) => [s, []]));
    // a card can arrive wearing a retired stage (written by a stale tab
    // running old code) — bucket it into the mapped column, never crash
    const normalize = (s: DealStage): DealStage =>
      m.has(s) ? s : s === 'site_visit_scheduled' ? 'site_visit' : 'lead';
    for (const d of visible) m.get(normalize(d.stage))!.push(d);
    for (const list of m.values())
      // red floats to the top of its column, then amber, then oldest-in-stage
      list.sort((a, b) => {
        const wa = agingWeight(agingMap.get(a.id)?.level ?? 'ok');
        const wb = agingWeight(agingMap.get(b.id)?.level ?? 'ok');
        if (wa !== wb) return wa - wb;
        return new Date(a.stage_entered_at).getTime() - new Date(b.stage_entered_at).getTime();
      });
    return m;
  }, [visible, agingMap]);

  // dashboard strip
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearAgo = new Date(now);
    yearAgo.setFullYear(now.getFullYear() - 1);
    // Lead cards are usually $0 and would inflate the number — count them,
    // never sum them; everywhere else show raw + probability-weighted
    const leadCount = (byStage.get('lead') ?? []).length;
    const openByStage = OPEN_STAGES.filter((s) => s !== 'lead').map((s) => ({
      stage: s,
      total: (byStage.get(s) ?? []).reduce((n, d) => n + d.value, 0),
      weighted: (byStage.get(s) ?? []).reduce((n, d) => n + (d.value * d.probability) / 100, 0),
      count: (byStage.get(s) ?? []).length,
    }));
    const wonThisMonth = activeDeals
      .filter((d) => d.stage === 'won' && new Date(d.stage_entered_at) >= monthStart)
      .reduce((n, d) => n + d.value, 0);
    const closed12 = activeDeals.filter(
      (d) => (d.stage === 'won' || d.stage === 'lost') && new Date(d.stage_entered_at) >= yearAgo
    );
    const won12 = closed12.filter((d) => d.stage === 'won').length;
    const winRate = closed12.length ? Math.round((won12 / closed12.length) * 100) : null;
    return { leadCount, openByStage, wonThisMonth, winRate, quietCount: quiet.size };
  }, [activeDeals, byStage, quiet]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const onDragStart = (e: DragStartEvent) => {
    setDragging(deals.find((d) => d.id === e.active.id) ?? null);
  };
  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const deal = deals.find((d) => d.id === e.active.id);
    const to = e.over?.id as DealStage | undefined;
    if (!deal || !to || !STAGES.includes(to) || deal.stage === to) return;
    try {
      await move.mutateAsync({ deal, to });
      toast.success(`${STAGE_META[deal.stage].label} → ${STAGE_META[to].label}`);
    } catch (err) {
      toast.error('Could not move deal', err instanceof Error ? err.message : String(err));
    }
  };

  const openDealId = params.get('deal');
  const openDeal = deals.find((d) => d.id === openDealId) ?? null;
  const closeDrawer = () => {
    params.delete('deal');
    setParams(params, { replace: true });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-black">Pipeline</h1>
        {archivedDeals.length > 0 && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-semibold',
              showArchived
                ? 'border-brand-steel bg-brand-gray-light text-brand-black'
                : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
            )}
          >
            Archived ({archivedDeals.length})
          </button>
        )}
        {!showArchived && attentionCount > 0 && (
          <button
            onClick={() => setAttentionOnly(!attentionOnly)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-semibold',
              attentionOnly
                ? 'border-red-500 bg-red-100 text-red-700'
                : 'border-red-200 bg-white text-red-600 hover:bg-red-50'
            )}
          >
            ⚠ Needs attention ({attentionCount})
          </button>
        )}
        <div className="flex-1" />
        {iAmAdmin && team.length > 1 && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            title="Filter by assignee"
            className="h-7 cursor-pointer rounded-full border border-gray-200 bg-white px-2 text-xs font-medium text-brand-steel"
          >
            <option value="">Everyone</option>
            <option value="__unassigned__">Unassigned</option>
            {team.map((t) => (
              <option key={t.email} value={t.email}>
                {t.display_name || t.email}
              </option>
            ))}
          </select>
        )}
        {SEGMENTS.map((s) => (
          <button
            key={s}
            onClick={() => setSegment(segment === s ? null : s)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium',
              segment === s
                ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
            )}
          >
            {SEGMENT_META[s].short}
          </button>
        ))}
      </div>

      {/* dashboard strip */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-xs">
        <div className="shrink-0 rounded-md border bg-white px-3 py-1.5 shadow-sm">
          <div className="font-semibold text-brand-black">{stats.leadCount}</div>
          <div className="text-brand-steel">Leads (count)</div>
        </div>
        {stats.openByStage.map(({ stage, total, weighted, count }) => (
          <div key={stage} className="shrink-0 rounded-md border bg-white px-3 py-1.5 shadow-sm">
            <div className="font-semibold text-brand-black">
              {formatDollars(total)}
              <span className="ml-1 font-normal text-brand-steel" title="Probability-weighted">
                · w {formatDollars(weighted)}
              </span>
            </div>
            <div className="text-brand-steel">
              {STAGE_META[stage].label} ({count})
            </div>
          </div>
        ))}
        <div className="shrink-0 rounded-md border bg-green-50 px-3 py-1.5 shadow-sm">
          <div className="font-semibold text-green-700">{formatDollars(stats.wonThisMonth)}</div>
          <div className="text-green-700/70">Won this month</div>
        </div>
        <div className="shrink-0 rounded-md border bg-white px-3 py-1.5 shadow-sm">
          <div className="font-semibold text-brand-black">
            {stats.winRate === null ? '—' : `${stats.winRate}%`}
          </div>
          <div className="text-brand-steel">Win rate (12 mo)</div>
        </div>
        {stats.quietCount > 0 && (
          <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 shadow-sm">
            <div className="font-semibold text-amber-700">{stats.quietCount}</div>
            <div className="text-amber-700/70">Gone quiet</div>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-brand-steel">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                deals={byStage.get(stage) ?? []}
                contactOf={(id) => contactById.get(id)}
                team={team}
                me={me}
                iAmAdmin={iAmAdmin}
                quiet={quiet}
                agingOf={(id) => agingMap.get(id)}
                onOpen={(d) => {
                  params.set('deal', d.id);
                  setParams(params, { replace: true });
                }}
              />
            ))}
          </div>
          <DragOverlay>
            {dragging && (
              <div className="w-60 rotate-2 rounded-md border bg-white p-2.5 shadow-lg">
                <div className="text-sm font-medium">{dragging.title}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <DealDrawer
        deal={openDeal}
        contact={openDeal ? contactById.get(openDeal.contact_id) : undefined}
        onClose={closeDrawer}
      />
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  contactOf,
  team,
  me,
  iAmAdmin,
  quiet,
  agingOf,
  onOpen,
}: {
  stage: DealStage;
  deals: Deal[];
  contactOf: (contactId: string) => Contact | undefined;
  team: TeamMember[];
  me: string;
  iAmAdmin: boolean;
  quiet: Set<string>;
  agingOf: (dealId: string) => Aging | undefined;
  onOpen: (deal: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((n, d) => n + d.value, 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-64 shrink-0 snap-start rounded-lg border bg-white/60 p-2',
        isOver && 'border-brand-orange bg-brand-orange/5'
      )}
    >
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STAGE_META[stage].color)}>
          {STAGE_META[stage].label}
        </span>
        <span className="text-xs text-brand-steel">{deals.length}</span>
        {/* Lead column shows a count only — untouched inquiries don't inflate totals */}
        {stage !== 'lead' && (
          <span className="ml-auto text-xs font-medium text-brand-steel">{formatDollars(total)}</span>
        )}
      </div>
      <div className="grid min-h-16 gap-2">
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            contact={contactOf(d.contact_id)}
            team={team}
            me={me}
            iAmAdmin={iAmAdmin}
            quiet={quiet.has(d.id)}
            aging={agingOf(d.id)}
            onOpen={() => onOpen(d)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The card face: every field is directly actionable (stage chip, Advance,
 * Call/Text/Log, assignee, ⋯) — the same shared components the drawer uses,
 * so acting here or inside the opened card is the same code path.
 */
function DealCard({
  deal,
  contact,
  team,
  me,
  iAmAdmin,
  quiet,
  aging,
  onOpen,
}: {
  deal: Deal;
  contact: Contact | undefined;
  team: TeamMember[];
  me: string;
  iAmAdmin: boolean;
  quiet: boolean;
  aging: Aging | undefined;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const held = !!deal.held_until && deal.held_until > new Date().toISOString().slice(0, 10);
  const phoneOk = contact ? isValidPhone(contact.phone) : false;
  const open = !['won', 'lost'].includes(deal.stage);
  const [holdOpen, setHoldOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const qc = useQueryClient();
  const level = aging?.level ?? 'ok';
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn('rounded-md border bg-white p-2.5 shadow-sm', isDragging && 'opacity-40', held && 'opacity-70')}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={onOpen}
        className="block w-full cursor-grab text-left active:cursor-grabbing"
      >
        <div className="text-sm font-medium text-brand-black">{deal.title}</div>
        <div className="mt-0.5 truncate text-xs text-brand-steel">
          {contact?.name ?? '—'}
          {contact?.address ? ` · ${contact.address.split(',').slice(-1)[0].trim()}` : ''}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-brand-black">{formatDollars(deal.value)}</span>
          <Badge variant="secondary" className="text-[10px]">{SEGMENT_META[deal.segment].short}</Badge>
          {contact && (
            <Badge variant="outline" className="text-[10px]">{SOURCE_LABEL[contact.source]}</Badge>
          )}
          <span
            title={
              level === 'paused' ? 'Clock paused — on hold'
              : deal.reminder_at ? 'Custom reminder set'
              : 'Time in current stage'
            }
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
              level === 'red' ? 'bg-red-100 text-red-700'
              : level === 'amber' ? 'bg-amber-100 text-amber-700'
              : 'text-brand-steel'
            )}
          >
            <Clock className="h-3 w-3" /> {hoursLabel(aging?.hoursIn ?? 0)}
            {deal.reminder_at && <span title="Reminder set">🔔</span>}
          </span>
          {held && deal.held_until && (
            <Badge className="bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100">
              hold → {formatDateUS(deal.held_until)}
            </Badge>
          )}
          {quiet && (
            <Badge className="bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100">gone quiet</Badge>
          )}
        </div>
      </button>
      {/* action row — same shared components as the drawer */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StageChipControl deal={deal} contact={contact} />
        {contact && phoneOk && (
          <a
            href={`tel:${normalizePhone(contact.phone)}`}
            onClick={(e) => e.stopPropagation()}
            title={`Call ${formatPhone(contact.phone)}`}
            className="rounded-md border p-1.5 text-brand-steel hover:bg-brand-orange/10 hover:text-brand-orange"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {contact && phoneOk && (
          <a
            href={`sms:${normalizePhone(contact.phone)}`}
            onClick={(e) => e.stopPropagation()}
            title="Text"
            className="rounded-md border p-1.5 text-brand-steel hover:bg-brand-orange/10 hover:text-brand-orange"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </a>
        )}
        {contact && <LogButton deal={deal} contact={contact} label="" size="sm" className="h-7 px-2" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="rounded-md border p-1.5 text-brand-steel hover:bg-brand-gray-bg"
              title="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onOpen}>Edit / open card</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTaskOpen(true)}>Add task…</DropdownMenuItem>
            {open && <DropdownMenuItem onClick={() => setRemindOpen(true)}>Set reminder…</DropdownMenuItem>}
            {open && <DropdownMenuItem onClick={() => setHoldOpen(true)}>On hold…</DropdownMenuItem>}
            {open && (
              <DropdownMenuItem className="text-red-600" onClick={() => setLostOpen(true)}>
                Mark lost…
              </DropdownMenuItem>
            )}
            {deal.archived_at ? (
              <DropdownMenuItem
                onClick={async () => {
                  if (!contact) return;
                  try {
                    await restoreDeal(deal, contact);
                    qc.invalidateQueries({ queryKey: ['deals'] });
                    toast.success('Restored to the board');
                  } catch (err) {
                    toast.error('Could not restore', err instanceof Error ? err.message : String(err));
                  }
                }}
              >
                Restore from archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setArchiveOpen(true)}>Archive…</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {iAmAdmin && (
        <div className="mt-1.5">
          <AssigneePicker deal={deal} team={team} me={me} iAmAdmin={iAmAdmin} className="h-7 w-full" />
        </div>
      )}
      {contact && (
        <>
          <HoldDialog deal={deal} contact={contact} open={holdOpen} onOpenChange={setHoldOpen} />
          <LostDialog deal={deal} contact={contact} open={lostOpen} onOpenChange={setLostOpen} />
          <AddTaskDialog deal={deal} contact={contact} open={taskOpen} onOpenChange={setTaskOpen} />
          <ReminderDialog deal={deal} contact={contact} open={remindOpen} onOpenChange={setRemindOpen} />
          <ArchiveDealDialog deal={deal} contact={contact} open={archiveOpen} onOpenChange={setArchiveOpen} />
        </>
      )}
    </div>
  );
}
