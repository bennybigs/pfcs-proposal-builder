// One-line banner under the CRM nav asking to turn on lock-screen alerts.
// Shows only when it can actually help: signed in, this device not yet
// subscribed, not previously dismissed, and permission not hard-denied.
// On iOS Safari (outside the installed app) it explains the install step.
import { useEffect, useState } from 'react';
import { BellRing, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { enablePush, isSubscribed, pushSupport } from '@/lib/crm/push';

const DISMISS_KEY = 'pfcs-push-banner-dismissed';

export function PushBanner() {
  const [show, setShow] = useState<'enable' | 'install' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (localStorage.getItem(DISMISS_KEY)) return;
      const support = pushSupport();
      if (support === 'unsupported') return;
      if (support === 'needs-install') {
        setShow('install');
        return;
      }
      if (Notification.permission === 'denied') return;
      if (await isSubscribed()) return;
      if (!cancelled) setShow('enable');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(null);
  };

  const enable = async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result === 'subscribed') {
      toast.success('Push notifications on', 'New leads and assignments will buzz this device.');
      setShow(null);
    } else if (result === 'denied') {
      toast.error('Notifications blocked', 'Allow notifications for this site in your browser settings, then try again.');
    } else {
      toast.error('Could not enable push', 'Try again, or use a different browser.');
    }
  };

  return (
    <div className="border-b bg-brand-orange/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-sm text-brand-black">
        {show === 'enable' ? (
          <>
            <BellRing className="h-4 w-4 shrink-0 text-brand-orange" />
            <span className="min-w-0 flex-1">
              Get a buzz on this device when a lead comes in or a deal is assigned to you.
            </span>
            <Button size="sm" className="h-7" onClick={enable} disabled={busy}>
              {busy ? 'Enabling…' : 'Enable notifications'}
            </Button>
          </>
        ) : (
          <>
            <Download className="h-4 w-4 shrink-0 text-brand-orange" />
            <span className="min-w-0 flex-1">
              For lock-screen alerts on iPhone: Share → <b>Add to Home Screen</b>, then open the
              installed app and you&apos;ll be offered notifications.
            </span>
          </>
        )}
        <button onClick={dismiss} title="Dismiss" className="shrink-0 rounded p-1 text-brand-steel hover:bg-white/60">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
