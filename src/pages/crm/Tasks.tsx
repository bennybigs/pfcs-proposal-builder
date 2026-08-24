// /crm/tasks — "My day": Overdue / Today / Next 7 days / Later, a mine-vs-
// everyone toggle, and a quick-add row. Completing a task logs an activity
// (see api/tasks.ts).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { useContacts } from '@/lib/crm/api/contacts';
import { useDeals } from '@/lib/crm/api/deals';
import { useTasks, useTaskMutations } from '@/lib/crm/api/tasks';
import { formatDateUS } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/crm/types';

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function Tasks() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: contacts = [] } = useContacts();
  const { data: deals = [] } = useDeals();
  const { create, complete, reopen, remove } = useTaskMutations();
  const myEmail = useSessionEmail();
  const [mineOnly, setMineOnly] = useState(true);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [contactId, setContactId] = useState('');

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);

  const sections = useMemo(() => {
    const today = dayStart(new Date());
    const week = new Date(today);
    week.setDate(week.getDate() + 7);
    const open = tasks.filter(
      (t) => !t.done && (!mineOnly || !myEmail || t.assigned_to === myEmail || !t.assigned_to)
    );
    const bucket = (t: Task) => {
      if (!t.due_date) return 'later';
      const d = dayStart(new Date(`${t.due_date}T12:00:00`));
      if (d < today) return 'overdue';
      if (d.getTime() === today.getTime()) return 'today';
      if (d <= week) return 'week';
      return 'later';
    };
    const out = { overdue: [] as Task[], today: [] as Task[], week: [] as Task[], later: [] as Task[] };
    for (const t of open) out[bucket(t) as keyof typeof out].push(t);
    const doneRecent = tasks
      .filter((t) => t.done && (!mineOnly || !myEmail || t.assigned_to === myEmail))
      .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
      .slice(0, 10);
    return { ...out, doneRecent };
  }, [tasks, mineOnly, myEmail]);

  const quickAdd = async () => {
    if (!title.trim()) return;
    // DECISION: the quick-add row allows a task with no contact/deal by
    // attaching it to the selected contact only when one is chosen; the DB
    // requires a parent, so with none chosen we require picking one.
    if (!contactId) {
      toast.error('Pick a contact', 'Every task hangs on a contact (or a deal from its drawer).');
      return;
    }
    try {
      await create.mutateAsync({ contact_id: contactId, title: title.trim(), due_date: due || null });
      setTitle('');
      setDue('');
      toast.success('Task added');
    } catch (err) {
      toast.error('Could not add task', err instanceof Error ? err.message : String(err));
    }
  };

  const label = (t: Task) => {
    const contact = t.contact_id ? contactById.get(t.contact_id) : undefined;
    const deal = t.deal_id ? dealById.get(t.deal_id) : undefined;
    const viaDealContact = !contact && deal ? contactById.get(deal.contact_id) : undefined;
    return { contact: contact ?? viaDealContact, deal };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-black">Tasks</h1>
        <div className="flex-1" />
        <div className="flex rounded-full border bg-white p-0.5 text-xs font-medium">
          {[
            [true, 'Mine'],
            [false, 'Everyone'],
          ].map(([v, l]) => (
            <button
              key={String(v)}
              onClick={() => setMineOnly(v as boolean)}
              className={cn(
                'rounded-full px-3 py-1',
                mineOnly === v ? 'bg-brand-orange/10 text-brand-orange' : 'text-brand-steel'
              )}
            >
              {l as string}
            </button>
          ))}
        </div>
      </div>

      {/* quick add */}
      <div className="mt-3 flex flex-wrap gap-2 rounded-lg border bg-white p-2 shadow-sm">
        <Input
          className="min-w-40 flex-1"
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && quickAdd()}
        />
        <Input type="date" className="w-36" value={due} onChange={(e) => setDue(e.target.value)} />
        <Select value={contactId || 'none'} onValueChange={(v) => setContactId(v === 'none' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Contact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— contact —</SelectItem>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={quickAdd} disabled={!title.trim() || create.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-brand-steel">Loading…</p>
      ) : (
        <>
          <Section title="Overdue" tone="text-red-600" tasks={sections.overdue} render={row} />
          <Section title="Today" tone="text-brand-orange" tasks={sections.today} render={row} />
          <Section title="Next 7 days" tone="text-brand-black" tasks={sections.week} render={row} />
          <Section title="Later / no date" tone="text-brand-steel" tasks={sections.later} render={row} />
          {sections.doneRecent.length > 0 && (
            <Section title="Recently done" tone="text-brand-steel" tasks={sections.doneRecent} render={row} />
          )}
          {!sections.overdue.length && !sections.today.length && !sections.week.length && !sections.later.length && (
            <p className="mt-8 text-sm text-brand-steel">
              Nothing open{mineOnly ? ' for you' : ''} — clean slate.
            </p>
          )}
        </>
      )}
    </div>
  );

  function row(t: Task) {
    const { contact, deal } = label(t);
    return (
      <div key={t.id} className={cn('flex items-center gap-2.5 border-b px-3 py-2.5 text-sm last:border-b-0', t.done && 'opacity-60')}>
        <button
          onClick={() =>
            t.done
              ? reopen.mutate(t.id)
              : complete.mutate(t, {
                  onSuccess: () => toast.success('Task completed'),
                })
          }
          className="shrink-0 text-brand-steel hover:text-brand-orange"
          title={t.done ? 'Reopen' : 'Mark done'}
        >
          {t.done ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={cn('text-brand-black', t.done && 'line-through')}>{t.title}</div>
          <div className="flex flex-wrap gap-1.5 text-xs text-brand-steel">
            {contact && (
              <Link to={`/crm/contacts/${contact.id}`} className="text-brand-orange hover:underline">
                {contact.name}
              </Link>
            )}
            {deal && <span>· {deal.title}</span>}
            {!mineOnly && t.assigned_to && <span>· {t.assigned_to}</span>}
          </div>
        </div>
        {t.due_date && <span className="shrink-0 text-xs text-brand-steel">{formatDateUS(t.due_date)}</span>}
        <button onClick={() => remove.mutate(t.id)} className="shrink-0 text-brand-steel/60 hover:text-red-600" title="Delete task">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }
}

function Section({
  title,
  tone,
  tasks,
  render,
}: {
  title: string;
  tone: string;
  tasks: Task[];
  render: (t: Task) => React.ReactNode;
}) {
  if (!tasks.length) return null;
  return (
    <div className="mt-4">
      <h2 className={cn('text-xs font-bold uppercase tracking-wide', tone)}>
        {title} ({tasks.length})
      </h2>
      <div className="mt-1.5 overflow-hidden rounded-lg border bg-white shadow-sm">{tasks.map(render)}</div>
    </div>
  );
}
