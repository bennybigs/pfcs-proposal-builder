import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { Activity, ActivityType } from '@/lib/crm/types';

export interface ActivityInput {
  contact_id: string;
  deal_id?: string | null;
  type: ActivityType;
  body?: string;
  happened_at?: string;
}

export async function logActivity(input: ActivityInput): Promise<Activity> {
  const email = (await sb().auth.getUser()).data.user?.email ?? '';
  const { data, error } = await sb()
    .from('activities')
    .insert({ body: '', ...input, logged_by: email })
    .select()
    .single();
  if (error) throw error;
  return data as Activity;
}

export async function listActivitiesForContact(contactId: string): Promise<Activity[]> {
  const { data, error } = await sb()
    .from('activities')
    .select('*')
    .eq('contact_id', contactId)
    .order('happened_at', { ascending: false });
  if (error) throw error;
  return data as Activity[];
}

/** All activities, newest first — used for gone-quiet computation. */
export async function listRecentActivities(limitTo = 2000): Promise<Activity[]> {
  const { data, error } = await sb()
    .from('activities')
    .select('*')
    .order('happened_at', { ascending: false })
    .limit(limitTo);
  if (error) throw error;
  return data as Activity[];
}

export function useContactActivities(contactId: string | undefined) {
  return useQuery({
    queryKey: ['activities', 'contact', contactId],
    queryFn: () => listActivitiesForContact(contactId!),
    enabled: !!contactId,
  });
}

export function useRecentActivities() {
  return useQuery({ queryKey: ['activities', 'recent'], queryFn: () => listRecentActivities() });
}

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logActivity,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });
}
