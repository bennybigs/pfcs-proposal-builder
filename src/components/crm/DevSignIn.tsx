// One-click sign-in for local development. Renders only on the dev server
// (import.meta.env.DEV), talks only to the dev-only /api/dev-login
// middleware, and is stripped from production builds entirely.
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface Member {
  email: string;
  display_name: string;
  role?: string;
}

export function DevSignIn() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch('/api/dev-login')
      .then((r) => r.json())
      .then((d) => (d.members ? setMembers(d.members) : setError(d.error ?? 'unavailable')))
      .catch(() => setError('dev sign-in unavailable'));
  }, []);

  if (!import.meta.env.DEV || !supabase) return null;

  const sb = supabase;
  const signIn = async (email: string) => {
    setBusy(email);
    setError(null);
    try {
      const r = await fetch('/api/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      const { error: sessErr } = await sb.auth.setSession({
        access_token: d.access_token,
        refresh_token: d.refresh_token,
      });
      if (sessErr) throw sessErr;
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 rounded-md border border-dashed border-brand-orange/50 bg-brand-orange/5 p-3 text-left">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-orange">
        <Zap className="h-3.5 w-3.5" /> Local development
      </div>
      <p className="mt-0.5 text-xs text-brand-steel">
        One click, no password. This panel exists only on localhost.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 grid gap-1.5">
        {members.map((m) => (
          <Button
            key={m.email}
            size="sm"
            variant="outline"
            className="justify-start"
            disabled={!!busy}
            onClick={() => void signIn(m.email)}
          >
            {busy === m.email ? 'Signing in…' : `${m.display_name || m.email}`}
            <span className="ml-1 text-xs text-brand-steel">
              {m.role ? `· ${m.role}` : ''}
            </span>
          </Button>
        ))}
        {!members.length && !error && <p className="text-xs text-brand-steel">Loading…</p>}
      </div>
    </div>
  );
}
