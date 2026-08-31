// Sign-in gate for the proposal builder (Ben's call, 2026-08-26: proposals
// carry customer names and pricing — a signed-out device shows nothing).
// Checks only the LOCAL session — no server round-trip — so a signed-in
// device keeps working fully offline. The customer share view (/view) is
// deliberately NOT gated: customers open those links with no account.
// Deployments with no Supabase env keep the original local-only behavior.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { supabase } from '@/lib/supabase';

type GateState = 'checking' | 'in' | 'out';

export function BuilderGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const { pathname } = useLocation();

  useEffect(() => {
    if (!supabase) {
      setState('in'); // no auth configured — original local-only app
      return;
    }
    supabase.auth.getSession().then(({ data }) => setState(data.session ? 'in' : 'out'));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setState(s ? 'in' : 'out'));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (state === 'in') return <>{children}</>;

  return (
    <div className="min-h-screen bg-brand-gray-bg">
      <AppHeader />
      <main className="mx-auto max-w-[1800px] px-4 py-10">
        {state === 'out' && (
          <div className="mx-auto max-w-sm rounded-lg border bg-white p-6 text-center shadow-sm">
            <Lock className="mx-auto h-6 w-6 text-brand-steel/60" />
            <h2 className="mt-2 text-lg font-semibold text-brand-black">Team members only</h2>
            <p className="mt-1 text-sm text-brand-steel">
              Proposals carry customer details and pricing, so they stay locked until you sign
              in. Once signed in, everything keeps working offline on this device.
            </p>
            <Link
              to={`/crm?next=${encodeURIComponent(pathname)}`}
              className="mt-4 inline-block rounded-md bg-brand-orange px-5 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              Sign in
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
