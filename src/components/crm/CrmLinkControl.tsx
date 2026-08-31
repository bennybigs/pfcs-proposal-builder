// Editor-header control. Unlinked proposal → "Link to CRM": search contacts
// or create one from the proposal's customer block, then pick/create a deal.
// Linked → shows the contact name with an Unlink option.
//
// Lives OUTSIDE the CRM's AuthGate/QueryClientProvider (the editor is usable
// signed-out), so it talks to supabase directly and degrades to a hint toast.
import { useEffect, useState } from 'react';
import { Link2, Link2Off, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { supabase, CRM_ENABLED } from '@/lib/supabase';
import { useProposalStore } from '@/store/useProposalStore';
import { customerInfoToContact } from '@/lib/crm/integration/mapping';
import { findDuplicateContact, duplicateReason, type DuplicateMatch } from '@/lib/crm/dedupe';
import { promoteLeadOnDeal } from '@/lib/crm/api/contacts';
import { grandTotal } from '@/lib/pricing';
import { STAGE_META, formatDollars, type Contact, type Deal } from '@/lib/crm/types';
import type { Proposal } from '@/types';

export function CrmLinkControl({ proposal }: { proposal: Proposal }) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const [open, setOpen] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null);

  useEffect(() => {
    if (!proposal.crm || !supabase) {
      setLinkedName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('contacts')
      .select('name')
      .eq('id', proposal.crm.contactId)
      .maybeSingle()
      .then(({ data }) => !cancelled && setLinkedName(data?.name ?? 'CRM contact'));
    return () => {
      cancelled = true;
    };
  }, [proposal.crm]);

  if (!CRM_ENABLED) return null;

  if (proposal.crm) {
    return (
      <Button
        variant="outline"
        size="sm"
        title={`Linked to ${linkedName ?? 'CRM'} — click to unlink`}
        onClick={async () => {
          const { contactId, dealId } = proposal.crm!;
          void contactId;
          updateProposal(proposal.id, { crm: undefined });
          if (supabase) {
            await supabase
              .from('proposal_links')
              .delete()
              .eq('deal_id', dealId)
              .eq('proposal_id', proposal.id);
          }
          toast.success('Unlinked from CRM');
        }}
      >
        <Link2Off className="h-4 w-4" />
        <span className="hidden max-w-28 truncate xl:inline">{linkedName ?? 'CRM'}</span>
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Link this proposal to a CRM contact & deal">
        <Link2 className="h-4 w-4" />
        <span className="hidden xl:inline">Link to CRM</span>
      </Button>
      {open && <LinkDialog proposal={proposal} onClose={() => setOpen(false)} />}
    </>
  );
}

function LinkDialog({ proposal, onClose }: { proposal: Proposal; onClose: () => void }) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const [query, setQuery] = useState(proposal.customer.fullName);
  const [results, setResults] = useState<Contact[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Contact | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  // debounced contact search
  useEffect(() => {
    if (!signedIn) return;
    const t = window.setTimeout(async () => {
      const q = query.trim();
      const { data } = await supabase!
        .from('contacts')
        .select('*')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('name')
        .limit(8);
      setResults((data as Contact[]) ?? []);
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, signedIn]);

  useEffect(() => {
    if (!picked) return;
    supabase!
      .from('deals')
      .select('*')
      .eq('contact_id', picked.id)
      .not('stage', 'in', '("won","lost")')
      .order('created_at', { ascending: false })
      .then(({ data }) => setDeals((data as Deal[]) ?? []));
  }, [picked]);

  const finish = async (contact: Contact, deal: Deal) => {
    setBusy(true);
    try {
      const email = (await supabase!.auth.getUser()).data.user?.email ?? '';
      await supabase!.from('proposal_links').upsert(
        {
          deal_id: deal.id,
          proposal_id: proposal.id,
          title: proposal.project.referenceName || deal.title,
          total: grandTotal(proposal),
          linked_by: email,
        },
        { onConflict: 'deal_id,proposal_id' }
      );
      updateProposal(proposal.id, { crm: { contactId: contact.id, dealId: deal.id } });
      toast.success('Linked to CRM', `${contact.name} — ${deal.title}`);
      onClose();
    } catch (err) {
      toast.error('Could not link', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createContactFromProposal = async (force = false) => {
    setBusy(true);
    try {
      const base = customerInfoToContact(proposal.customer);
      // same duplicate rule as everywhere else — check before inserting
      if (!force) {
        const { data: pool } = await supabase!.from('contacts').select('*').eq('archived', false);
        const match = findDuplicateContact((pool ?? []) as Contact[], {
          name: base.name,
          email: base.email,
          phone: base.phone,
        });
        if (match) {
          setBusy(false);
          setDuplicate(match);
          return;
        }
      }
      const user = (await supabase!.auth.getUser()).data.user;
      const { data, error } = await supabase!
        .from('contacts')
        // already being written a proposal — born qualified, skips the Leads inbox
        .insert({ ...base, lead_status: 'qualified', owner: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      setPicked(data as Contact);
    } catch (err) {
      toast.error('Could not create contact', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createDealAndFinish = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const email = (await supabase!.auth.getUser()).data.user?.email ?? null;
      const { data, error } = await supabase!
        .from('deals')
        .insert({
          contact_id: picked.id,
          title: proposal.project.referenceName || `${picked.name} — new project`,
          segment: 'other',
          assigned_to: email, // you create it, you own it (RLS requires this for reps)
        })
        .select()
        .single();
      if (error) throw error;
      // opening a deal qualifies a lead still in triage
      try { await promoteLeadOnDeal(picked.id); } catch { /* non-fatal */ }
      await finish(picked, data as Deal);
    } catch (err) {
      toast.error('Could not create deal', err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{picked ? `Deal for ${picked.name}` : 'Link to CRM'}</DialogTitle>
        </DialogHeader>

        {signedIn === false && (
          <p className="text-sm text-brand-steel">
            You&apos;re not signed in to the CRM. Open <b>/crm</b>, sign in with your email,
            then come back.
          </p>
        )}

        {signedIn && !picked && (
          <>
            <Input
              autoFocus
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="grid max-h-56 gap-1 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPicked(c)}
                  className="rounded-md border px-3 py-2 text-left text-sm hover:bg-brand-gray-bg"
                >
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-brand-steel">
                    {[c.phone, c.email].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
              {!results.length && <p className="py-2 text-sm text-brand-steel">No matches.</p>}
            </div>
            {duplicate && (
          <div className="mb-2 grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="font-medium">
              {duplicate.contact.name} is already a contact ({duplicateReason(duplicate)}).
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { const c = duplicate.contact; setDuplicate(null); setPicked(c); }}>
                Use {duplicate.contact.name}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setDuplicate(null); void createContactFromProposal(true); }}>
                Create separate contact
              </Button>
            </div>
          </div>
        )}
        <Button variant="outline" onClick={() => void createContactFromProposal()} disabled={busy}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Create contact from this proposal ({proposal.customer.fullName || 'unnamed'})
            </Button>
          </>
        )}

        {signedIn && picked && (
          <div className="grid gap-2">
            {deals.map((d) => (
              <button
                key={d.id}
                onClick={() => finish(picked, d)}
                disabled={busy}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-brand-gray-bg"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_META[d.stage].color}`}>
                  {STAGE_META[d.stage].label}
                </span>
                <span className="text-brand-steel">{formatDollars(d.value)}</span>
              </button>
            ))}
            <Button onClick={createDealAndFinish} disabled={busy}>
              New deal: “{proposal.project.referenceName || `${picked.name} — new project`}”
            </Button>
            <Button variant="outline" onClick={() => setPicked(null)}>
              Back
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
