import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Cloud, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useBuilderSyncStatus } from '@/lib/builderSync';
import { startLeadBadge, useLeadBadge } from '@/lib/crm/leadBadge';
import { InstallAppButton } from '@/components/layout/InstallAppButton';

/** Cloud badge for proposal documents: synced / signed-out / error. */
function SyncBadge() {
  const status = useBuilderSyncStatus((s) => s.status);
  const { pathname } = useLocation();
  if (status === 'off') return null;
  if (status === 'signedOut')
    return (
      // A real Sign in button, right where you are — lands on the sign-in
      // card and comes straight back here afterward (?next=).
      <Link
        to={`/crm?next=${encodeURIComponent(pathname)}`}
        title="Sign in so proposals save to the team cloud and the CRM unlocks"
        className="flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
      >
        <CloudOff className="h-3.5 w-3.5" /> Sign in
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
  // Red lead counter on the CRM tab — visible from every page, so a fresh
  // inquiry gets noticed even while building proposals. Polls once a minute.
  const leadCount = useLeadBadge((s) => s.count);
  useEffect(() => startLeadBadge(), []);
  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoUrl} alt="PFCS" className="h-[72px] max-w-[400px] object-contain" />
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
                {item.to === '/crm' && leadCount > 0 && (
                  <span
                    title={`${leadCount} lead${leadCount === 1 ? '' : 's'} waiting`}
                    className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white"
                  >
                    {leadCount}
                  </span>
                )}
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
