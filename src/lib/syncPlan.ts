// The sync decision table — pure, no React, no network.
//
// The server is the record. Each device keeps a LEDGER: for every proposal,
// the version (data.updatedAt) that this device and the server last agreed
// on. Comparing the local copy, the server copy and that agreed version
// gives exactly one answer per proposal:
//
//   local == server                      → in step
//   local unchanged, server changed      → take the server's
//   local changed,   server unchanged    → send ours
//   both changed                         → CONFLICT: server's stays, ours is
//                                          kept on this device as a copy for
//                                          the user to resolve (never lost)
//   on server only                       → take it
//   on device only, never agreed         → made here (maybe offline) → send it
//   on device only, agreed before        → removed on the server → drop it
//
// Versions are only compared for EQUALITY, so a device with a wrong clock
// can't win or lose anything by it.
import type { Proposal } from '@/types';

/** What the server reports per proposal — just enough to decide. */
export interface ServerVersion {
  id: string;
  updatedAt: string;
  deleted: boolean;
}

export type Ledger = Record<string, string>; // proposal id → agreed data.updatedAt

export interface SyncPlan {
  adopt: string[]; // fetch the server copy and keep it locally
  push: Proposal[]; // send the local copy (new or changed)
  drop: string[]; // remove locally (gone from the server)
  conflicts: Proposal[]; // ours changed AND theirs changed: theirs is adopted, ours kept as a copy
  agreed: Record<string, string>; // ledger entries to record, nothing to transfer
}

/** Kept on this device only: unsaved revisions/options and conflict copies. */
export const isLocalOnly = (p: Proposal) => Boolean(p.pendingVersion || p.conflictOf);

/** A device-only proposal untouched this long is old leftovers, not fresh offline work. */
export const STALE_LOCAL_MS = 14 * 24 * 60 * 60 * 1000;

export function planSync(
  local: Record<string, Proposal>,
  server: ServerVersion[],
  ledger: Ledger
): SyncPlan {
  const plan: SyncPlan = { adopt: [], push: [], drop: [], conflicts: [], agreed: {} };
  const serverById = new Map(server.map((s) => [s.id, s]));

  for (const theirs of server) {
    const id = theirs.id;
    const mine = local[id];
    const base = ledger[id];
    if (!mine) {
      plan.adopt.push(id);
      continue;
    }
    if (isLocalOnly(mine)) continue; // local-only copies have their own ids; never overwrite one
    const mineV = mine.updatedAt ?? '';
    if (mineV === theirs.updatedAt) {
      if (base !== mineV) plan.agreed[id] = mineV;
    } else if (base === mineV) {
      plan.adopt.push(id); // only the server moved
    } else if (base === theirs.updatedAt) {
      plan.push.push(mine); // only this device moved
    } else if (base === undefined) {
      // no shared history yet (first sync on this device since the ledger
      // existed): the newer edit wins, which is what sync always did
      if (mineV > theirs.updatedAt) plan.push.push(mine);
      else plan.adopt.push(id);
    } else if (mine.deletedAt && theirs.deleted) {
      plan.adopt.push(id); // both deleted it — nothing to resolve
    } else {
      plan.conflicts.push(mine);
    }
  }

  for (const [id, mine] of Object.entries(local)) {
    if (serverById.has(id) || isLocalOnly(mine)) continue;
    if (ledger[id] !== undefined || mine.deletedAt) {
      // the server had it and no longer does, or it was made and deleted
      // here before ever syncing — either way there is nothing to keep
      plan.drop.push(id);
    } else {
      plan.push.push(mine); // made on this device — send it
    }
  }
  return plan;
}

/**
 * Device-only leftovers that haven't been touched in weeks go up ARCHIVED:
 * nothing is lost, and nothing old lands in the working list by surprise.
 */
export function shouldArchiveOnUpload(
  p: Proposal,
  ledger: Ledger,
  now: number = Date.now()
): boolean {
  if (ledger[p.id] !== undefined || p.archivedAt || p.deletedAt) return false;
  const touched = Date.parse(p.updatedAt || p.createdAt || '');
  return Number.isFinite(touched) && now - touched > STALE_LOCAL_MS;
}
