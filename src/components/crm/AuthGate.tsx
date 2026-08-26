// Wraps all /crm/* routes. Magic-link sign-in; the real access gate is the
// team_members table (RLS) — an authenticated stranger reads nothing, and we
// show them a "not on the team" screen instead of empty lists.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase, CRM_ENABLED } from '@/lib/supabase';
import { AppHeader } from '@/components/layout/AppHeader';

type TeamState = 'checking' | 'member' | 'outsider';

export { useSessionEmail } from '@/lib/crm/session';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [team, setTeam] = useState<TeamState>('checking');
  const location = useLocation();
  const navigate = useNavigate();

  // "Sign in" buttons elsewhere in the app link to /crm?next=<where-I-was>;
  // once the gate opens, send the person back there instead of stranding
  // them in the CRM.
  useEffect(() => {
    if (!session || team !== 'member') return;
    const next = new URLSearchParams(location.search).get('next');
    if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/crm')) {
      navigate(next, { replace: true });
    }
  }, [session, team, location.search, navigate]);

  useEffect(() => {
    if (!supabase) return;
    // getSession alone trusts localStorage; getUser round-trips to the server.
    // A stale/revoked session (the "looks signed in but nothing works" state)
    // gets cleared here so the sign-in card appears instead of a zombie UI.
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const { error } = await supabase!.auth.getUser();
        if (error) {
          await supabase!.auth.signOut();
          setSession(null);
          return;
        }
      }
      setSession(data.session);
    });
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
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const emailOk = email.includes('@');

  // Installed-PWA hardening: supabase-js auth calls can hang on a stuck
  // internal lock (seen on iOS standalone). Never let the button freeze —
  // time out, tell the user, and let them retry.
  const withTimeout = async <T,>(p: Promise<T>, ms = 15_000): Promise<T | 'timeout'> =>
    Promise.race([p, new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), ms))]);

  const signIn = async () => {
    setBusy(true);
    setError('');
    const result = await withTimeout(
      supabase!.auth.signInWithPassword({ email: email.trim(), password })
    );
    setBusy(false);
    if (result === 'timeout') {
      setError(
        'Sign-in is taking too long. Fully close this app (swipe it away), reopen it, and try again — that clears a stuck connection.'
      );
      return;
    }
    const err = result.error;
    if (err) {
      setError(
        /invalid login credentials/i.test(err.message)
          ? "Email and password don't match. New here? Ask your admin to set your password — or use the email link below."
          : err.message
      );
    }
    // success: onAuthStateChange takes over
  };

  const sendLink = async () => {
    setBusy(true);
    setError('');
    const result = await withTimeout(
      supabase!.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/crm` },
      })
    );
    setBusy(false);
    if (result === 'timeout') {
      setError('Took too long — fully close the app, reopen, and try again.');
      return;
    }
    if (result.error) setError(result.error.message);
    else setSent(true);
  };

  return (
    <Shell>
      <div className="mx-auto max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-black">PFCS CRM</h2>
        <p className="mt-1 text-sm text-brand-steel">
          Team members only. New here? Your admin sets you up with a password.
        </p>
        <div className="mt-4 grid gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <>
              <Input
                type="password"
                placeholder="Password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === 'Enter' && emailOk && password.length >= 8 && signIn()}
              />
              <Button className="w-full" onClick={signIn} disabled={busy || !emailOk || password.length < 8}>
                {busy ? '…' : 'Sign in'}
              </Button>
              <Button variant="outline" className="w-full" onClick={sendLink} disabled={busy || !emailOk}>
                {busy ? '…' : 'Forgot password? Email me a sign-in link'}
              </Button>
              {sent && (
                <p className="text-sm text-brand-steel">
                  Sent — check your email and open the link on this device.
                </p>
              )}
            </>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </Shell>
  );
}
