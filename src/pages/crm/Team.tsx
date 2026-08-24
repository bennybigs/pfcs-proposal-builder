// /crm/team — self-serve team management. Add a teammate's email here, send
// them the /crm link, and they sign themselves in with a magic link. RLS
// guard rail: nobody can remove their own row, so the list can't be emptied.
import { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { useTeam, useTeamMutations, type TeamMember } from '@/lib/crm/api/team';
import { formatDateUS } from '@/lib/format';

export default function Team() {
  const { data: team = [], isLoading } = useTeam();
  const { add, remove } = useTeamMutations();
  const myEmail = useSessionEmail();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);

  const submit = async () => {
    if (!email.includes('@')) return;
    try {
      await add.mutateAsync({ email, name });
      toast.success(
        'Teammate added',
        `Send them ${window.location.origin}/crm — they sign in with their email, no password.`
      );
      setEmail('');
      setName('');
    } catch (err) {
      toast.error('Could not add', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-bold text-brand-black">Team</h1>
      <p className="mt-1 text-sm text-brand-steel">
        Everyone listed here can use the CRM. Add an email, then text or email them the link
        — <b>{window.location.origin}/crm</b> — and they sign themselves in. Nobody else can
        see anything, even if they find the link.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 rounded-lg border bg-white p-2 shadow-sm">
        <Input
          type="email"
          className="min-w-44 flex-1"
          placeholder="teammate@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && submit()}
        />
        <Input
          className="w-36"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && submit()}
        />
        <Button onClick={submit} disabled={!email.includes('@') || add.isPending}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Add
        </Button>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-brand-steel">Loading…</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          {team.map((m) => (
            <div key={m.email} className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-brand-black">
                  {m.display_name || m.email}
                  {m.email === myEmail && <span className="ml-2 text-xs text-brand-steel">(you)</span>}
                </div>
                {m.display_name && <div className="text-xs text-brand-steel">{m.email}</div>}
              </div>
              <span className="shrink-0 text-xs text-brand-steel">added {formatDateUS(m.added_at)}</span>
              {m.email !== myEmail && (
                <button
                  onClick={() => setConfirmRemove(m)}
                  className="shrink-0 text-brand-steel/60 hover:text-red-600"
                  title="Remove from the team"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {confirmRemove?.display_name || confirmRemove?.email}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-brand-steel">
            They lose access to the CRM immediately. Nothing they logged is deleted — calls,
            deals, and tasks they created all stay.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const m = confirmRemove!;
                setConfirmRemove(null);
                try {
                  await remove.mutateAsync(m.email);
                  toast.success('Removed', `${m.email} no longer has access.`);
                } catch (err) {
                  toast.error('Could not remove', err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
