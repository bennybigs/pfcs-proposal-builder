import { useEffect, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __pfcsInstallPrompt: InstallPromptEvent | null;
  }
}

function runningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Manual install steps, per browser — used whenever no native prompt is available. */
function manualSteps(): { browser: string; steps: string } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && 'ontouchend' in document);
  if (/edg/i.test(ua)) {
    return {
      browser: 'Edge',
      steps: 'Open the ⋯ menu (top right) → Apps → "Install this site as an app".',
    };
  }
  if (/firefox/i.test(ua)) {
    return {
      browser: 'Firefox',
      steps:
        "Firefox can't install web apps. Open this site in Chrome or Edge and install from there.",
    };
  }
  if (/chrome|chromium|crios/i.test(ua)) {
    return {
      browser: 'Chrome',
      steps:
        'Look for the install icon (a monitor with a down-arrow) at the right end of the address bar and click it. If it isn\'t there, use the ⋮ menu → "Cast, save, and share" → "Install page as app".',
    };
  }
  if (/safari/i.test(ua)) {
    return {
      browser: 'Safari',
      steps: isIos
        ? 'Tap the Share button → "Add to Home Screen".'
        : 'In the menu bar choose File → "Add to Dock". (Requires macOS Sonoma or newer.)',
    };
  }
  return {
    browser: 'this browser',
    steps: 'Use your browser menu and look for "Install app" or "Add to Home Screen".',
  };
}

/**
 * Always visible until the app is actually running installed. Uses the native
 * install prompt when the browser offers one, and otherwise shows the exact
 * manual steps for that browser — never silently hides.
 */
export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    typeof window === 'undefined' ? null : window.__pfcsInstallPrompt
  );
  const [installed, setInstalled] = useState(runningInstalled());
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onAvailable = () => setPromptEvent(window.__pfcsInstallPrompt);
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
      setShowHelp(false);
    };
    // Both the early-capture relay and the raw event, in case this mounts first.
    window.addEventListener('pfcs-installable', onAvailable);
    window.addEventListener('beforeinstallprompt', onAvailable);
    window.addEventListener('pfcs-installed', onInstalled);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pfcs-installable', onAvailable);
      window.removeEventListener('beforeinstallprompt', onAvailable);
      window.removeEventListener('pfcs-installed', onInstalled);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') setInstalled(true);
        setPromptEvent(null);
        window.__pfcsInstallPrompt = null;
        return;
      } catch {
        // Prompt already consumed — fall through to manual steps.
      }
    }
    setShowHelp((v) => !v);
  };

  const help = manualSteps();

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={handleClick} title="Install this app">
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Install App</span>
      </Button>
      {showHelp && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-white p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="font-heading text-sm font-bold uppercase tracking-wide">
              Install on {help.browser}
            </div>
            <button
              className="text-brand-steel hover:text-brand-black"
              onClick={() => setShowHelp(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-brand-steel">{help.steps}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-brand-steel">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
            Already installed? Open it from your Applications folder, Launchpad, or Start Menu — this
            button disappears once you're running the installed app.
          </p>
        </div>
      )}
    </div>
  );
}
