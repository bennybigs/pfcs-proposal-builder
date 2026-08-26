// Who is signed in, reactively. Its own module (not AuthGate) so the app
// header can use it without a circular import.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useSessionEmail(): string {
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ''));
    // stay reactive: sign-in/out anywhere updates every consumer
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user.email ?? '')
    );
    return () => sub.subscription.unsubscribe();
  }, []);
  return email;
}
