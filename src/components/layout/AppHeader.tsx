import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Proposals' },
  { to: '/library', label: 'Card Library' },
  { to: '/settings', label: 'Settings' },
];

/** Simple header for Dashboard / Library / Settings pages. */
export function AppHeader({ right }: { right?: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="PFCS" className="h-8" />
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  pathname === item.to
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-brand-steel hover:bg-brand-gray-bg hover:text-brand-black'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {right}
      </div>
    </header>
  );
}
