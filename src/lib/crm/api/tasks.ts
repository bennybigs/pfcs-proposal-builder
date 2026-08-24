import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { Task } from '@/lib/crm/types';
import { logActivity } from './activities';

export interface TaskInput {
  contact_id?: string | null;
  deal_id?: string | null;
  title: string;
  due_date?: string | null;
  assigned_to?: string;
}

export async function listOpenAndRecentTasks(): Promise<Task[]> {
  const { data, error } = await sb()
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as Task[];
}

export async function createTask(input: TaskInput): Promise<Task> {
  const email = (await sb().auth.getUser()).data.user?.email ?? '';
  const { data, error } = await sb()
    .from('tasks')
    .insert({ assigned_to: email, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

/** Completing a task also logs it on the timeline (Phase 3 rule). */
export async function completeTask(task: Task): Promise<void> {
  const { error } = await sb()
    .from('tasks')
    .update({ done: true, done_at: new Date().toISOString() })
    .eq('id', task.id);
  if (error) throw error;
  if (task.contact_id || task.deal_id) {
    let contactId = task.contact_id;
    if (!contactId && task.deal_id) {
      const { data } = await sb().from('deals').select('contact_id').eq('id', task.deal_id).maybeSingle();
      contactId = data?.contact_id ?? null;
    }
    if (contactId) {
      await logActivity({
        contact_id: contactId,
        deal_id: task.deal_id,
        type: 'note',
        body: `Task completed: ${task.title}`,
      });
    }
  }
}

export async function reopenTask(id: string): Promise<void> {
  const { error } = await sb().from('tasks').update({ done: false, done_at: null }).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await sb().from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ── hooks ────────────────────────────────────────────────────────────

export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: listOpenAndRecentTasks });
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['activities'] });
  };
  const create = useMutation({ mutationFn: createTask, onSuccess: invalidate });
  const complete = useMutation({ mutationFn: completeTask, onSuccess: invalidate });
  const reopen = useMutation({ mutationFn: reopenTask, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteTask, onSuccess: invalidate });
  return { create, complete, reopen, remove };
}
