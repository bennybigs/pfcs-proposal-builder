// /crm/pipeline — kanban by stage. Drag with dnd-kit (touch sensor with an
// activation delay so phones can still scroll), plus a Move-to select on
// every card as the no-drag fallback.
// DECISION: on mobile the columns scroll horizontally with scroll-snap
// (chosen over stage tabs — you can still see neighboring stages).
import { useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { DealDrawer } from '@/components/crm/DealDrawer';
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
  STAGES,
  STAGE_META,
  daysBetween,
  formatDollars,
  type Deal,
  type DealSegment,
  type DealStage,
} from '@/lib/crm/types';
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
  // '' = everyone, '__unassigned__' = nobody, else a member email
  const [assignee, setAssignee] = useState('');

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  // archived contacts take their deals off the board and out of the numbers
  const activeDeals = useMemo(
    () => deals.filter((d) => !contactById.get(d.contact_id)?.archived),
    [deals, contactById]
  );
  const quiet = useMemo(() => goneQuietDealIds(activeDeals, activities, tasks), [activeDeals, activities, tasks]);

  const visible = useMemo(
    () =>
      activeDeals.filter((d) => {
        if (segment && d.segment !== segment) return false;
        if (assignee === '__unassigned__') return !d.assigned_to;
        if (assignee) return d.assigned_to === assignee;
        return true;
      }),
    [activeDeals, segment, assignee]
  );
  const byStage = useMemo(() => {
    const m = new Map<DealStage, Deal[]>(STAGES.map((s) => [s, []]));
    for (const d of visible) m.get(d.stage)!.push(d);
    for (const list of m.values())
      list.sort((a, b) => new Date(a.stage_entered_at).getTime() - new Date(b.stage_entered_at).getTime());
    return m;
  }, [visible]);

  // dashboard strip
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearAgo = new Date(now);
    yearAgo.setFullYear(now.getFullYear() - 1);
    const openByStage = OPEN_STAGES.map((s) => ({
      stage: s,
      total: (byStage.get(s) ?? []).reduce((n, d) => n + d.value, 0),
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
    return { openByStage, wonThisMonth, winRate, quietCount: quiet.size };
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
        {stats.openByStage.map(({ stage, total, count }) => (
          <div key={stage} className="shrink-0 rounded-md border bg-white px-3 py-1.5 shadow-sm">
            <div className="font-semibold text-brand-black">{formatDollars(total)}</div>
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
                contactName={(id) => contactById.get(id)?.name ?? '—'}
                assigneeName={(email) => (email ? memberName(team, email) : null)}
                quiet={quiet}
                onOpen={(d) => {
                  params.set('deal', d.id);
                  setParams(params, { replace: true });
                }}
                onMove={(d, to) => move.mutate({ deal: d, to })}
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
  contactName,
  assigneeName,
  quiet,
  onOpen,
  onMove,
}: {
  stage: DealStage;
  deals: Deal[];
  contactName: (contactId: string) => string;
  assigneeName: (email: string | null) => string | null;
  quiet: Set<string>;
  onOpen: (deal: Deal) => void;
  onMove: (deal: Deal, to: DealStage) => void;
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
        <span className="ml-auto text-xs font-medium text-brand-steel">{formatDollars(total)}</span>
      </div>
      <div className="grid min-h-16 gap-2">
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            contactName={contactName(d.contact_id)}
            assignee={assigneeName(d.assigned_to)}
            quiet={quiet.has(d.id)}
            onOpen={() => onOpen(d)}
            onMove={(to) => onMove(d, to)}
          />
        ))}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  contactName,
  assignee,
  quiet,
  onOpen,
  onMove,
}: {
  deal: Deal;
  contactName: string;
  assignee: string | null;
  quiet: boolean;
  onOpen: () => void;
  onMove: (to: DealStage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const days = daysBetween(deal.stage_entered_at);
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn('rounded-md border bg-white p-2.5 shadow-sm', isDragging && 'opacity-40')}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={onOpen}
        className="block w-full cursor-grab text-left active:cursor-grabbing"
      >
        <div className="text-sm font-medium text-brand-black">{deal.title}</div>
        <div className="mt-0.5 text-xs text-brand-steel">{contactName}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-brand-black">{formatDollars(deal.value)}</span>
          <Badge variant="secondary" className="text-[10px]">{SEGMENT_META[deal.segment].short}</Badge>
          <span className="text-brand-steel">
            {days}d in stage
          </span>
          {assignee && (
            <Badge variant="outline" className="text-[10px]" title={`Assigned to ${assignee}`}>
              {assignee}
            </Badge>
          )}
          {quiet && (
            <Badge className="bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100">gone quiet</Badge>
          )}
        </div>
      </button>
      <div className="mt-1.5">
        <Select value={deal.stage} onValueChange={(v) => onMove(v as DealStage)}>
          <SelectTrigger className="h-7 text-xs" onClick={(e) => e.stopPropagation()}>
            <SelectValue placeholder="Move to…" />
          </SelectTrigger>
          <SelectContent>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
