// Light/dark switch. The choice persists in localStorage and is applied
// pre-paint by the inline script in index.html (no flash of the wrong
// theme). Also flips @uiw's markdown editor via data-color-mode.
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'pfcs-theme';

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.setAttribute('data-color-mode', dark ? 'dark' : 'light');
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    apply(dark);
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-md p-1.5 text-brand-steel hover:bg-brand-gray-bg hover:text-brand-orange"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
