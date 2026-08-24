import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import type { Contact } from '@/lib/crm/types';

export type ContactInput = Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'owner'>;

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await sb().from('contacts').select('*').order('name');
  if (error) throw error;
  return data as Contact[];
}

export async function getContact(id: string): Promise<Contact | null> {
  const { data, error } = await sb().from('contacts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Contact | null;
}

export async function createContact(input: Partial<ContactInput> & { name: string }): Promise<Contact> {
  const user = (await sb().auth.getUser()).data.user;
  const { data, error } = await sb()
    .from('contacts')
    .insert({ ...input, owner: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Contact;
}

export async function updateContact(id: string, patch: Partial<ContactInput>): Promise<void> {
  const { error } = await sb().from('contacts').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await sb().from('contacts').delete().eq('id', id);
  if (error) throw error;
}

// ── hooks ────────────────────────────────────────────────────────────

export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: listContacts });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  });
}

export function useContactMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['contacts'] });
  const create = useMutation({ mutationFn: createContact, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ContactInput> }) => updateContact(id, patch),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: deleteContact, onSuccess: invalidate });
  return { create, update, remove };
}
