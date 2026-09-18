import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Card, CardTemplate, Proposal } from '@/types';
import {
  SEED_PROPOSAL_TEMPLATES,
  TEMPLATE_REFERENCE_SUFFIX,
} from '@/constants/seedProposalTemplates';
import { DEFAULT_PAYMENT_SCHEDULE } from '@/constants/defaults';
import { debouncedLocalStorage, STORAGE_KEYS } from '@/store/persistence';
import { uuid } from '@/lib/uuid';
import { lastName } from '@/lib/format';
import { useLibraryStore } from '@/store/useLibraryStore';
import {
  buildNumber,
  familyOf,
  latestOf,
  lineageOf,
  nextSeq,
} from '@/lib/proposalFamily';

export function cardFromTemplate(template: CardTemplate): Card {
  return {
    id: uuid(),
    templateId: template.id === 'custom' ? undefined : template.id,
    title: template.title,
    content: template.defaultContent,
    isEnabled: true,
    hasPrice: false,
    price: undefined,
    showPriceToCustomer: true,
    includeInTotal: true,
  };
}

interface ProposalsState {
  proposals: Record<string, Proposal>;
  createProposal: (templateId: string | null, customerName: string) => Proposal;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  deleteProposal: (id: string) => void;
  archiveProposal: (id: string) => void;
  restoreProposal: (id: string) => void;
  /** Fresh, unrelated copy (new number, no customer link) — for another customer. */
  duplicateProposal: (id: string) => Proposal | undefined;
  /** Rev B of what was sent: same deal, same base number; the old one is kept as replaced. */
  reviseProposal: (id: string) => Proposal | undefined;
  /** Another option of the same quote, open side by side with the original. */
  /** An alternative version alongside this one, with a name of its own. */
  duplicateVersion: (id: string, name?: string) => Proposal | undefined;
  /** Save an unsaved revision/option: numbers it and applies it to its source. */
  saveVersion: (id: string) => Proposal | undefined;
  /** Throw away an unsaved revision/option. */
  discardVersion: (id: string) => void;
  importProposal: (proposal: Proposal) => Proposal;

  addCard: (proposalId: string, card: Card, index?: number) => void;
  updateCard: (proposalId: string, cardId: string, patch: Partial<Card>) => void;
  removeCard: (proposalId: string, cardId: string) => void;
  moveCard: (proposalId: string, fromIndex: number, toIndex: number) => void;
  duplicateCard: (proposalId: string, cardId: string) => void;
}

function touch(proposal: Proposal): Proposal {
  return { ...proposal, updatedAt: new Date().toISOString() };
}

/** Deep copy as a brand-new draft — new ids, lifecycle flags cleared. */
function cloneAsDraft(source: Proposal, patch: Partial<Proposal>): Proposal {
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(source)) as Proposal;
  // lifecycle flags belong to the source, not the copy
  delete copy.archivedAt;
  delete copy.deletedAt;
  delete copy.deletedBy;
  delete copy.supersededBy;
  delete copy.notChosen;
  delete copy.sentAt; // a new version has not been sent to anyone yet
  delete copy.numberPending; // a version shares its family's number
  delete copy.pendingVersion;
  return {
    ...copy,
    id: uuid(),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    cards: source.cards.map((c) => ({ ...c, id: uuid() })),
    ...patch,
  };
}

export const useProposalStore = create<ProposalsState>()(
  persist(
    (set, get) => {
      const mutate = (id: string, fn: (p: Proposal) => Proposal) => {
        const existing = get().proposals[id];
        if (!existing) return;
        set((s) => ({ proposals: { ...s.proposals, [id]: touch(fn(existing)) } }));
      };

      return {
        proposals: {},

        createProposal: (templateId, customerName) => {
          const lib = useLibraryStore.getState();
          const template = SEED_PROPOSAL_TEMPLATES.find((t) => t.id === templateId);
          const cards = (template?.defaultCardTemplateIds ?? [])
            .map((cid) => lib.templates.find((t) => t.id === cid))
            .filter((t): t is CardTemplate => Boolean(t))
            .map(cardFromTemplate);

          const now = new Date().toISOString();
          const last = lastName(customerName);
          const suffix = (template && TEMPLATE_REFERENCE_SUFFIX[template.id]) || 'Project';
          const proposal: Proposal = {
            id: uuid(),
            proposalNumber: lib.consumeProposalNumber(),
            numberPending: true,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            customer: {
              fullName: customerName,
              streetAddress: '',
              cityStateZip: '',
              phone: '',
              email: '',
            },
            project: {
              streetAddress: '',
              cityStateZip: '',
              county: '',
              referenceName: last ? `${last} ${suffix}` : suffix,
            },
            salesRep: lib.settings.defaultSalesRep,
            salesRepPhone: lib.settings.defaultSalesRepPhone ?? '',
            salesRepEmail: lib.settings.defaultSalesRepEmail ?? '',
            intro: '',
            cards,
            showGrandTotalToCustomer: true,
            paymentSchedule: JSON.parse(JSON.stringify(DEFAULT_PAYMENT_SCHEDULE)),
            disclaimers: lib.settings.defaultDisclaimers,
          };
          set((s) => ({ proposals: { ...s.proposals, [proposal.id]: proposal } }));
          return proposal;
        },

        updateProposal: (id, patch) => {
          mutate(id, (p) => ({
            ...p,
            ...patch,
            // the day it went to the customer, recorded once
            ...(patch.status && patch.status !== 'draft' && !p.sentAt
              ? { sentAt: new Date().toISOString() }
              : {}),
          }));
          // signing one version settles the others: they become "not chosen"
          // (still kept, still in the list). Reopening one by hand clears it.
          if (patch.status === 'accepted' || patch.status === 'contract') {
            const all = get().proposals;
            const chosen = all[id];
            if (!chosen) return;
            const next = { ...all };
            let changed = false;
            for (const q of familyOf(Object.values(all), chosen)) {
              if (q.id === id || q.supersededBy || q.notChosen) continue;
              if (q.status === 'accepted' || q.status === 'contract') continue;
              next[q.id] = touch({ ...q, notChosen: true, status: 'declined' });
              changed = true;
            }
            if (changed) set({ proposals: next });
          } else if (patch.status && patch.status !== 'declined') {
            const p = get().proposals[id];
            if (p?.notChosen) mutate(id, (q) => ({ ...q, notChosen: undefined }));
          }
        },

        // Deleting writes a tombstone rather than dropping the record: the
        // deletion then syncs like any other edit and wins by last-write, so
        // another device's stale copy can never bring it back.
        deleteProposal: (id) =>
          mutate(id, (p) => ({
            ...p,
            deletedAt: new Date().toISOString(),
            archivedAt: undefined,
          })),

        archiveProposal: (id) =>
          mutate(id, (p) => ({ ...p, archivedAt: new Date().toISOString() })),

        restoreProposal: (id) =>
          mutate(id, (p) => ({ ...p, archivedAt: undefined, deletedAt: undefined })),

        duplicateProposal: (id) => {
          const source = get().proposals[id];
          if (!source) return undefined;
          const lib = useLibraryStore.getState();
          const copy = cloneAsDraft(source, {
            proposalNumber: lib.consumeProposalNumber(),
            numberPending: true,
          });
          // a copy for someone else starts its own history and its own link
          delete copy.crm;
          delete copy.lineage;
          set((s) => ({ proposals: { ...s.proposals, [copy.id]: copy } }));
          return copy;
        },

        reviseProposal: (id) => {
          const all = get().proposals;
          if (!all[id]) return undefined;
          const source = latestOf(all, all[id]); // always revise the newest
          const lineage = {
            baseNumber: lineageOf(source).baseNumber,
            seq: nextSeq(Object.values(all), source),
            kind: 'revision' as const,
            from: source.id,
          };
          // an unsaved working copy — the original is untouched until Save
          const copy = cloneAsDraft(source, {
            lineage,
            proposalNumber: buildNumber(lineage),
            pendingVersion: { kind: 'revision', sourceId: source.id },
          });
          set((s) => ({ proposals: { ...s.proposals, [copy.id]: copy } }));
          return copy;
        },

        duplicateVersion: (id, name) => {
          const all = get().proposals;
          const source = all[id];
          if (!source) return undefined;
          const lineage = {
            baseNumber: lineageOf(source).baseNumber,
            seq: nextSeq(Object.values(all), source),
            kind: 'duplicate' as const,
            from: source.id,
          };
          const copy = cloneAsDraft(source, {
            lineage,
            versionName: name?.trim() || undefined,
            proposalNumber: buildNumber(lineage),
            pendingVersion: { kind: 'duplicate', sourceId: source.id },
          });
          set((s) => ({ proposals: { ...s.proposals, [copy.id]: copy } }));
          return copy;
        },

        saveVersion: (id) => {
          const all = get().proposals;
          const draft = all[id];
          if (!draft?.pendingVersion) return draft;
          const { kind, sourceId } = draft.pendingVersion;
          const source = all[sourceId];
          // the letter is settled at save, against what actually exists now
          const lineage = {
            ...lineageOf(draft),
            kind,
            from: sourceId,
            seq: source ? nextSeq(Object.values(all), source) : lineageOf(draft).seq,
          };
          const next: Record<string, Proposal> = {
            ...all,
            [id]: touch({
              ...draft,
              lineage,
              proposalNumber: buildNumber(lineage),
              pendingVersion: undefined,
            }),
          };
          // a revision replaces what it came from; a duplicate stands beside it
          if (source && kind === 'revision') {
            next[source.id] = touch({ ...source, supersededBy: id });
          }
          // the first extra version makes the original part of a family
          if (source && !source.lineage) {
            const base = lineageOf(source).baseNumber;
            next[source.id] = touch({ ...(next[source.id] ?? source), lineage: { baseNumber: base, seq: 0 } });
          }
          set({ proposals: next });
          return next[id];
        },

        // never synced, so dropping the record outright is safe
        discardVersion: (id) => {
          const p = get().proposals[id];
          if (!p?.pendingVersion) return;
          set((s) => {
            const next = { ...s.proposals };
            delete next[id];
            return { proposals: next };
          });
        },

        importProposal: (proposal) => {
          const imported: Proposal = {
            ...proposal,
            id: uuid(),
            updatedAt: new Date().toISOString(),
          };
          set((s) => ({ proposals: { ...s.proposals, [imported.id]: imported } }));
          return imported;
        },

        addCard: (proposalId, card, index) =>
          mutate(proposalId, (p) => {
            const cards = [...p.cards];
            const at = index === undefined ? cards.length : Math.max(0, Math.min(index, cards.length));
            cards.splice(at, 0, card);
            return { ...p, cards };
          }),

        updateCard: (proposalId, cardId, patch) =>
          mutate(proposalId, (p) => ({
            ...p,
            cards: p.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
          })),

        removeCard: (proposalId, cardId) =>
          mutate(proposalId, (p) => ({
            ...p,
            cards: p.cards.filter((c) => c.id !== cardId),
          })),

        moveCard: (proposalId, fromIndex, toIndex) =>
          mutate(proposalId, (p) => {
            if (
              fromIndex < 0 ||
              fromIndex >= p.cards.length ||
              toIndex < 0 ||
              toIndex >= p.cards.length
            ) {
              return p;
            }
            const cards = [...p.cards];
            const [moved] = cards.splice(fromIndex, 1);
            cards.splice(toIndex, 0, moved);
            return { ...p, cards };
          }),

        duplicateCard: (proposalId, cardId) =>
          mutate(proposalId, (p) => {
            const index = p.cards.findIndex((c) => c.id === cardId);
            if (index < 0) return p;
            const copy: Card = {
              ...p.cards[index],
              id: uuid(),
              title: `${p.cards[index].title} (copy)`,
            };
            const cards = [...p.cards];
            cards.splice(index + 1, 0, copy);
            return { ...p, cards };
          }),
      };
    },
    {
      name: STORAGE_KEYS.proposals,
      version: 1,
      storage: createJSONStorage(() => debouncedLocalStorage),
    }
  )
);
