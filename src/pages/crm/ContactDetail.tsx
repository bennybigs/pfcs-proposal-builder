// /crm/contacts/:id — one merged timeline (deals + activities + tasks),
// newest first, with a thumb-reachable quick-log bar pinned to the bottom
// on phones.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  CalendarCheck,
  CheckSquare,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { ContactDialog } from '@/components/crm/ContactDialog';
import { ContactFiles } from '@/components/crm/ContactFiles';
import { NewProposalButton } from '@/components/crm/NewProposalButton';
import { useContact, useContactMutations } from '@/lib/crm/api/contacts';
import { useTeam, memberName } from '@/lib/crm/api/team';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { refreshLeadBadge } from '@/lib/crm/leadBadge';
import { useContactActivities, useLogActivity } from '@/lib/crm/api/activities';
import { useContactDeals, useDealMutations } from '@/lib/crm/api/deals';
import { useTasks, useTaskMutations } from '@/lib/crm/api/tasks';
import { useDealProposalLinks } from '@/lib/crm/api/proposalLinks';
import {
  ACTIVITY_META,
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  SEGMENT_META,
  SOURCE_LABEL,
  STAGE_META,
  formatDollars,
  type ActivityType,
  type Contact,
} from '@/lib/crm/types';
import { formatDateUS } from '@/lib/format';
import { cn } from '@/lib/utils';

type TimelineItem = {
  key: string;
  at: string;
  icon: React.ReactNode;
  title: string;
  detail?: string;
  muted?: boolean;
};

const TYPE_ICON: Record<ActivityType, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  text: <MessageSquare className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Users className="h-3.5 w-3.5" />,
  site_visit: <MapPin className="h-3.5 w-3.5" />,
  note: <StickyNote className="h-3.5 w-3.5" />,
  proposal_event: <FileText className="h-3.5 w-3.5" />,
  field_change: <Pencil className="h-3.5 w-3.5" />,
};

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useContact(id);
  const { data: deals = [] } = useContactDeals(id);
  const { data: activities = [] } = useContactActivities(id);
  const { data: allTasks = [] } = useTasks();
  const dealIds = useMemo(() => deals.map((d) => d.id), [deals]);
  const { data: proposalLinks = [] } = useDealProposalLinks(dealIds);
  const { create: createDeal, assign } = useDealMutations();
  const { data: team = [] } = useTeam();
  const me = useSessionEmail();
  const iAmAdmin = !!team.find((t) => t.email === me)?.is_admin;
  const log = useLogActivity();
  const { remove: removeContact, update: updateContact } = useContactMutations();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const tasks = useMemo(
    () =>
      allTasks.filter(
        (t) => t.contact_id === id || (t.deal_id && dealIds.includes(t.deal_id))
      ),
    [allTasks, id, dealIds]
  );

  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const a of activities) {
      items.push({
        key: `a-${a.id}`,
        at: a.happened_at,
        icon: TYPE_ICON[a.type],
        title: ACTIVITY_META[a.type].label + (a.body ? ` — ${a.body}` : ''),
        detail: a.logged_by,
      });
    }
    for (const d of deals) {
      items.push({
        key: `d-${d.id}`,
        at: d.created_at,
        icon: <Briefcase className="h-3.5 w-3.5" />,
        title: `Deal created — ${d.title}`,
        detail: `${STAGE_META[d.stage].label} · ${formatDollars(d.value)}`,
      });
    }
    for (const t of tasks) {
      items.push({
        key: `t-${t.id}`,
        at: t.created_at,
        icon: t.done ? <CalendarCheck className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />,
        title: `${t.done ? 'Task (done)' : 'Task'} — ${t.title}`,
        detail: t.due_date ? `due ${formatDateUS(t.due_date)}` : undefined,
        muted: t.done,
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [activities, deals, tasks]);

  const newDeal = async () => {
    if (!contact) return;
    // DECISION: deals are born on the contact page (the pipeline has no
    // create button in the brief) — prefilled title, Inquiry stage.
    try {
      await createDeal.mutateAsync({ contact_id: contact.id, title: `${contact.name} — new project` });
      toast.success('Deal created at Inquiry');
    } catch (err) {
      toast.error('Could not create deal', err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoading) return <p className="text-sm text-brand-steel">Loading…</p>;
  if (!contact) {
    return (
      <div>
        <p className="text-sm text-brand-steel">Contact not found.</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/crm')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to contacts
        </Button>
      </div>
    );
  }

  const openDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage));

  return (
    <div className="pb-24 sm:pb-6">
      <Link to="/crm" className="text-sm text-brand-steel hover:text-brand-black">
        <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
        Contacts
      </Link>

      <div className="mt-2 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-brand-black">{contact.name}</h1>
            <div className="mt-0.5 text-sm text-brand-steel">
              {[contact.company_name, contact.address].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="text-brand-orange hover:underline">
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="text-brand-orange hover:underline">
                  {contact.email}
                </a>
              )}
              <Badge variant="outline" className="text-[10px]">
                {SOURCE_LABEL[contact.source]}
                {contact.source_detail ? ` · ${contact.source_detail}` : ''}
              </Badge>
              <ContactTypeControl contact={contact} />
              {contact.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          </div>
          {contact.email && (
            <Button
              variant="outline"
              size="sm"
              title="Opens a pre-addressed draft in your mail app (Outlook) — sends from your address, lands in your Sent folder"
              onClick={() => {
                log.mutate({ contact_id: contact.id, type: 'email', body: `Email drafted to ${contact.email}` });
                window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(`PFCS — ${contact.name}`)}`;
              }}
            >
              <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <NewProposalButton contact={contact} />
          <Button size="sm" onClick={newDeal} disabled={createDeal.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New deal
          </Button>
          <Button variant="outline" size="sm" title="Archive or delete this contact"
            className="text-brand-steel hover:text-red-600"
            onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {contact.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-brand-steel">{contact.notes}</p>}
        {contact.archived && (
          <div className="mt-3 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="font-medium">Archived</span> — hidden from the contact list and pipeline.
            <Button size="sm" variant="outline" className="ml-auto"
              onClick={async () => {
                await updateContact.mutateAsync({ id: contact.id, patch: { archived: false } });
                toast.success('Restored', `${contact.name} is back on the working list.`);
              }}>
              Restore
            </Button>
          </div>
        )}
      </div>

      {deals.length > 0 && (
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-brand-black">
            Deals {openDeals.length > 0 && <span className="text-brand-steel">({openDeals.length} open)</span>}
          </h2>
          <div className="mt-2 grid gap-2">
            {deals.map((d) => {
              const isOpen = !['won', 'lost'].includes(d.stage);
              const dealProposals = proposalLinks.filter((pl) => pl.deal_id === d.id);
              return (
                <div key={d.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/crm/pipeline?deal=${d.id}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 hover:opacity-80"
                  >
                    <span className="font-medium">{d.title}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STAGE_META[d.stage].color)}>
                      {STAGE_META[d.stage].label}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{SEGMENT_META[d.segment].short}</Badge>
                    <span className="ml-auto text-brand-steel">{formatDollars(d.value)}</span>
                  </Link>
                  {iAmAdmin && isOpen ? (
                    <select
                      value={d.assigned_to ?? ''}
                      disabled={assign.isPending}
                      title="Who owns this deal"
                      onChange={async (e) => {
                        const toEmail = e.target.value || null;
                        try {
                          await assign.mutateAsync({
                            deal: d,
                            toEmail,
                            assigneeName: memberName(team, toEmail),
                            byName: memberName(team, me),
                          });
                          toast.success(toEmail ? `Assigned to ${memberName(team, toEmail)}` : 'Unassigned');
                        } catch (err) {
                          toast.error('Could not assign', err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className={cn(
                        'h-7 shrink-0 cursor-pointer rounded-md border bg-white px-1.5 text-xs',
                        d.assigned_to ? 'text-brand-black' : 'text-brand-steel'
                      )}
                    >
                      <option value="">Assign to…</option>
                      {team.map((t) => (
                        <option key={t.email} value={t.email}>
                          {t.display_name || t.email}
                        </option>
                      ))}
                    </select>
                  ) : d.assigned_to ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {memberName(team, d.assigned_to)}
                    </Badge>
                  ) : null}
                </div>
                {/* a deal IS the working project — its proposals live inside it */}
                {dealProposals.length > 0 && (
                  <div className="mt-1.5 grid gap-1 border-t pt-1.5">
                    {dealProposals.map((pl) => (
                      <div key={pl.id} className="flex flex-wrap items-center gap-2 pl-4 text-xs">
                        <FileText className="h-3 w-3 shrink-0 text-brand-steel" />
                        <span className="min-w-0 flex-1 truncate font-medium">{pl.title || 'Proposal'}</span>
                        <span className="text-brand-steel">{formatDollars(pl.total)}</span>
                        <Link
                          to={`/crm/pipeline?deal=${d.id}`}
                          className="text-brand-orange hover:underline"
                        >
                          Open in deal
                        </Link>
                        {pl.share_url && (
                          <a href={pl.share_url} target="_blank" rel="noreferrer" className="text-brand-orange hover:underline">
                            Customer link
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ContactFiles contactId={contact.id} />

      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-black">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="mt-2 text-sm text-brand-steel">Nothing yet — log the first call below.</p>
        ) : (
          <div className="mt-2">
            {timeline.map((item) => (
              <div
                key={item.key}
                className={cn('flex gap-3 border-b py-2.5 text-sm last:border-b-0', item.muted && 'opacity-60')}
              >
                <span className="mt-0.5 text-brand-steel">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-brand-black">{item.title}</div>
                  {item.detail && <div className="text-xs text-brand-steel">{item.detail}</div>}
                </div>
                <span className="shrink-0 text-xs text-brand-steel">{formatDateUS(item.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <QuickLogBar contactId={contact.id} />
      <ContactDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{contact.archived ? `Delete ${contact.name}?` : `Archive or delete ${contact.name}?`}</DialogTitle>
          </DialogHeader>
          {!contact.archived && (
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium text-brand-black">Archive (recommended)</div>
              <p className="mt-0.5 text-sm text-brand-steel">
                Hides them from the contact list and pipeline. Every call, deal, and proposal
                stays — restore anytime from the &quot;Archived&quot; filter.
              </p>
              <Button className="mt-2 w-full"
                onClick={async () => {
                  setDeleteOpen(false);
                  try {
                    await updateContact.mutateAsync({ id: contact.id, patch: { archived: true } });
                    toast.success('Archived', `${contact.name} is tucked away — restore anytime.`);
                    navigate('/crm');
                  } catch (err) {
                    toast.error('Could not archive', err instanceof Error ? err.message : String(err));
                  }
                }}>
                Archive contact
              </Button>
            </div>
          )}
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium text-brand-black">Delete forever</div>
            <p className="mt-0.5 text-sm text-brand-steel">
              Permanently deletes the contact
              {deals.length > 0 && <> and their <b>{deals.length} deal{deals.length > 1 ? 's' : ''}</b></>}
              , plus the whole timeline (calls, notes, tasks) — for everyone on the team.
              Proposal documents themselves are not deleted.
            </p>
            <Button variant="outline" className="mt-2 w-full text-red-600 hover:bg-red-50"
              onClick={async () => {
                setDeleteOpen(false);
                try {
                  await removeContact.mutateAsync(contact.id);
                  toast.success('Contact deleted');
                  navigate('/crm');
                } catch (err) {
                  toast.error('Could not delete', err instanceof Error ? err.message : String(err));
                }
              }}>
              Delete forever
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A contact has a TYPE — what this person or company is to us. Pipeline
 * status lives on the deal, never here (Ben's call 2026-08-30).
 */
function ContactTypeControl({ contact }: { contact: Contact }) {
  const { update } = useContactMutations();
  return (
    <select
      title="What this contact is to us"
      value={contact.type || 'customer'}
      disabled={update.isPending}
      onChange={async (e) => {
        const to = e.target.value;
        try {
          await update.mutateAsync({ id: contact.id, patch: { type: to } });
          toast.success(`Type: ${CONTACT_TYPE_LABEL[to] ?? to}`);
        } catch (err) {
          toast.error('Could not update', err instanceof Error ? err.message : String(err));
        }
      }}
      className="cursor-pointer appearance-none rounded-full border-0 bg-brand-gray-light px-2 py-0.5 text-[10px] font-semibold text-brand-black"
    >
      {CONTACT_TYPES.map((t) => (
        <option key={t} value={t}>
          {CONTACT_TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

/** One-tap logging, pinned to the bottom on phones. */
function QuickLogBar({ contactId }: { contactId: string }) {
  const log = useLogActivity();
  const { create: createTask } = useTaskMutations();
  const [pendingType, setPendingType] = useState<ActivityType | 'task' | null>(null);
  const [body, setBody] = useState('');

  const quick = (type: ActivityType) => {
    if (pendingType === type) return commit(); // second tap commits
    setPendingType(type);
    setBody('');
  };

  const commit = async () => {
    if (!pendingType) return;
    try {
      if (pendingType === 'task') {
        if (!body.trim()) return setPendingType(null);
        await createTask.mutateAsync({ contact_id: contactId, title: body.trim() });
        toast.success('Task added');
      } else {
        await log.mutateAsync({ contact_id: contactId, type: pendingType, body: body.trim() });
        toast.success(`${ACTIVITY_META[pendingType].label} logged`);
      }
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : String(err));
    }
    setPendingType(null);
    setBody('');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-2 shadow-lg sm:static sm:mt-4 sm:rounded-lg sm:border sm:shadow-sm">
      <div className="mx-auto max-w-6xl">
        {pendingType && (
          <input
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && commit()}
            onBlur={commit}
            placeholder={
              pendingType === 'task'
                ? 'Task title… (Enter to save)'
                : `Optional note for this ${ACTIVITY_META[pendingType].label.toLowerCase()}… (Enter to save)`
            }
            className="mb-2 w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-brand-orange"
          />
        )}
        <div className="flex gap-2">
          <QuickBtn onClick={() => quick('call')} icon={<Phone className="h-4 w-4" />} label="Log call" />
          <QuickBtn onClick={() => quick('text')} icon={<MessageSquare className="h-4 w-4" />} label="Log text" />
          <QuickBtn onClick={() => quick('note')} icon={<StickyNote className="h-4 w-4" />} label="Log note" />
          <QuickBtn onClick={() => setPendingType('task')} icon={<CheckSquare className="h-4 w-4" />} label="Task" />
        </div>
      </div>
    </div>
  );
}

function QuickBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-white px-2 py-2.5 text-sm font-medium text-brand-black hover:bg-brand-gray-bg"
    >
      {icon}
      {label}
    </button>
  );
}
