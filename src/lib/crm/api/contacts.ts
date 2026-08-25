import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { refreshLeadBadge } from '@/lib/crm/leadBadge';
import type { Contact, LeadStatus } from '@/lib/crm/types';

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

// ── lead lifecycle ───────────────────────────────────────────────────
// The transitions live here so every code path (Leads inbox, contact page,
// deal creation, quick-log) moves leads the same way.

export async function setLeadStatus(
  id: string,
  status: LeadStatus,
  holdUntil?: string | null
): Promise<void> {
  const { error } = await sb()
    .from('contacts')
    .update({
      lead_status: status,
      lead_hold_until: status === 'on_hold' ? (holdUntil ?? null) : null,
    })
    .eq('id', id);
  if (error) throw error;
  void refreshLeadBadge();
}

/** First human touch: new → contacted. No-op for every other status. */
export async function markContactedIfNew(contactId: string): Promise<void> {
  await sb()
    .from('contacts')
    .update({ lead_status: 'contacted' })
    .eq('id', contactId)
    .eq('lead_status', 'new');
  void refreshLeadBadge();
}

/** A deal exists / moved forward: anything still in triage → qualified. */
export async function promoteLeadOnDeal(contactId: string): Promise<void> {
  await sb()
    .from('contacts')
    .update({ lead_status: 'qualified', lead_hold_until: null })
    .eq('id', contactId)
    .in('lead_status', ['new', 'contacted', 'on_hold', 'none']);
  void refreshLeadBadge();
}

/** A deal was won — they're a customer now, whatever came before. */
export async function markCustomer(contactId: string): Promise<void> {
  await sb()
    .from('contacts')
    .update({ lead_status: 'customer', lead_hold_until: null })
    .eq('id', contactId)
    .neq('lead_status', 'customer');
  void refreshLeadBadge();
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
