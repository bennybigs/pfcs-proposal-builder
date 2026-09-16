// Team-wide proposal numbers.
//
// A new proposal gets a provisional number instantly (so creating one works
// offline), marked numberPending. On sync the database's single counter hands
// out the real one — skipping any number already used — and the proposal and
// any options/revisions made from it in the meantime take it on. A proposal
// that already went out keeps whatever number the customer has.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { buildNumber, lineageOf } from '@/lib/proposalFamily';
import type { Proposal } from '@/types';

let settling: Promise<void> | null = null;

export function settleProposalNumbers(sb: SupabaseClient): Promise<void> {
  // one at a time — overlapping pushes must not claim twice
  settling ??= run(sb).finally(() => {
    settling = null;
  });
  return settling;
}

async function run(sb: SupabaseClient): Promise<void> {
  // deleted roots count too: their surviving revisions/options still need
  // the real number
  const pending = Object.values(useProposalStore.getState().proposals).filter(
    (p) => p.numberPending
  );
  for (const root of pending) {
    const all = useProposalStore.getState().proposals;
    const current = all[root.id];
    if (!current?.numberPending) continue;
    const oldBase = lineageOf(current).baseNumber;
    // only versions actually made from this proposal — never a teammate's
    // proposal that merely shares the provisional number
    const family = Object.values(all).filter(
      (q) => lineageOf(q).baseNumber === oldBase && descendsFrom(all, q, current.id)
    );

    // nothing left alive, or something already sent (the customer holds
    // that number) — keep the number as it is
    const alive = family.filter((q) => !q.deletedAt);
    if (!alive.length || alive.some((q) => q.status !== 'draft')) {
      commit({ [current.id]: { ...current, numberPending: undefined } });
      continue;
    }

    const prefix = useLibraryStore.getState().settings.proposalNumberPrefix;
    const { data, error } = await sb.rpc('claim_proposal_number', { p_prefix: prefix });
    if (error || typeof data !== 'string') throw error ?? new Error('No proposal number returned');

    const now = new Date().toISOString();
    const patch: Record<string, Proposal> = {};
    for (const q of family) {
      const l = lineageOf(q);
      patch[q.id] = {
        ...q,
        proposalNumber: q.lineage ? buildNumber({ ...l, baseNumber: data }) : data,
        lineage: q.lineage ? { ...q.lineage, baseNumber: data } : undefined,
        numberPending: undefined,
        updatedAt: now,
      };
    }
    commit(patch);

    // keep Settings' "next number" preview honest on this device
    const n = Number(data.slice(prefix.length));
    const lib = useLibraryStore.getState();
    if (Number.isFinite(n) && lib.settings.nextProposalNumber <= n) {
      lib.updateSettings({ nextProposalNumber: n + 1 });
    }
  }
}

function descendsFrom(all: Record<string, Proposal>, q: Proposal, rootId: string): boolean {
  const seen = new Set<string>();
  let cur: Proposal | undefined = q;
  while (cur && !seen.has(cur.id)) {
    if (cur.id === rootId) return true;
    seen.add(cur.id);
    cur = cur.lineage?.from ? all[cur.lineage.from] : undefined;
  }
  return false;
}

function commit(patch: Record<string, Proposal>) {
  useProposalStore.setState((s) => ({ proposals: { ...s.proposals, ...patch } }));
}
