// New Proposal — customer FIRST, then template.
//
// Ben's rule (2026-08-31): a proposal cannot exist without a customer record.
// Every proposal is therefore born attached to a CRM contact and a deal, so
// nothing lands in the builder as an orphan the way "Mitchell (driveway
// extension)" did. Pick an existing contact or create one right here; the
// deal is resolved the same way NewProposalButton does it.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { SEED_PROPOSAL_TEMPLATES } from '@/constants/seedProposalTemplates';
import { useProposalStore } from '@/store/useProposalStore';
import { supabase, CRM_ENABLED } from '@/lib/supabase';
import { createDeal, listDealsForContact } from '@/lib/crm/api/deals';
import { createProposalForContact } from '@/lib/crm/integration/newProposal';
import { normalizePhone, formatPhone } from '@/lib/crm/phone';
import { STAGE_META, formatDollars, type Contact, type Deal } from '@/lib/crm/types';

const BLANK_OPTION = {
  id: null as string | null,
  name: 'Blank Proposal',
  description: 'Start from scratch — add cards from the library as you go',
};

type Step = 'customer' | 'template' | 'which-deal';

export function TemplatePickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const createProposal = useProposalStore((s) => s.createProposal);

  const [step, setStep] = useState<Step>('customer');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false); // "new contact" sub-form
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [dealChoices, setDealChoices] = useState<Deal[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>('barndominium');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(CRM_ENABLED ? 'customer' : 'template');
    setQuery('');
    setPicked(null);
    setCreating(false);
    setForm({ name: '', phone: '', email: '' });
    setSelectedTemplate('barndominium');
    if (CRM_ENABLED && supabase) {
      void supabase
        .from('contacts')
        .select('*')
        .eq('archived', false)
        .order('name')
        .then(({ data }) => setContacts((data ?? []) as Contact[]));
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = contacts;
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((c) =>
        [c.name, c.email, c.phone, c.company_name].join(' ').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [contacts, query]);

  const options = [
    ...SEED_PROPOSAL_TEMPLATES.map((t) => ({
      id: t.id as string | null,
      name: t.name,
      description: t.description,
    })),
    BLANK_OPTION,
  ];

  /** Create the contact the user typed, then continue to the template step. */
  const createContact = async () => {
    if (!supabase) return;
    const phoneNorm = form.phone.trim() ? normalizePhone(form.phone) : '';
    if (phoneNorm === null) {
      toast.error('Bad phone number', 'Use a 10-digit US number, e.g. (330) 555-0141.');
      return;
    }
    if (!form.name.trim() || (!phoneNorm && !form.email.trim())) {
      toast.error('Name plus a phone or email is required');
      return;
    }
    setBusy(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          name: form.name.trim(),
          phone: phoneNorm,
          email: form.email.trim(),
          type: 'customer',
          source: 'other',
          lead_status: 'none',
          owner: userId,
        })
        .select()
        .single();
      if (error) throw error;
      setPicked(data as Contact);
      setStep('template');
    } catch (err) {
      toast.error('Could not create contact', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Pick the contact, then decide which deal this proposal belongs to. */
  const choose = async (contact: Contact) => {
    setPicked(contact);
    setBusy(true);
    try {
      const open = (await listDealsForContact(contact.id)).filter(
        (d) => !['won', 'lost'].includes(d.stage) && !d.archived_at
      );
      if (open.length > 1) {
        setDealChoices(open);
        setStep('which-deal');
      } else {
        setDealChoices(open); // 0 or 1 — resolved at create time
        setStep('template');
      }
    } catch {
      setDealChoices([]);
      setStep('template');
    } finally {
      setBusy(false);
    }
  };

  const create = async (deal?: Deal) => {
    setBusy(true);
    try {
      // no CRM configured (env-less deployment) — original behavior
      if (!CRM_ENABLED || !picked) {
        const p = createProposal(selectedTemplate, form.name.trim() || 'New Customer');
        onOpenChange(false);
        navigate(`/proposal/${p.id}`);
        return;
      }
      const target =
        deal ??
        dealChoices[0] ??
        (await createDeal({
          contact_id: picked.id,
          title: `${picked.name} — new project`,
          segment: 'other',
        }));
      const id = await createProposalForContact(picked, target, selectedTemplate);
      onOpenChange(false);
      navigate(`/proposal/${id}`, { state: { from: '/' } });
    } catch (err) {
      toast.error('Could not create proposal', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Proposal</DialogTitle>
          <DialogDescription>
            {step === 'customer'
              ? 'Who is this for? Every proposal belongs to a customer record.'
              : step === 'which-deal'
                ? `${picked?.name} has more than one open job — which is this proposal for?`
                : `For ${picked?.name ?? 'a new customer'} — pick a starting template.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── step 1: the customer ── */}
        {step === 'customer' && (
          <div className="grid gap-3">
            {!creating ? (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-brand-steel" />
                  <Input
                    autoFocus
                    className="pl-8"
                    placeholder="Search contacts by name, phone, email…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="grid max-h-64 gap-1 overflow-y-auto">
                  {matches.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => void choose(c)}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-brand-gray-bg"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                      <span className="truncate text-xs text-brand-steel">
                        {[c.phone ? formatPhone(c.phone) : '', c.email].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <p className="px-1 py-2 text-sm text-brand-steel">
                      No match — add them as a new customer below.
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={() => { setCreating(true); setForm((f) => ({ ...f, name: query })); }}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> New customer
                </Button>
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-brand-steel">Name *</Label>
                  <Input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-brand-steel">Phone</Label>
                    <Input
                      type="tel"
                      value={form.phone}
                      placeholder="(330) 555-0141"
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-brand-steel">Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-brand-steel">
                  Name plus a phone or email. They become a contact in the CRM with a job card, so
                  this proposal is never an orphan.
                </p>
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setCreating(false)}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to search
                  </Button>
                  <Button onClick={createContact} disabled={busy || !form.name.trim()}>
                    Continue
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── step 1b: which of their open jobs ── */}
        {step === 'which-deal' && (
          <div className="grid gap-2">
            {dealChoices.map((d) => (
              <button
                key={d.id}
                onClick={() => void create(d)}
                disabled={busy}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-brand-gray-bg"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STAGE_META[d.stage].color)}>
                  {STAGE_META[d.stage].label}
                </span>
                <span className="text-brand-steel">{formatDollars(d.value)}</span>
              </button>
            ))}
            <Button variant="outline" onClick={() => { setDealChoices([]); setStep('template'); }}>
              <Plus className="mr-1.5 h-4 w-4" /> A new job instead
            </Button>
          </div>
        )}

        {/* ── step 2: the template ── */}
        {step === 'template' && (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((opt) => (
                <button
                  key={opt.id ?? 'blank'}
                  type="button"
                  onClick={() => setSelectedTemplate(opt.id)}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left transition-colors',
                    selectedTemplate === opt.id
                      ? 'border-brand-orange bg-brand-orange/5'
                      : 'border-brand-gray-light hover:border-brand-orange/40'
                  )}
                >
                  <div className="font-heading text-sm font-bold uppercase tracking-wide">
                    {opt.name}
                  </div>
                  <div className="mt-1 text-xs text-brand-steel">{opt.description}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-2">
              {CRM_ENABLED ? (
                <Button variant="outline" onClick={() => setStep('customer')}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Customer
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => void create()} disabled={busy}>
                {busy ? 'Creating…' : 'Create proposal'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
