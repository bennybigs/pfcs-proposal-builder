// /crm/team — click any person to open their card: rename, admin toggle,
// password, remove — every control in one place, with room to grow.
// Role rules: admins manage everyone; members can open cards read-only and
// change only their own password. The server enforces all of it independently
// (RLS + /api/team-password); the UI just mirrors the rules.
import { useEffect, useState } from 'react';
import { ChevronRight, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { useSessionEmail } from '@/components/crm/AuthGate';
import { supabase } from '@/lib/supabase';
import { useTeam, useTeamMutations, type TeamMember } from '@/lib/crm/api/team';
import { formatDateUS } from '@/lib/format';

/** Emails the CRM invitation (app link + install steps; password goes by text). */
async function sendInvite(toEmail: string, toName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = (await supabase!.auth.getSession()).data.session?.access_token;
    const r = await fetch('/api/invite-teammate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toEmail, toName }),
    });
    const body = (await r.json()) as { error?: string };
    if (!r.ok) {
      return {
        ok: false,
        error: r.status === 503 ? 'Email sending is not configured yet.' : body.error ?? `HTTP ${r.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default function Team() {
  const { data: team = [], isLoading } = useTeam();
  const { add } = useTeamMutations();
  const myEmail = useSessionEmail();
  const iAmAdmin = !!team.find((m) => m.email === myEmail)?.is_admin;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const selected = team.find((m) => m.email === selectedEmail) ?? null;

  const submit = async () => {
    if (!email.includes('@')) return;
    try {
      await add.mutateAsync({ email, name });
      const addr = email.trim().toLowerCase();
      setSelectedEmail(addr);
      setEmail('');
      setName('');
      const inv = await sendInvite(addr, name);
      if (inv.ok) {
        toast.success(
          'Teammate added — invitation emailed',
          'They got the app link and install steps. Now set their starter password on this card and text it to them.'
        );
      } else {
        toast.success('Teammate added');
        toast.error(
          'Invitation email not sent',
          `${inv.error ?? ''} You can text them the link instead — and retry from their card.`
        );
      }
    } catch (err) {
      toast.error('Could not add', err instanceof Error ? err.message : String(err));
    }
  };

  // reps see only themselves — the roster is admin territory
  const visibleTeam = iAmAdmin ? team : team.filter((m) => m.email === myEmail);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-bold text-brand-black">{iAmAdmin ? 'Team' : 'My account'}</h1>
      <p className="mt-1 text-sm text-brand-steel">
        {iAmAdmin
          ? 'Tap anyone to manage them — name, admin rights, password, removal. To onboard someone: add their email, set a starter password on their card, then text them the link and password.'
          : 'Tap your row to change your password or notification settings.'}
      </p>

      {iAmAdmin && (
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
      )}

      {isLoading ? (
        <p className="mt-6 text-sm text-brand-steel">Loading…</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          {visibleTeam.map((m) => (
            <button
              key={m.email}
              onClick={() => setSelectedEmail(m.email)}
              className="flex w-full items-center gap-3 border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-brand-gray-bg"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-brand-black">
                  {m.display_name || m.email}
                  {m.email === myEmail && <span className="ml-2 text-xs text-brand-steel">(you)</span>}
                </div>
                {m.display_name && <div className="text-xs text-brand-steel">{m.email}</div>}
              </div>
              {m.is_admin && (
                <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> admin
                </Badge>
              )}
              <span className="shrink-0 text-xs text-brand-steel">added {formatDateUS(m.added_at)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-brand-steel/50" />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <MemberCard
          member={selected}
          isSelf={selected.email === myEmail}
          iAmAdmin={iAmAdmin}
          adminCount={team.filter((m) => m.is_admin).length}
          onClose={() => setSelectedEmail(null)}
        />
      )}
    </div>
  );
}

function MemberCard({
  member,
  isSelf,
  iAmAdmin,
  adminCount,
  onClose,
}: {
  member: TeamMember;
  isSelf: boolean;
  iAmAdmin: boolean;
  adminCount: number;
  onClose: () => void;
}) {
  const { remove, admin, rename, emailPref } = useTeamMutations();
  const [nameDraft, setNameDraft] = useState(member.display_name);
  const [password, setPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);
  useEffect(() => setNameDraft(member.display_name), [member.display_name]);

  const lastAdmin = member.is_admin && adminCount <= 1;
  const canPassword = iAmAdmin || isSelf;

  const saveName = async () => {
    if (nameDraft.trim() === member.display_name) return;
    try {
      await rename.mutateAsync({ email: member.email, name: nameDraft });
      toast.success('Name updated');
    } catch (err) {
      toast.error('Could not rename', err instanceof Error ? err.message : String(err));
    }
  };

  const toggleAdmin = async (next: boolean) => {
    try {
      await admin.mutateAsync({ email: member.email, isAdmin: next });
      toast.success(next ? 'Made admin' : 'Admin removed',
        next ? `${member.display_name || member.email} can now manage the team.` : undefined);
    } catch (err) {
      toast.error('Could not change role', err instanceof Error ? err.message : String(err));
    }
  };

  const setPasswordNow = async () => {
    if (password.length < 8) return;
    setPasswordBusy(true);
    try {
      const token = (await supabase!.auth.getSession()).data.session?.access_token;
      const r = await fetch('/api/team-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetEmail: member.email, newPassword: password }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      toast.success('Password set', isSelf
        ? 'Use it to sign in anywhere.'
        : `Text it to ${member.display_name || member.email} with ${window.location.origin}/crm — they sign straight in.`);
      setPassword('');
    } catch (err) {
      toast.error('Could not set password', err instanceof Error ? err.message : String(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  const removeNow = async () => {
    try {
      await remove.mutateAsync(member.email);
      toast.success('Removed', `${member.email} no longer has access. Everything they logged stays.`);
      onClose();
    } catch (err) {
      toast.error('Could not remove', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* max-h + scroll: on phones this card is taller than the screen — without
          this the Danger zone (and the remove confirmation) sit unreachable
          below the fold, which reads as "the button does nothing". */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {member.display_name || member.email}
            {isSelf && <span className="text-xs font-normal text-brand-steel">(you)</span>}
            {member.is_admin && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <ShieldCheck className="h-3 w-3" /> admin
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-brand-steel">
          {member.email} · added {formatDateUS(member.added_at)}
        </p>

        {iAmAdmin && (
          <Section label="Name">
            <Input
              value={nameDraft}
              placeholder="Display name"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && saveName()}
              onBlur={saveName}
            />
          </Section>
        )}

        {iAmAdmin && (
          <Section label="Role">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium text-brand-black">Administrator</div>
                <div className="text-xs text-brand-steel">
                  {lastAdmin
                    ? 'The last admin can’t be demoted — promote someone else first.'
                    : 'Can add and remove teammates, set passwords, and grant admin.'}
                </div>
              </div>
              <Switch
                checked={member.is_admin}
                disabled={lastAdmin || admin.isPending}
                onCheckedChange={toggleAdmin}
              />
            </div>
          </Section>
        )}

        {(iAmAdmin || isSelf) && (
          <Section label="Notifications">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium text-brand-black">Email notifications</div>
                <div className="text-xs text-brand-steel">
                  Deal assignments and inbound leads, sent to {member.email}. The in-app bell
                  always works.
                </div>
              </div>
              <Switch
                checked={member.email_notifications}
                disabled={emailPref.isPending}
                onCheckedChange={async (on) => {
                  try {
                    await emailPref.mutateAsync({ email: member.email, on });
                    toast.success(on ? 'Email notifications on' : 'Email notifications off');
                  } catch (err) {
                    toast.error('Could not update', err instanceof Error ? err.message : String(err));
                  }
                }}
              />
            </div>
          </Section>
        )}

        {canPassword && (
          <Section label={isSelf ? 'Your password' : 'Password'}>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="New password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Return') && setPasswordNow()}
              />
              <Button onClick={setPasswordNow} disabled={password.length < 8 || passwordBusy}>
                {passwordBusy ? '…' : 'Set'}
              </Button>
            </div>
            {!isSelf && (
              <p className="mt-1 text-xs text-brand-steel">
                Works even before their first sign-in — text it to them with the link.
              </p>
            )}
          </Section>
        )}

        {iAmAdmin && !isSelf && (
          <Section label="Invitation">
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <div className="min-w-0 flex-1 text-xs text-brand-steel">
                Emails the app link and phone install steps. Their password still goes by text —
                never by email.
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={inviteBusy}
                onClick={async () => {
                  setInviteBusy(true);
                  const inv = await sendInvite(member.email, member.display_name);
                  setInviteBusy(false);
                  if (inv.ok) toast.success('Invitation emailed', `Sent to ${member.email}.`);
                  else toast.error('Could not send invitation', inv.error);
                }}
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                {inviteBusy ? 'Sending…' : 'Email invitation'}
              </Button>
            </div>
          </Section>
        )}

        {iAmAdmin && !isSelf && (
          <Section label="Danger zone">
            {removeArmed ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                <span className="flex-1 text-sm text-red-700">
                  Remove {member.display_name || member.email}? Access ends immediately;
                  their logged work stays.
                </span>
                <Button size="sm" variant="outline" onClick={() => setRemoveArmed(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={removeNow}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setRemoveArmed(true)}
                disabled={lastAdmin}
                title={lastAdmin ? 'The last admin can’t be removed' : undefined}
              >
                Remove from team…
              </Button>
            )}
          </Section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-brand-steel">{label}</Label>
      {children}
    </div>
  );
}
