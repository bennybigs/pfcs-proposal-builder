// Cloud sync for the proposal builder.
//
// The server is the record; each device is a working cache that keeps
// going offline. One reconcile pass (below) brings a device and the server
// into agreement using the ledger in syncPlan.ts — what this device and the
// server last agreed on — so every case has exactly one outcome:
//   - offline work is sent when the device is back
//   - teammates' changes come down
//   - deletions stick (nothing already synced is ever re-uploaded)
//   - when both sides changed the same proposal, nothing is overwritten:
//     the team's version stays and this device's edits wait as a copy with
//     "keep mine / keep theirs" (see ConflictBanner)
//
// A pass runs on sign-in, shortly after any local change, when the device
// comes back online, when the app comes back to the foreground, on any
// realtime change from a teammate, and once a minute as a safety net. Passes
// never overlap. Everything is idempotent: running one twice changes nothing.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, CRM_ENABLED } from '@/lib/supabase';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { linkTitle } from '@/lib/proposalFamily';
import { settleProposalNumbers } from '@/lib/proposalNumbers';
import { planSync, shouldArchiveOnUpload, type Ledger, type ServerVersion } from '@/lib/syncPlan';
import { grandTotal } from '@/lib/pricing';
import { uuid } from '@/lib/uuid';
import { toast } from '@/components/ui/toast';
import type { Proposal } from '@/types';

export type BuilderSyncStatus = 'off' | 'signedOut' | 'offline' | 'syncing' | 'synced' | 'error';

interface SyncState {
  status: BuilderSyncStatus;
  set: (s: BuilderSyncStatus) => void;
}
export const useBuilderSyncStatus = create<SyncState>((set) => ({
  status: CRM_ENABLED ? 'signedOut' : 'off',
  set: (status) => set({ status }),
}));

// ── the ledger (per device, written immediately — never debounced) ──────
const LEDGER_KEY = 'pfcs:sync:v1';
interface StoredLedger {
  owner: string; // whose cache this device holds
  proposals: Ledger;
  lib?: { token: string; doc: string }; // builder_shared.updated_at + the doc agreed on
}
function loadLedger(): StoredLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (raw) return JSON.parse(raw) as StoredLedger;
  } catch {
    /* unreadable → start fresh */
  }
  return { owner: '', proposals: {} };
}
function saveLedger(l: StoredLedger) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(l));
  } catch {
    /* quota — next pass rebuilds agreement */
  }
}

/** The library/settings document as compared for sync. The next-number
 *  preview is device-local (the real counter lives in the database). */
function libDocOf(lib: { templates: unknown; settings: object }): string {
  return JSON.stringify({ templates: lib.templates, settings: { ...lib.settings, nextProposalNumber: 0 } });
}

let applyingRemote = false;
function applyProposals(fn: (all: Record<string, Proposal>) => Record<string, Proposal>) {
  applyingRemote = true;
  try {
    useProposalStore.setState((s) => ({ proposals: fn(s.proposals) }));
  } finally {
    applyingRemote = false;
  }
}

// ── one reconcile pass ───────────────────────────────────────────────────
let running: Promise<void> | null = null;
let realtimeToken = '';
let again = false;

export function requestSync(): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  const sb = supabase;
  running = (async () => {
    try {
      do {
        again = false;
        await reconcile(sb);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function reconcile(sb: SupabaseClient): Promise<void> {
  const setStatus = useBuilderSyncStatus.getState().set;
  const { data: sess } = await sb.auth.getSession();
  const email = sess.session?.user.email ?? '';
  if (!sess.session || !email) {
    setStatus('signedOut');
    return;
  }
  // the live channel must carry the person's sign-in, or row security sends
  // it nothing (it connects before the session loads on app open)
  if (sess.session.access_token !== realtimeToken) {
    realtimeToken = sess.session.access_token;
    try {
      await sb.realtime.setAuth(realtimeToken);
    } catch {
      realtimeToken = '';
    }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline');
    return;
  }
  setStatus('syncing');
  try {
    const ledger = loadLedger();

    // a different person signed in on this device: the cache was theirs
    if (ledger.owner && ledger.owner !== email) {
      applyProposals(() => ({}));
      ledger.proposals = {};
      delete ledger.lib;
    }
    ledger.owner = email;
    saveLedger(ledger);

    // new proposals get their team-wide number before they reach the server
    try {
      await settleProposalNumbers(sb);
    } catch {
      /* retried next pass */
    }

    // 1. what the server has — versions only
    const { data: rows, error } = await sb
      .from('proposals')
      .select('id, v:data->>updatedAt, d:data->>deletedAt');
    if (error) throw error;
    const server: ServerVersion[] = (rows ?? []).map((r: { id: string; v: string | null; d: string | null }) => ({
      id: r.id,
      updatedAt: r.v ?? '',
      deleted: Boolean(r.d),
    }));

    const plan = planSync(useProposalStore.getState().proposals, server, ledger.proposals);
    Object.assign(ledger.proposals, plan.agreed);

    // 2. conflicts: keep this device's edits as a copy before theirs comes down
    if (plan.conflicts.length) {
      const who = await fetchFull(sb, plan.conflicts.map((p) => p.id));
      const copies: Record<string, Proposal> = {};
      for (const mine of plan.conflicts) {
        const theirs = who.get(mine.id);
        const copy: Proposal = {
          ...mine,
          id: uuid(),
          conflictOf: {
            id: mine.id,
            theirsBy: theirs?.updated_by ?? 'a teammate',
            at: theirs?.data.updatedAt ?? new Date().toISOString(),
          },
        };
        copies[copy.id] = copy;
        plan.adopt.push(mine.id);
        toast.error(
          `${mine.proposalNumber} was changed by ${nameOf(theirs?.updated_by)} while you were offline`,
          'Nothing was lost — your version is waiting on the Proposals page to keep or discard.'
        );
      }
      applyProposals((all) => ({ ...all, ...copies }));
    }

    // 3. bring down what's newer on the server
    if (plan.adopt.length) {
      const full = await fetchFull(sb, plan.adopt);
      applyProposals((all) => {
        const next = { ...all };
        for (const [id, row] of full) next[id] = row.data;
        return next;
      });
      for (const [id, row] of full) ledger.proposals[id] = row.data.updatedAt ?? '';
    }

    // 4. drop what the server no longer has (or never needed)
    if (plan.drop.length) {
      applyProposals((all) => {
        const next = { ...all };
        for (const id of plan.drop) delete next[id];
        return next;
      });
      for (const id of plan.drop) delete ledger.proposals[id];
    }
    saveLedger(ledger);

    // 5. send this device's changes
    const serverIds = new Set(server.map((s) => s.id));
    for (const planned of plan.push) {
      let p = useProposalStore.getState().proposals[planned.id];
      if (!p) continue;
      if (shouldArchiveOnUpload(p, ledger.proposals)) {
        // weeks-old leftovers from this device: kept, but out of the way
        // (an old draft also gets a real team number — its device-made one
        // may belong to someone else by now)
        const archived = {
          ...p,
          archivedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(p.status === 'draft' && !p.lineage ? { numberPending: true } : {}),
        };
        applyProposals((all) => ({ ...all, [archived.id]: archived }));
        p = archived;
      }
      const result = await pushOne(sb, p, email, ledger.proposals[p.id], serverIds.has(p.id));
      if (result === 'forbidden') {
        // belongs to someone this account can't see (e.g. deal reassigned)
        applyProposals((all) => {
          const next = { ...all };
          delete next[p!.id];
          return next;
        });
        delete ledger.proposals[p.id];
      } else if (result === 'moved') {
        again = true; // a teammate saved first — the next pass sorts it out
      } else {
        ledger.proposals[p.id] = p.updatedAt ?? '';
        await crmBookkeeping(sb, p);
      }
      saveLedger(ledger);
    }

    // 6. the shared card library + company settings
    await syncLibrary(sb, ledger);
    saveLedger(ledger);

    setStatus('synced');
  } catch {
    setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
  }
}

async function fetchFull(sb: SupabaseClient, ids: string[]) {
  const out = new Map<string, { data: Proposal; updated_by: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb
      .from('proposals')
      .select('id, data, updated_by')
      .in('id', ids.slice(i, i + 100));
    if (error) throw error;
    for (const r of data ?? []) out.set(r.id as string, { data: r.data as Proposal, updated_by: r.updated_by as string });
  }
  return out;
}

async function pushOne(
  sb: SupabaseClient,
  p: Proposal,
  email: string,
  base: string | undefined,
  existsOnServer: boolean
): Promise<'ok' | 'moved' | 'forbidden'> {
  const row = { data: p, updated_at: new Date().toISOString(), updated_by: email };
  let error;
  if (existsOnServer && base !== undefined) {
    // only if the server still holds the version we started from
    const res = await sb
      .from('proposals')
      .update(row)
      .eq('id', p.id)
      .eq('data->>updatedAt', base)
      .select('id');
    error = res.error;
    if (!error && !(res.data ?? []).length) return 'moved';
  } else {
    // new here, or first sync since the ledger existed. created_by is never
    // sent — the DB trigger stamps it on first insert (rep RLS keys off it)
    ({ error } = await sb.from('proposals').upsert({ id: p.id, ...row }));
  }
  if (error) {
    if ((error as { code?: string }).code === '42501') return 'forbidden';
    throw error;
  }
  return 'ok';
}

/**
 * Keep the CRM's copy honest on every change: the proposal_links row carries
 * the live total/title, the proposal marked as the deal's value drives it,
 * a signed/accepted option becomes that value, and a deleted proposal
 * leaves the deal.
 */
async function crmBookkeeping(sb: SupabaseClient, p: Proposal) {
  const dealId = p.crm?.dealId;
  if (!dealId) return;
  try {
    if (p.deletedAt) {
      await sb.from('proposal_links').delete().eq('deal_id', dealId).eq('proposal_id', p.id);
      return;
    }
    const total = Math.round(grandTotal(p));
    const { data: rows } = await sb
      .from('proposal_links')
      .update({ total, title: linkTitle(p) })
      .eq('deal_id', dealId)
      .eq('proposal_id', p.id)
      .select('counts_toward_value');
    let counts = Boolean(rows?.[0]?.counts_toward_value);
    if (rows?.length && !counts && (p.status === 'accepted' || p.status === 'contract')) {
      await sb.from('proposal_links').update({ counts_toward_value: false }).eq('deal_id', dealId);
      await sb.from('proposal_links').update({ counts_toward_value: true }).eq('deal_id', dealId).eq('proposal_id', p.id);
      counts = true;
    }
    if (counts) await sb.from('deals').update({ value: total }).eq('id', dealId);
  } catch {
    // never let CRM bookkeeping break proposal sync
  }
}

async function syncLibrary(sb: SupabaseClient, ledger: StoredLedger) {
  const lib = useLibraryStore.getState();
  const localDoc = libDocOf(lib);
  const { data: remote, error } = await sb
    .from('builder_shared')
    .select('data, updated_at, updated_by')
    .eq('key', 'library')
    .maybeSingle();
  if (error) throw error;

  if (!remote) {
    const { data, error: insErr } = await sb
      .from('builder_shared')
      .insert({ key: 'library', data: JSON.parse(JSON.stringify({ templates: lib.templates, settings: lib.settings })), updated_by: ledger.owner })
      .select('updated_at')
      .single();
    if (insErr) throw insErr;
    ledger.lib = { token: data.updated_at as string, doc: localDoc };
    return;
  }

  const remoteData = remote.data as { templates: unknown; settings: object };
  const remoteDoc = libDocOf(remoteData);
  const token = remote.updated_at as string;
  const adopt = () => {
    useLibraryStore.setState(remoteData as Partial<ReturnType<typeof useLibraryStore.getState>>);
    ledger.lib = { token, doc: remoteDoc };
  };

  if (!ledger.lib) {
    // first pass on this device: the team's library is the library
    if (localDoc !== remoteDoc) adopt();
    else ledger.lib = { token, doc: remoteDoc };
    return;
  }
  const localChanged = localDoc !== ledger.lib.doc;
  if (token !== ledger.lib.token) {
    if (localChanged && localDoc !== remoteDoc) {
      toast.error(
        `Card library was just changed by ${nameOf(remote.updated_by as string)}`,
        'Their version is kept — make your library change again if you still need it.'
      );
    }
    adopt();
    return;
  }
  if (!localChanged) return;
  const { data: saved, error: upErr } = await sb
    .from('builder_shared')
    .update({
      data: JSON.parse(JSON.stringify({ templates: lib.templates, settings: lib.settings })),
      updated_at: new Date().toISOString(),
      updated_by: ledger.owner,
    })
    .eq('key', 'library')
    .eq('updated_at', token)
    .select('updated_at');
  if (upErr) throw upErr;
  if (!saved?.length) {
    again = true; // changed underneath us — next pass adopts theirs
    return;
  }
  ledger.lib = { token: saved[0].updated_at as string, doc: localDoc };
}

function nameOf(email?: string | null) {
  if (!email) return 'a teammate';
  return email.split('@')[0];
}

// ── conflict resolution (called from the banners) ─────────────────────────
/** Keep this device's version: it replaces the team's copy. */
export function keepMine(copyId: string) {
  const all = useProposalStore.getState().proposals;
  const copy = all[copyId];
  if (!copy?.conflictOf) return;
  const now = new Date().toISOString();
  const { conflictOf, ...rest } = copy;
  const winner: Proposal = { ...rest, id: conflictOf.id, updatedAt: now };
  useProposalStore.setState((s) => {
    const next = { ...s.proposals, [winner.id]: winner };
    delete next[copyId];
    return { proposals: next };
  });
  void requestSync();
}

/** Keep the team's version: this device's copy goes away. */
export function keepTheirs(copyId: string) {
  useProposalStore.setState((s) => {
    const next = { ...s.proposals };
    delete next[copyId];
    return { proposals: next };
  });
}

// ── wiring ────────────────────────────────────────────────────────────────
let wired = false;

export function useBuilderCloudSync(): void {
  useEffect(() => {
    if (!supabase || wired) return;
    wired = true; // one engine per page, however often React mounts this
    const sb = supabase;
    let pushTimer: number | undefined;
    const soon = () => {
      if (applyingRemote) return;
      window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(() => void requestSync(), 1200);
    };

    const unsubStore = useProposalStore.subscribe(soon);
    const unsubLib = useLibraryStore.subscribe(soon);
    const onOnline = () => void requestSync();
    const onOffline = () => useBuilderSyncStatus.getState().set('offline');
    const onVisible = () => document.visibilityState === 'visible' && void requestSync();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void requestSync();
    }, 60_000);

    // teammates' changes arrive instantly; the pass decides what to do
    const channel = sb
      .channel('builder-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, () => void requestSync())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'builder_shared' }, () => void requestSync())
      .subscribe();

    // sign-in / sign-out / token refresh — a pass is always safe to run
    const { data: authSub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') useBuilderSyncStatus.getState().set('signedOut');
      else void requestSync();
    });
    void requestSync();

    return () => {
      wired = false;
      window.clearTimeout(pushTimer);
      window.clearInterval(tick);
      unsubStore();
      unsubLib();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      void sb.removeChannel(channel);
      authSub.subscription.unsubscribe();
    };
  }, []);
}
