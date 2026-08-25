// In-app notifications. RLS scopes every query to the signed-in member's own
// rows, so these functions never filter by user. The bell polls every 60s —
// Realtime isn't enabled on this project, and a minute is plenty for a
// two-person shop.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { Notification } from '@/lib/crm/types';

export async function listNotifications(limitTo = 20): Promise<Notification[]> {
  const { data, error } = await sb()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limitTo);
  if (error) throw error;
  return data as Notification[];
}

export async function markRead(id: string): Promise<void> {
  const { error } = await sb()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  const { error } = await sb()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw error;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: markRead, onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: invalidate });
  return { read, readAll };
}
