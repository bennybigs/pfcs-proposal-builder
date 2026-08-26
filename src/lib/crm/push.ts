// Client side of web push: subscribe this device and save the subscription
// to Supabase (RLS ties it to the signed-in member). The server half lives in
// /api/notify-flush, which pushes to every device a recipient has enabled.
import { sb, supabase } from '@/lib/supabase';

// VAPID public key — public by design (it identifies our server to the push
// service); the private half lives only in Vercel env.
export const VAPID_PUBLIC_KEY =
  'BNSvFty1DWlANGxUy27gxvMdC5VIDaUZ0CzCUAx4-bWsqAWToI31HnVJ-i1vCOZAMdtkoGRoNYixG1R-VYAI0M0';

export type PushSupport =
  | 'ready'          // supported, can subscribe right now
  | 'needs-install'  // iOS Safari outside the installed app — install first
  | 'unsupported';

export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'ready';
  }
  // iOS exposes PushManager only inside an installed (standalone) PWA
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (isIos && !standalone) return 'needs-install';
  return 'unsupported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Is THIS device already subscribed? */
export async function isSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'ready') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

/**
 * Ask permission, subscribe, and save to the database. Returns 'subscribed',
 * 'denied' (user said no / OS blocks it), or 'error'.
 */
export async function enablePush(): Promise<'subscribed' | 'denied' | 'error'> {
  try {
    if (pushSupport() !== 'ready' || !supabase) return 'error';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    // ready() never resolves where no SW registers (e.g. the dev server) — time out
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
    ]);
    if (!reg) return 'error';
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error';
    const email = (await sb().auth.getUser()).data.user?.email;
    if (!email) return 'error';
    const { error } = await sb().from('push_subscriptions').upsert(
      {
        user_email: email,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;
    return 'subscribed';
  } catch (err) {
    console.error('enablePush failed', err);
    return 'error';
  }
}

/** Unsubscribe this device and remove its row. */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try {
      await sb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    } finally {
      await sub.unsubscribe();
    }
  }
}
