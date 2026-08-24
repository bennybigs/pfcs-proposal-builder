// /crm/team — self-serve team management. Add a teammate's email here, send
// them the /crm link, and they sign themselves in with a magic link. RLS
// guard rail: nobody can remove their own row, so the list can't be emptied.
import { useState } from 'react';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';
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
import { supabase } from '@/lib/supabase';
import { useTeam, useTeamMutations, type TeamMember } from '@/lib/crm/api/team';
import { formatDateUS } from '@/lib/format';

export default function Team() {
  const { data: team = [], isLoading } = useTeam();
  const { add, remove } = useTeamMutations();
  const myEmail = useSessionEmail();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);
  const [passwordFor, setPasswordFor] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const setPassword = async () => {
    if (!passwordFor || newPassword.length < 8) return;
    setPasswordBusy(true);
    try {
      const token = (await supabase!.auth.getSession()).data.session?.access_token;
      const r = await fetch('/api/team-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetEmail: passwordFor.email, newPassword }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      toast.success(
        'Password set',
        passwordFor.email === myEmail
          ? 'Use it to sign in on your phone.'
          : `Text it to ${passwordFor.display_name || passwordFor.email} — they sign straight in, no account setup.`
      );
      setPasswordFor(null);
      setNewPassword('');
    } catch (err) {
      toast.error('Could not set password', err instanceof Error ? err.message : String(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  const submit = async () => {
    if (!email.includes('@')) return;
    try {
      await add.mutateAsync({ email, name });
      toast.success(
        'Teammate added',
        `Send them ${window.location.origin}/crm — they enter this email, pick a password, and they're in.`
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
        Everyone listed here can use the CRM. Add an email, then text them the link —{' '}
        <b>{window.location.origin}/crm</b> — where they enter that email, pick a password,
        and tap &quot;Create account&quot;. They&apos;re in immediately; no waiting on any
        email. Nobody else can see anything, even if they find the link.
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
              <button
                onClick={() => { setPasswordFor(m); setNewPassword(''); }}
                className="shrink-0 text-brand-steel/60 hover:text-brand-orange"
                title="Set or reset this person's password"
              >
                <KeyRound className="h-4 w-4" />
              </button>
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

      <Dialog open={!!passwordFor} onOpenChange={(o) => !o && setPasswordFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Set password — {passwordFor?.display_name || passwordFor?.email}
              {passwordFor?.email === myEmail ? ' (you)' : ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-brand-steel">
            {passwordFor?.email === myEmail
              ? 'Pick a password for your own sign-in (phone, laptop, anywhere).'
              : 'Pick a starter password and text it to them with the link. It works immediately — even if they never created an account. They (or you) can change it here anytime.'}
          </p>
          <Input
            type="text"
            autoFocus
            placeholder="Password (8+ characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && setPassword()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordFor(null)}>Cancel</Button>
            <Button onClick={setPassword} disabled={newPassword.length < 8 || passwordBusy}>
              {passwordBusy ? '…' : 'Set password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
