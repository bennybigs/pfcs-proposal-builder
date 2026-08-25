// /crm/my — everything assigned to the signed-in member, grouped by stage,
// with last-touch and overdue-task flags. Non-admins land here by default
// (CrmHome below); admins keep the Contacts landing.
import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertTriangle, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Contacts from '@/pages/crm/Contacts';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { useContacts } from '@/lib/crm/api/contacts';
import { useDeals } from '@/lib/crm/api/deals';
import { useRecentActivities } from '@/lib/crm/api/activities';
import { useTasks } from '@/lib/crm/api/tasks';
import { useTeam } from '@/lib/crm/api/team';
import {
  SEGMENT_META,
  STAGES,
  STAGE_META,
  daysBetween,
  formatDollars,
  type Deal,
  type DealStage,
} from '@/lib/crm/types';
import { formatDateUS } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Index route: reps land on My Leads, admins on Contacts. */
export function CrmHome() {
  const me = useSessionEmail();
  const { data: team } = useTeam();
  const mine = team?.find((t) => t.email === me);
  if (mine && !mine.is_admin) return <Navigate to="/crm/my" replace />;
  return <Contacts />;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function MyLeads() {
  const me = useSessionEmail();
  const { data: deals = [], isLoading } = useDeals();
  const { data: contacts = [] } = useContacts();
  const { data: activities = [] } = useRecentActivities();
  const { data: tasks = [] } = useTasks();

  const contactName = useMemo(() => {
    const m = new Map(contacts.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [contacts]);

  const mine = useMemo(() => deals.filter((d) => d.assigned_to === me), [deals, me]);
  const open = useMemo(() => mine.filter((d) => !['won', 'lost'].includes(d.stage)), [mine]);
  const closed = useMemo(
    () =>
      mine
        .filter((d) => ['won', 'lost'].includes(d.stage))
        .sort((a, b) => b.stage_entered_at.localeCompare(a.stage_entered_at))
        .slice(0, 5),
    [mine]
  );

  const lastTouch = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activities) {
      if (a.deal_id && !m.has(a.deal_id)) m.set(a.deal_id, a.happened_at); // newest first
    }
    return m;
  }, [activities]);

  const today = todayIso();
  const overdueByDeal = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.done || !t.due_date || t.due_date >= today || !t.deal_id) continue;
      m.set(t.deal_id, (m.get(t.deal_id) ?? 0) + 1);
    }
    return m;
  }, [tasks, today]);

  const byStage = useMemo(() => {
    const m = new Map<DealStage, Deal[]>();
    for (const d of open) {
      const list = m.get(d.stage) ?? [];
      list.push(d);
      m.set(d.stage, list);
    }
    for (const list of m.values())
      list.sort((a, b) => a.stage_entered_at.localeCompare(b.stage_entered_at));
    return m;
  }, [open]);

  const pipelineValue = open.reduce((n, d) => n + d.value, 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-xl font-bold text-brand-black">My Leads</h1>
        {open.length > 0 && (
          <span className="text-sm text-brand-steel">
            {open.length} open · {formatDollars(pipelineValue)}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-brand-steel">Loading…</p>
      ) : open.length === 0 && closed.length === 0 ? (
        <div className="mt-8 rounded-lg border bg-white p-8 text-center shadow-sm">
          <Briefcase className="mx-auto h-6 w-6 text-brand-steel/50" />
          <p className="mt-2 font-medium text-brand-black">Nothing assigned to you yet.</p>
          <p className="mt-1 text-sm text-brand-steel">
            When a deal is assigned to you, it shows up here and you get a notification.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {STAGES.filter((s) => byStage.has(s)).map((stage) => (
            <section key={stage}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-black">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px]', STAGE_META[stage].color)}>
                  {STAGE_META[stage].label}
                </span>
                <span className="text-xs font-normal text-brand-steel">
                  {byStage.get(stage)!.length} · {formatDollars(byStage.get(stage)!.reduce((n, d) => n + d.value, 0))}
                </span>
              </h2>
              <div className="mt-2 overflow-hidden rounded-lg border bg-white shadow-sm">
                {byStage.get(stage)!.map((d) => {
                  const touch = lastTouch.get(d.id);
                  const overdue = overdueByDeal.get(d.id) ?? 0;
                  return (
                    <Link
                      key={d.id}
                      to={`/crm/pipeline?deal=${d.id}`}
                      className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-brand-gray-bg"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-brand-black">{d.title}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {SEGMENT_META[d.segment].short}
                          </Badge>
                          {overdue > 0 && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600">
                              <AlertTriangle className="h-3 w-3" />
                              {overdue} overdue task{overdue === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-brand-steel">
                          {contactName(d.contact_id)} · {daysBetween(d.stage_entered_at)}d in stage
                          {touch ? ` · last touch ${formatDateUS(touch)}` : ' · no activity yet'}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-brand-black">
                        {formatDollars(d.value)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          {closed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-brand-black">Recently closed</h2>
              <div className="mt-2 overflow-hidden rounded-lg border bg-white shadow-sm opacity-80">
                {closed.map((d) => (
                  <Link
                    key={d.id}
                    to={`/crm/pipeline?deal=${d.id}`}
                    className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0 hover:bg-brand-gray-bg"
                  >
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px]', STAGE_META[d.stage].color)}>
                      {STAGE_META[d.stage].label}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="shrink-0 font-medium">{formatDollars(d.value)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
