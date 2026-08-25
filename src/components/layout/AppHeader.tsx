import { Link, useLocation } from 'react-router-dom';
import { Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useBuilderSyncStatus } from '@/lib/builderSync';
import { InstallAppButton } from '@/components/layout/InstallAppButton';

/** Cloud badge for proposal documents: synced / signed-out / error. */
function SyncBadge() {
  const status = useBuilderSyncStatus((s) => s.status);
  if (status === 'off') return null;
  if (status === 'signedOut')
    return (
      <Link to="/crm" title="Sign in (CRM) so proposals save to the team cloud, not just this browser"
        className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-brand-steel hover:bg-brand-gray-bg">
        <CloudOff className="h-3.5 w-3.5" /> <span className="hidden md:inline">Local only</span>
      </Link>
    );
  const looks = {
    syncing: { cls: 'text-brand-steel', label: 'Syncing…' },
    synced: { cls: 'text-green-600', label: 'Team cloud' },
    error: { cls: 'text-red-600', label: 'Sync error' },
  } as const;
  const l = looks[status];
  return (
    <span title="Proposal documents are synced to the team cloud"
      className={cn('flex items-center gap-1 px-2 py-1 text-xs', l.cls)}>
      <Cloud className="h-3.5 w-3.5" /> <span className="hidden md:inline">{l.label}</span>
    </span>
  );
}

// Two products at the top; each area carries its own sub-navigation.
const NAV = [
  { to: '/', label: 'Proposals' },
  { to: '/crm', label: 'CRM' },
];

const PROPOSAL_ROUTES = ['/', '/library', '/settings'];
const PROPOSAL_SUBNAV = [
  { to: '/', label: 'All Proposals' },
  { to: '/library', label: 'Card Library' },
  { to: '/settings', label: 'Proposal Settings' },
];

/** Simple header for Dashboard / Library / Settings pages. */
export function AppHeader({ right }: { right?: React.ReactNode }) {
  const { pathname } = useLocation();
  const logoUrl = useLibraryStore((s) => s.settings.logoUrl);
  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="PFCS" className="h-12 max-w-[270px] object-contain" />
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  (item.to === '/crm'
                    ? pathname.startsWith('/crm')
                    : PROPOSAL_ROUTES.includes(pathname) || pathname.startsWith('/proposal'))
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-brand-steel hover:bg-brand-gray-bg hover:text-brand-black'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge />
          <InstallAppButton />
          {right}
        </div>
      </div>
      {PROPOSAL_ROUTES.includes(pathname) && (
        <div className="border-t bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
            {PROPOSAL_SUBNAV.map((item) => (
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
      )}
    </header>
  );
}
