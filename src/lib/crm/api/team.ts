import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';

export interface TeamMember {
  email: string;
  display_name: string;
  is_admin: boolean;
  email_notifications: boolean;
  added_at: string;
}

/** Display name for a member email, with a sensible fallback. */
export function memberName(team: TeamMember[], email: string | null | undefined): string {
  if (!email) return 'Unassigned';
  const m = team.find((t) => t.email === email);
  return m?.display_name || email;
}

export async function setEmailNotifications(email: string, on: boolean): Promise<void> {
  const { error, count } = await sb()
    .from('team_members')
    .update({ email_notifications: on }, { count: 'exact' })
    .eq('email', email);
  if (error) throw error;
  if (!count) throw new Error('No permission to change this preference.');
}

export async function renameTeamMember(email: string, displayName: string): Promise<void> {
  const { error, count } = await sb()
    .from('team_members')
    .update({ display_name: displayName.trim() }, { count: 'exact' })
    .eq('email', email);
  if (error) throw error;
  if (!count) throw new Error('No permission — only admins can rename.');
}

export async function setAdmin(email: string, isAdmin: boolean): Promise<void> {
  const { error, count } = await sb()
    .from('team_members')
    .update({ is_admin: isAdmin }, { count: 'exact' })
    .eq('email', email);
  if (error) throw error;
  if (!count) throw new Error('No permission — only admins can change roles.');
}

export async function listTeam(): Promise<TeamMember[]> {
  const { data, error } = await sb().from('team_members').select('*').order('added_at');
  if (error) throw error;
  return data as TeamMember[];
}

export async function addTeamMember(email: string, displayName: string): Promise<void> {
  const { error } = await sb()
    .from('team_members')
    .insert({ email: email.trim().toLowerCase(), display_name: displayName.trim() });
  if (error) throw error;
}

/** RLS refuses to delete your OWN row — the team can never be emptied. */
export async function removeTeamMember(email: string): Promise<void> {
  const { error, count } = await sb()
    .from('team_members')
    .delete({ count: 'exact' })
    .eq('email', email);
  if (error) throw error;
  if (!count) throw new Error("You can't remove yourself.");
}

export function useTeam() {
  return useQuery({ queryKey: ['team'], queryFn: listTeam });
}

export function useTeamMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['team'] });
  const add = useMutation({
    mutationFn: ({ email, name }: { email: string; name: string }) => addTeamMember(email, name),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: removeTeamMember, onSuccess: invalidate });
  const admin = useMutation({
    mutationFn: ({ email, isAdmin }: { email: string; isAdmin: boolean }) => setAdmin(email, isAdmin),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({ email, name }: { email: string; name: string }) => renameTeamMember(email, name),
    onSuccess: invalidate,
  });
  const emailPref = useMutation({
    mutationFn: ({ email, on }: { email: string; on: boolean }) => setEmailNotifications(email, on),
    onSuccess: invalidate,
  });
  return { add, remove, admin, rename, emailPref };
}
