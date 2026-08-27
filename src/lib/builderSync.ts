// Cloud sync for the proposal builder: proposals (one row each) and the
// shared card library + company settings (one row). localStorage remains the
// offline cache and the app works exactly as before when signed out — but a
// signed-in team member's edits live in Supabase, visible to the whole team.
//
// Model: last-write-wins per proposal, keyed on the proposal's own updatedAt
// (touched on every edit). Deleting locally deletes the server row; realtime
// events pull remote changes in. Simple and safe for a 2–3 person team.
import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase, CRM_ENABLED } from '@/lib/supabase';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { Proposal } from '@/types';

export type BuilderSyncStatus = 'off' | 'signedOut' | 'syncing' | 'synced' | 'error';

interface SyncState {
  status: BuilderSyncStatus;
  set: (s: BuilderSyncStatus) => void;
}
export const useBuilderSyncStatus = create<SyncState>((set) => ({
  status: CRM_ENABLED ? 'signedOut' : 'off',
  set: (status) => set({ status }),
}));

interface ProposalRow {
  id: string;
  data: Proposal;
  updated_at: string;
  updated_by: string;
}

// module-level guards shared by the effect
let applyingRemote = false;
const lastPushed = new Map<string, string>(); // proposal id → updatedAt we know the server has
let lastLibraryPushed = '';

export function useBuilderCloudSync(): void {
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let cancelled = false;
    let pushTimer: number | undefined;
    let unsubStore: (() => void) | undefined;
    let unsubLib: (() => void) | undefined;
    let channel: ReturnType<typeof sb.channel> | undefined;
    const setStatus = useBuilderSyncStatus.getState().set;

    const email = async () => (await sb.auth.getUser()).data.user?.email ?? '';

    const adoptRemoteProposals = (rows: ProposalRow[]) => {
      const local = useProposalStore.getState().proposals;
      const next = { ...local };
      let changed = false;
      for (const row of rows) {
        const mine = next[row.id];
        if (!mine || (row.data.updatedAt ?? '') > (mine.updatedAt ?? '')) {
          next[row.id] = row.data;
          changed = true;
        }
        lastPushed.set(row.id, row.data.updatedAt ?? '');
      }
      if (changed) {
        applyingRemote = true;
        useProposalStore.setState({ proposals: next });
        applyingRemote = false;
      }
    };

    const pushDirty = async () => {
      const who = await email();
      const local = useProposalStore.getState().proposals;
      const dirty = Object.values(local).filter(
        (p) => lastPushed.get(p.id) !== (p.updatedAt ?? '')
      );
      for (const p of dirty) {
        // created_by is never sent — the DB trigger stamps it on first
        // insert and upsert-updates leave it alone (rep RLS keys off it)
        const { error } = await sb.from('proposals').upsert({
          id: p.id,
          data: p,
          updated_at: new Date().toISOString(),
          updated_by: who,
        });
        if (error) {
          // 42501 = row-level security: this proposal belongs to someone
          // else now (stale cache on this device, or the deal moved away).
          // Drop the local copy instead of looping on an error forever.
          if ((error as { code?: string }).code === '42501') {
            applyingRemote = true;
            const next = { ...useProposalStore.getState().proposals };
            delete next[p.id];
            useProposalStore.setState({ proposals: next });
            applyingRemote = false;
            lastPushed.delete(p.id);
            continue;
          }
          throw error;
        }
        lastPushed.set(p.id, p.updatedAt ?? '');
      }
      // deletions: ids the server knows that no longer exist locally
      for (const id of [...lastPushed.keys()]) {
        if (!local[id]) {
          const { error } = await sb.from('proposals').delete().eq('id', id);
          if (error) throw error;
          lastPushed.delete(id);
        }
      }
      // shared library + settings (one LWW document)
      const lib = useLibraryStore.getState();
      const libDoc = JSON.stringify({ templates: lib.templates, settings: lib.settings });
      if (libDoc !== lastLibraryPushed) {
        const { error } = await sb.from('builder_shared').upsert({
          key: 'library',
          data: JSON.parse(libDoc) as object,
          updated_at: new Date().toISOString(),
          updated_by: who,
        });
        if (error) throw error;
        lastLibraryPushed = libDoc;
      }
    };

    const schedulePush = () => {
      if (applyingRemote) return;
      setStatus('syncing');
      window.clearTimeout(pushTimer);
      pushTimer = window.setTimeout(async () => {
        try {
          await pushDirty();
          if (!cancelled) setStatus('synced');
        } catch {
          if (!cancelled) setStatus('error');
        }
      }, 1200);
    };

    const start = async () => {
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        setStatus('signedOut');
        return;
      }
      setStatus('syncing');
      try {
        // pull server set, merge LWW, then push anything local-only/newer
        const { data: rows, error } = await sb.from('proposals').select('*');
        if (error) throw error;
        adoptRemoteProposals((rows ?? []) as ProposalRow[]);

        // Rep walls: a local copy that is CRM-linked to a deal this account
        // can't see belongs to someone else — clear it from this device.
        // (Admins see every deal, so nothing is ever pruned for them.)
        const serverIds = new Set(((rows ?? []) as ProposalRow[]).map((r) => r.id));
        const { data: visibleDeals } = await sb.from('deals').select('id');
        const visible = new Set((visibleDeals ?? []).map((d: { id: string }) => d.id));
        const localNow = useProposalStore.getState().proposals;
        const pruned = { ...localNow };
        let prunedAny = false;
        for (const p of Object.values(localNow)) {
          if (serverIds.has(p.id)) continue; // server says it's mine — keep
          if (p.crm?.dealId && !visible.has(p.crm.dealId)) {
            delete pruned[p.id];
            prunedAny = true;
            lastPushed.delete(p.id);
          }
        }
        if (prunedAny) {
          applyingRemote = true;
          useProposalStore.setState({ proposals: pruned });
          applyingRemote = false;
        }

        const { data: libRow } = await sb
          .from('builder_shared')
          .select('data')
          .eq('key', 'library')
          .maybeSingle();
        if (libRow?.data) {
          const remote = libRow.data as { templates?: unknown[]; settings?: object };
          const libDoc = JSON.stringify(remote);
          if (libDoc !== JSON.stringify({ templates: useLibraryStore.getState().templates, settings: useLibraryStore.getState().settings })) {
            applyingRemote = true;
            useLibraryStore.setState(remote as Partial<ReturnType<typeof useLibraryStore.getState>>);
            applyingRemote = false;
          }
          lastLibraryPushed = JSON.stringify({
            templates: useLibraryStore.getState().templates,
            settings: useLibraryStore.getState().settings,
          });
        }

        await pushDirty();
        if (cancelled) return;
        setStatus('synced');
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }

      // local edits → debounced push
      unsubStore = useProposalStore.subscribe(schedulePush);
      unsubLib = useLibraryStore.subscribe(schedulePush);

      // remote edits → adopt
      channel = sb
        .channel('builder-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const gone = (payload.old as { id?: string }).id;
            if (gone && useProposalStore.getState().proposals[gone]) {
              applyingRemote = true;
              const next = { ...useProposalStore.getState().proposals };
              delete next[gone];
              useProposalStore.setState({ proposals: next });
              applyingRemote = false;
              lastPushed.delete(gone);
            }
            return;
          }
          const row = payload.new as ProposalRow;
          if (row?.id) adoptRemoteProposals([row]);
        })
        .subscribe();
    };

    void start();
    const { data: authSub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) void start();
      else setStatus('signedOut');
    });

    return () => {
      cancelled = true;
      window.clearTimeout(pushTimer);
      unsubStore?.();
      unsubLib?.();
      if (channel) void sb.removeChannel(channel);
      authSub.subscription.unsubscribe();
    };
  }, []);
}
