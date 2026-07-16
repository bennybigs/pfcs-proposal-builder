import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CardTemplate, CompanySettings } from '@/types';
import { SEED_CARD_TEMPLATES } from '@/constants/seedCardTemplates';
import { DEFAULT_SETTINGS } from '@/constants/defaults';
import { debouncedLocalStorage, STORAGE_KEYS } from '@/store/persistence';
import { formatProposalNumber } from '@/lib/proposalNumber';

interface LibraryState {
  templates: CardTemplate[];
  settings: CompanySettings;
  addTemplate: (template: CardTemplate) => void;
  updateTemplate: (id: string, patch: Partial<CardTemplate>) => void;
  deleteTemplate: (id: string) => void;
  resetTemplates: () => void;
  updateSettings: (patch: Partial<CompanySettings>) => void;
  /** Returns the next formatted proposal number and increments the counter. */
  consumeProposalNumber: () => string;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      templates: SEED_CARD_TEMPLATES,
      settings: DEFAULT_SETTINGS,

      addTemplate: (template) =>
        set((s) => ({ templates: [...s.templates, template] })),

      updateTemplate: (id, patch) =>
        set((s) => ({
          templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),

      deleteTemplate: (id) =>
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      resetTemplates: () => set({ templates: SEED_CARD_TEMPLATES }),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      consumeProposalNumber: () => {
        const { settings } = get();
        const number = formatProposalNumber(
          settings.proposalNumberPrefix,
          settings.nextProposalNumber
        );
        set({
          settings: { ...settings, nextProposalNumber: settings.nextProposalNumber + 1 },
        });
        return number;
      },
    }),
    {
      name: STORAGE_KEYS.library,
      version: 1,
      storage: createJSONStorage(() => debouncedLocalStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LibraryState>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings ?? {}) },
        };
      },
    }
  )
);
