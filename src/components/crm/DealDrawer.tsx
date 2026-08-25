// Deal detail as a right-hand side sheet (Radix Dialog via the shared Sheet).
// Edits, Won/Lost with reason, and the linked-proposals section (Phase 4
// fills in linking; the section renders whatever proposal_links exist).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, RefreshCw, Trophy, X } from 'lucide-react';
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
import { NewProposalButton } from '@/components/crm/NewProposalButton';
import { useDealProposalLinks } from '@/lib/crm/api/proposalLinks';
import { useLogActivity } from '@/lib/crm/api/activities';
import { useProposalStore } from '@/store/useProposalStore';
import { grandTotal } from '@/lib/pricing';
import {
  SEGMENTS,
  SEGMENT_META,
  SOURCE_LABEL,
  STAGES,
  STAGE_META,
  formatDollars,
  type Contact,
  type Deal,
  type DealSegment,
  type DealStage,
} from '@/lib/crm/types';

interface Props {
  deal: Deal | null;
  contact: Contact | undefined;
  onClose: () => void;
}

export function DealDrawer({ deal, contact, onClose }: Props) {
  const { update, move } = useDealMutations();
  const log = useLogActivity();
  const { data: links = [] } = useDealProposalLinks(deal ? [deal.id] : []);
  const localProposals = useProposalStore((s) => s.proposals);
  const [form, setForm] = useState({
    title: '',
    value: '0',
    expected_close: '',
    probability: '0',
    segment: 'other' as DealSegment,
    notes: '',
  });
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');

  useEffect(() => {
    if (!deal) return;
    setForm({
      title: deal.title,
      value: String(Math.round(deal.value)),
      expected_close: deal.expected_close ?? '',
      probability: String(deal.probability),
      segment: deal.segment,
      notes: deal.notes,
    });
  }, [deal]);

  if (!deal) return null;

  const save = async (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    try {
      await update.mutateAsync({
        id: deal.id,
        patch: {
          title: next.title.trim() || deal.title,
          value: Math.max(0, Math.round(Number(next.value) || 0)),
          expected_close: next.expected_close || null,
          probability: Math.min(100, Math.max(0, Math.round(Number(next.probability) || 0))),
          segment: next.segment,
          notes: next.notes,
        },
      });
    } catch (err) {
      toast.error('Could not save deal', err instanceof Error ? err.message : String(err));
    }
  };

  const outcome = async (to: DealStage, reason?: string) => {
    try {
      await move.mutateAsync({ deal, to, lostReason: reason });
      await log.mutateAsync({
        contact_id: deal.contact_id,
        deal_id: deal.id,
        type: 'note',
        body:
          to === 'won'
            ? `Deal won — ${formatDollars(deal.value)}`
            : `Deal lost${reason ? ` — ${reason}` : ''}`,
      });
      toast.success(to === 'won' ? 'Marked won 🎉' : 'Marked lost');
      onClose();
    } catch (err) {
      toast.error('Could not update deal', err instanceof Error ? err.message : String(err));
    }
  };

  const useTotal = async (total: number) => {
    await save({ value: String(Math.round(total)) });
    await log.mutateAsync({
      contact_id: deal.contact_id,
      deal_id: deal.id,
      type: 'note',
      body: `Deal value set from proposal — ${formatDollars(total)}`,
    });
    toast.success('Deal value updated');
  };

  const open = !['won', 'lost'].includes(deal.stage);

  return (
    <Sheet open={!!deal} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8">{deal.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_META[deal.stage].color}`}>
            {STAGE_META[deal.stage].label}
          </span>
          {contact && (
            <Link to={`/crm/contacts/${contact.id}`} className="text-brand-orange hover:underline">
              {contact.name}
            </Link>
          )}
          {contact && (
            <span className="text-xs text-brand-steel">
              via {SOURCE_LABEL[contact.source]}{contact.source_detail ? ` · ${contact.source_detail}` : ''}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onBlur={() => save({})} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value ($)">
              <Input
                inputMode="numeric"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value.replace(/[^\d]/g, '') }))}
                onBlur={() => save({})}
              />
            </Field>
            <Field label="Expected close">
              <Input
                type="date"
                value={form.expected_close}
                onChange={(e) => save({ expected_close: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Probability (%)">
              <Input
                inputMode="numeric"
                value={form.probability}
                onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value.replace(/[^\d]/g, '') }))}
                onBlur={() => save({})}
              />
            </Field>
            <Field label="Segment">
              <Select value={form.segment} onValueChange={(v) => save({ segment: v as DealSegment })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEGMENT_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Stage">
            <Select
              value={deal.stage}
              onValueChange={(v) => {
                if (v === 'lost') setLostOpen(true);
                else move.mutate({ deal, to: v as DealStage });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              onBlur={() => save({})}
            />
          </Field>
        </div>

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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => useTotal(grandTotal(local))}
                          title="This proposal exists on this device — pull its live computed total"
                        >
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

        {open && (
          <div className="mt-6 flex gap-2">
            <Button className="flex-1" onClick={() => outcome('won')}>
              <Trophy className="mr-1.5 h-4 w-4" /> Won
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setLostOpen(true)}>
              <X className="mr-1.5 h-4 w-4" /> Lost
            </Button>
          </div>
        )}

        <Dialog open={lostOpen} onOpenChange={setLostOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Mark as lost</DialogTitle>
            </DialogHeader>
            <Field label="Why? (optional, but future-you will thank you)">
              <Input
                value={lostReason}
                placeholder="went with Morton, price, timing…"
                onChange={(e) => setLostReason(e.target.value)}
                autoFocus
              />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLostOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setLostOpen(false);
                  outcome('lost', lostReason.trim() || undefined);
                }}
              >
                Mark lost
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
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
