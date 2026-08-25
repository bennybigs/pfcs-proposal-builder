// Contact files — Supabase Storage bucket "contact-files", one folder per
// contact ({contact_id}/{filename}). Private bucket: reads go through
// short-lived signed URLs; every operation is team-gated by storage RLS.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';

const BUCKET = 'contact-files';

export interface ContactFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export async function listFiles(contactId: string): Promise<ContactFile[]> {
  const { data, error } = await sb().storage.from(BUCKET).list(contactId, {
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => ({
      name: f.name,
      path: `${contactId}/${f.name}`,
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
      createdAt: f.created_at ?? '',
    }));
}

export async function uploadFile(contactId: string, file: File): Promise<void> {
  // keep the visible name, dodge collisions with an upsert
  const safe = file.name.replace(/[^\w.\- ()]+/g, '_');
  const { error } = await sb().storage.from(BUCKET).upload(`${contactId}/${safe}`, file, {
    upsert: true,
  });
  if (error) throw error;
}

export async function fileUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeFile(path: string): Promise<void> {
  const { error } = await sb().storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function useContactFiles(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact_files', contactId],
    queryFn: () => listFiles(contactId!),
    enabled: !!contactId,
  });
}

export function useFileMutations(contactId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['contact_files', contactId] });
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(contactId, file),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: removeFile, onSuccess: invalidate });
  return { upload, remove };
}

export const prettySize = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
