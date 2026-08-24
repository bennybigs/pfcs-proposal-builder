// Wraps all /crm/* routes. Magic-link sign-in; the real access gate is the
// team_members table (RLS) — an authenticated stranger reads nothing, and we
// show them a "not on the team" screen instead of empty lists.
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase, CRM_ENABLED } from '@/lib/supabase';
import { AppHeader } from '@/components/layout/AppHeader';

type TeamState = 'checking' | 'member' | 'outsider';

export function useSessionEmail(): string {
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ''));
  }, []);
  return email;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [team, setTeam] = useState<TeamState>('checking');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    let cancelled = false;
    supabase
      .from('team_members')
      .select('email')
      .limit(1)
      .then(({ data, error }) => {
        // RLS: a non-member's select returns an empty array, not an error
        if (!cancelled) setTeam(error || !data?.length ? 'outsider' : 'member');
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!CRM_ENABLED) {
    return (
      <Shell>
        <p className="text-sm text-brand-steel">
          The CRM isn&apos;t configured on this deployment (missing Supabase environment). The
          proposal builder works normally.
        </p>
      </Shell>
    );
  }
  if (session === undefined) return <Shell />;
  if (!session) return <SignIn />;
  if (team === 'checking') return <Shell />;
  if (team === 'outsider') {
    return (
      <Shell>
        <h2 className="text-lg font-semibold text-brand-black">Not on the team</h2>
        <p className="mt-1 text-sm text-brand-steel">
          You&apos;re signed in as {session.user.email}, but that address isn&apos;t on the PFCS
          team list. Ask Ben to add you.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => supabase!.auth.signOut()}>
          Sign out
        </Button>
      </Shell>
    );
  }
  return <>{children}</>;
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-gray-bg">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}

// Password-first sign-in: accounts activate instantly (auth autoconfirm is
// on), so joining the team never waits on an email being delivered. The
// magic-link path stays as a fallback. Access is still gated by team_members
// either way — an account alone sees nothing.
function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const emailOk = email.includes('@');

  const signIn = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase!.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(
        /invalid login credentials/i.test(err.message)
          ? 'No account with that email + password. New here? Use "Create account".'
          : err.message
      );
    }
    // success: onAuthStateChange takes over
  };

  const createAccount = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase!.auth.signUp({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(
        /already registered/i.test(err.message)
          ? 'That email already has an account — use "Sign in" with its password.'
          : err.message
      );
    }
  };

  const sendLink = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/crm` },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <Shell>
      <div className="mx-auto max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-black">PFCS CRM</h2>
        <p className="mt-1 text-sm text-brand-steel">
          Team sign-in. First time? Enter your email, pick a password, and hit
          &quot;Create account&quot; — you&apos;re in immediately.
        </p>
        <div className="mt-4 grid gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {mode === 'password' && (
            <>
              <Input
                type="password"
                placeholder="Password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === 'Enter' && emailOk && password.length >= 8 && signIn()}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={signIn} disabled={busy || !emailOk || password.length < 8}>
                  {busy ? '…' : 'Sign in'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={createAccount}
                  disabled={busy || !emailOk || password.length < 8}
                >
                  Create account
                </Button>
              </div>
            </>
          )}
          {mode === 'link' &&
            (sent ? (
              <p className="text-sm text-brand-steel">
                Check your email — we sent a sign-in link to <b>{email}</b>. Open it on this
                device.
              </p>
            ) : (
              <Button onClick={sendLink} disabled={busy || !emailOk}>
                {busy ? '…' : 'Email me a sign-in link'}
              </Button>
            ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            className="mt-1 text-left text-xs text-brand-steel underline-offset-2 hover:underline"
            onClick={() => {
              setMode(mode === 'password' ? 'link' : 'password');
              setError('');
              setSent(false);
            }}
          >
            {mode === 'password' ? 'Prefer an emailed sign-in link?' : 'Use a password instead'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
