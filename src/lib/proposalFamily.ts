// Revisions and options — pure logic, no React.
//
// One quote = one base number (PFCS-2026-0014). Changing what was sent makes
// a REVISION (Rev B replaces Rev A, which stays as the record of what the
// customer saw). Giving them a choice makes an OPTION (Option 1 and Option 2
// stay open side by side until one is signed). The two combine:
// "PFCS-2026-0014 Option 2 Rev B".
import type { Proposal } from '@/types';

export interface Lineage {
  baseNumber: string;
  option?: number;
  rev: number;
}

export function lineageOf(p: Proposal): Lineage {
  return {
    baseNumber: p.lineage?.baseNumber ?? p.proposalNumber,
    option: p.lineage?.option,
    rev: p.lineage?.rev ?? 0,
  };
}

/** 0 → "A", 1 → "B" … */
export const revLetter = (rev: number) => String.fromCharCode(65 + Math.max(0, rev));

export function buildNumber(l: Lineage): string {
  return [
    l.baseNumber,
    l.option ? `Option ${l.option}` : '',
    l.rev > 0 ? `Rev ${revLetter(l.rev)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** "Option 2 · Rev B" — empty for a plain one-off proposal. */
export function familyLabel(p: Proposal): string {
  const l = lineageOf(p);
  return [l.option ? `Option ${l.option}` : '', l.rev > 0 ? `Rev ${revLetter(l.rev)}` : '']
    .filter(Boolean)
    .join(' · ');
}

// unsaved revisions/options don't exist yet as far as numbering is concerned
const alive = (p: Proposal) => !p.deletedAt && !p.pendingVersion;

/** Every proposal sharing this one's base number (including itself). */
export function familyOf(all: Proposal[], p: Proposal): Proposal[] {
  const base = lineageOf(p).baseNumber;
  return all.filter((q) => alive(q) && lineageOf(q).baseNumber === base);
}

export function nextRev(all: Proposal[], p: Proposal): number {
  const l = lineageOf(p);
  const revs = familyOf(all, p)
    .filter((q) => (lineageOf(q).option ?? 0) === (l.option ?? 0))
    .map((q) => lineageOf(q).rev);
  return Math.max(l.rev, ...revs) + 1;
}

export function nextOption(all: Proposal[], p: Proposal): number {
  const options = familyOf(all, p).map((q) => lineageOf(q).option ?? 1);
  return Math.max(1, ...options) + 1;
}

/** The latest version in a revision chain (follows supersededBy). */
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
 * Why this proposal shouldn't be edited in place. Drafts edit freely; once
 * it has gone to the customer, changes belong in a revision so the record of
 * what they were quoted stays intact.
 */
export function lockReason(p: Proposal): LockReason {
  if (p.supersededBy) return 'superseded';
  if (p.notChosen) return 'not-chosen';
  if (p.status !== 'draft') return 'sent';
  return null;
}

/** Link title the CRM shows: "Yoder Barndominium — Option 2 · Rev B". */
export function linkTitle(p: Proposal): string {
  const name = p.project.referenceName || p.customer.fullName || p.proposalNumber;
  const label = familyLabel(p);
  return label ? `${name} — ${label}` : name;
}
