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

export function grandTotal(proposal: Proposal): number {
  return proposal.cards.reduce(
    (sum, c) =>
      c.isEnabled && c.hasPrice && c.includeInTotal && typeof c.price === 'number'
        ? sum + c.price
        : sum,
    0
  );
}

interface ProposalsState {
  proposals: Record<string, Proposal>;
  createProposal: (templateId: string | null, customerName: string) => Proposal;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  deleteProposal: (id: string) => void;
  duplicateProposal: (id: string) => Proposal | undefined;
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
            intro: '',
            cards,
            showGrandTotalToCustomer: true,
            paymentSchedule: JSON.parse(JSON.stringify(DEFAULT_PAYMENT_SCHEDULE)),
            disclaimers: lib.settings.defaultDisclaimers,
          };
          set((s) => ({ proposals: { ...s.proposals, [proposal.id]: proposal } }));
          return proposal;
        },

        updateProposal: (id, patch) => mutate(id, (p) => ({ ...p, ...patch })),

        deleteProposal: (id) =>
          set((s) => {
            const next = { ...s.proposals };
            delete next[id];
            return { proposals: next };
          }),

        duplicateProposal: (id) => {
          const source = get().proposals[id];
          if (!source) return undefined;
          const lib = useLibraryStore.getState();
          const now = new Date().toISOString();
          const copy: Proposal = {
            ...JSON.parse(JSON.stringify(source)),
            id: uuid(),
            proposalNumber: lib.consumeProposalNumber(),
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            cards: source.cards.map((c) => ({ ...c, id: uuid() })),
          };
          set((s) => ({ proposals: { ...s.proposals, [copy.id]: copy } }));
          return copy;
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
