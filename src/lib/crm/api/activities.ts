import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { markContactedIfNew } from './contacts';
import { HUMAN_TOUCH_TYPES, type Activity, type ActivityType } from '@/lib/crm/types';

export interface ActivityInput {
  contact_id: string;
  deal_id?: string | null;
  type: ActivityType;
  body?: string;
  happened_at?: string;
  source?: string;              // default 'manual'; 'system' entries are immutable (RLS)
  direction?: string | null;
  outcome?: string | null;
  duration_min?: number | null;
}

export async function logActivity(input: ActivityInput): Promise<Activity> {
  const email = (await sb().auth.getUser()).data.user?.email ?? '';
  const { data, error } = await sb()
    .from('activities')
    .insert({ body: '', ...input, logged_by: email })
    .select()
    .single();
  if (error) throw error;
  // Lead lifecycle: the first human touch flips a new lead to "contacted".
  if (HUMAN_TOUCH_TYPES.includes(input.type)) {
    try {
      await markContactedIfNew(input.contact_id);
    } catch {
      // lifecycle bookkeeping must never fail the log itself
    }
  }
  return data as Activity;
}

/** System bookkeeping entry — immutable once written (RLS enforces it). */
export async function logSystem(
  contactId: string,
  dealId: string | null,
  body: string,
  type: ActivityType = 'field_change'
): Promise<void> {
  try {
    await logActivity({ contact_id: contactId, deal_id: dealId, type, body, source: 'system' });
  } catch {
    // bookkeeping must never break the action it describes
  }
}

/** Author-only edit of a manual entry (RLS backs this up). */
export async function updateActivity(id: string, body: string): Promise<void> {
  const { error, count } = await sb()
    .from('activities')
    .update({ body, edited_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', id);
  if (error) throw error;
  if (!count) throw new Error('Only the author can edit this entry.');
}

export async function deleteActivity(id: string): Promise<void> {
  const { error, count } = await sb().from('activities').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (!count) throw new Error('Only the author can delete this entry.');
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['contacts'] }); // lead status may have flipped
    },
  });
}
