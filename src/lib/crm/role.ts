// This account's role, available everywhere — including the proposal builder,
// which lives outside the CRM's data provider. One fetch per sign-in, kept in
// a tiny store so the header, the gate and the CRM all agree.
import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type TeamRole = 'admin' | 'sales' | 'marketing';

interface RoleState {
  role: TeamRole | null; // null until known
  loaded: boolean;
  set: (role: TeamRole | null) => void;
}
export const useRoleStore = create<RoleState>((set) => ({
  role: null,
  loaded: false,
  set: (role) => set({ role, loaded: true }),
}));

let started = false;
export function startRoleWatch(): void {
  if (started || !supabase) return;
  started = true;
  const sb = supabase;
  const load = async () => {
    const email = (await sb.auth.getSession()).data.session?.user.email;
    if (!email) {
      useRoleStore.getState().set(null);
      return;
    }
    const { data } = await sb.from('team_members').select('role, is_admin').eq('email', email).maybeSingle();
    const row = data as { role?: TeamRole; is_admin?: boolean } | null;
    useRoleStore.getState().set(row ? (row.role ?? (row.is_admin ? 'admin' : 'sales')) : null);
  };
  void load();
  sb.auth.onAuthStateChange(() => void load());
}

/** The signed-in person's role (null while loading or signed out). */
export function useMyRole(): TeamRole | null {
  const role = useRoleStore((s) => s.role);
  useEffect(() => startRoleWatch(), []);
  return role;
}

/** Marketing reads; everyone else works. Optimistic while the role loads. */
export function useCanWrite(): boolean {
  return useMyRole() !== 'marketing';
}

/** Marketing has no business in the proposal builder. */
export function useCanUseBuilder(): boolean {
  return useMyRole() !== 'marketing';
}
