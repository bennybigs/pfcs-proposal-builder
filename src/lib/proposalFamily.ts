// Versions of one quote — pure logic, no React.
//
// One quote = one base number (PFCS-2026-0014) and a list of versions:
// Version A, Version B, Version C… in the order they were made. Every
// version keeps its own dates and stays in the list.
//
//   Revise    — the next version replaces what was sent; the old one is kept
//               exactly as the customer saw it, marked Replaced.
//   Duplicate — the next version stands alongside as an alternative, with a
//               name you give it ("40x72 with lean-to"). Both stay open
//               until the customer signs one.
import type { Proposal } from '@/types';

export interface Lineage {
  baseNumber: string;
  seq: number; // 0 = Version A
  kind?: 'revision' | 'duplicate';
}

export function lineageOf(p: Proposal): Lineage {
  const l = p.lineage;
  return {
    baseNumber: l?.baseNumber ?? p.proposalNumber,
    // `rev` is the old field name, kept readable for anything made earlier
    seq: l?.seq ?? l?.rev ?? 0,
    kind: l?.kind,
  };
}

/** 0 → "A", 1 → "B" … */
export const versionLetter = (seq: number) => String.fromCharCode(65 + Math.max(0, seq));

export function buildNumber(l: Lineage): string {
  return l.seq > 0 ? `${l.baseNumber} Version ${versionLetter(l.seq)}` : l.baseNumber;
}

/** "Version B" — every proposal is a version, even when it's the only one. */
export function familyLabel(p: Proposal): string {
  return `Version ${versionLetter(lineageOf(p).seq)}`;
}

/** "Version B — 40x72 with lean-to" when it was given a name. */
export function versionTitle(p: Proposal): string {
  const label = familyLabel(p);
  return p.versionName?.trim() ? `${label} — ${p.versionName.trim()}` : label;
}

// unsaved versions and conflict copies don't exist yet as far as the list
// (and numbering) is concerned
const alive = (p: Proposal) => !p.deletedAt && !p.pendingVersion && !p.conflictOf;

/** Every version of this quote, oldest first. */
export function familyOf(all: Proposal[], p: Proposal): Proposal[] {
  const base = lineageOf(p).baseNumber;
  return all
    .filter((q) => alive(q) && lineageOf(q).baseNumber === base)
    .sort((a, b) => lineageOf(a).seq - lineageOf(b).seq);
}

/** The letter the next version gets. */
export function nextSeq(all: Proposal[], p: Proposal): number {
  const seqs = familyOf(all, p).map((q) => lineageOf(q).seq);
  return Math.max(lineageOf(p).seq, ...seqs) + 1;
}

/** The newest version in a revision chain (follows supersededBy). */
export function latestOf(byId: Record<string, Proposal>, p: Proposal): Proposal {
  let cur = p;
  const seen = new Set<string>();
  while (cur.supersededBy && byId[cur.supersededBy] && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId[cur.supersededBy];
  }
  return cur;
}

export type LockReason = 'sent' | 'superseded' | 'not-chosen' | null;

/**
 * Why this version shouldn't be edited in place. Drafts edit freely; once it
 * has gone to the customer, changes belong in a new version so the record of
 * what they were quoted stays intact.
 */
export function lockReason(p: Proposal): LockReason {
  if (p.supersededBy) return 'superseded';
  if (p.notChosen) return 'not-chosen';
  if (p.status !== 'draft') return 'sent';
  return null;
}

/** Link title the CRM shows: "Yoder Barndominium — Version B — 40x72". */
export function linkTitle(p: Proposal): string {
  const name = p.project.referenceName || p.customer.fullName || p.proposalNumber;
  const l = lineageOf(p);
  return l.seq > 0 || p.versionName ? `${name} — ${versionTitle(p)}` : name;
}
