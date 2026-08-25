// Files on a contact — agreements, signed proposals, site photos. Stored in
// the private team bucket; opened via short-lived signed links.
import { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { fileUrl, prettySize, useContactFiles, useFileMutations } from '@/lib/crm/api/files';
import { formatDateUS } from '@/lib/format';

export function ContactFiles({ contactId }: { contactId: string }) {
  const { data: files = [], isLoading } = useContactFiles(contactId);
  const { upload, remove } = useFileMutations(contactId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [armedPath, setArmedPath] = useState<string | null>(null);

  const onPick = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is over 25 MB`);
        continue;
      }
      try {
        await upload.mutateAsync(file);
        toast.success('Uploaded', file.name);
      } catch (err) {
        toast.error(`Could not upload ${file.name}`, err instanceof Error ? err.message : String(err));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const open = async (path: string) => {
    try {
      window.open(await fileUrl(path), '_blank');
    } catch (err) {
      toast.error('Could not open file', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-brand-black">Files</h2>
        <span className="text-xs text-brand-steel">agreements, signed proposals, site photos</span>
        <div className="flex-1" />
        <input ref={inputRef} type="file" multiple className="hidden"
          onChange={(e) => onPick(e.target.files)} />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}>
          <Upload className="mr-1.5 h-3.5 w-3.5" /> {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      {isLoading ? (
        <p className="mt-2 text-sm text-brand-steel">Loading…</p>
      ) : files.length === 0 ? (
        <p className="mt-2 text-sm text-brand-steel">No files yet.</p>
      ) : (
        <div className="mt-2">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-2.5 border-b py-2 text-sm last:border-b-0">
              <FileText className="h-4 w-4 shrink-0 text-brand-steel" />
              <button onClick={() => open(f.path)}
                className="min-w-0 flex-1 truncate text-left text-brand-black hover:text-brand-orange hover:underline">
                {f.name}
              </button>
              <span className="shrink-0 text-xs text-brand-steel">{prettySize(f.size)}</span>
              {f.createdAt && <span className="hidden shrink-0 text-xs text-brand-steel sm:inline">{formatDateUS(f.createdAt)}</span>}
              {armedPath === f.path ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setArmedPath(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 bg-red-600 text-xs text-white hover:bg-red-700"
                    onClick={() => {
                      setArmedPath(null);
                      remove.mutate(f.path, { onSuccess: () => toast.success('File deleted') });
                    }}>
                    Delete
                  </Button>
                </span>
              ) : (
                <button onClick={() => setArmedPath(f.path)}
                  className="shrink-0 text-brand-steel/60 hover:text-red-600" title="Delete file…">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
