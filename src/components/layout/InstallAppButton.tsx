import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Offers to install the app on this device. Chrome/Edge fire
 * `beforeinstallprompt`; Safari (iOS/macOS) does not, so we show short
 * manual instructions there instead. Hidden once the app runs installed.
 */
export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (isStandalone) return null;

  const isAppleBrowser =
    typeof navigator !== 'undefined' &&
    /safari/i.test(navigator.userAgent) &&
    !/chrome|chromium|edg/i.test(navigator.userAgent);

  // Nothing to offer: not installable here and not Safari.
  if (!promptEvent && !isAppleBrowser) return null;

  const handleClick = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      return;
    }
    setShowIosHint((v) => !v);
  };

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={handleClick} title="Install this app">
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Install App</span>
      </Button>
      {showIosHint && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-white p-3 text-xs leading-relaxed text-brand-steel shadow-lg">
          To install on Safari: tap the <strong>Share</strong> button, then{' '}
          <strong>Add to Home Screen</strong> (iPhone/iPad) or <strong>Add to Dock</strong> (Mac).
        </div>
      )}
    </div>
  );
}
