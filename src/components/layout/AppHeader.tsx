import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, CloudOff, LogOut, Settings, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useBuilderSyncStatus } from '@/lib/builderSync';
import { useSessionEmail } from '@/lib/crm/session';
import { supabase } from '@/lib/supabase';
import { startLeadBadge, useLeadBadge } from '@/lib/crm/leadBadge';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * Quiet by default. Sync is automatic and always was — a permanent "Team
 * cloud" light told you nothing, so the healthy state shows nothing at all.
 * The two states that matter still speak up: signed out (the Sign in
 * button) and a sync failure (your work is local only — say so loudly).
 */
function SyncBadge() {
  const status = useBuilderSyncStatus((s) => s.status);
  const { pathname } = useLocation();
  if (status === 'off' || status === 'synced' || status === 'syncing') return null;
  if (status === 'signedOut')
    return (
      <Link
        to={`/crm?next=${encodeURIComponent(pathname)}`}
        title="Sign in so proposals save to the team cloud and the CRM unlocks"
        className="flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
      >
        <CloudOff className="h-3.5 w-3.5" /> Sign in
      </Link>
    );
  return (
    <button
      onClick={() => window.location.reload()}
      title="Changes are saving on this device but not reaching the team cloud. Click to reconnect."
      className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
    >
      <CloudOff className="h-3.5 w-3.5" /> Not syncing — reconnect
    </button>
  );
}

/**
 * Signed in → initials avatar with the usuals (who am I, shortcuts, sign
 * out). Signed out the SyncBadge shows the Sign in button instead, so the
 * top-right corner always answers "who am I / how do I switch".
 */
function ProfileButton() {
  const email = useSessionEmail();
  if (!supabase || !email) return null;
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={`Signed in as ${email}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-sm font-bold text-white hover:brightness-95"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="text-xs text-brand-steel">Signed in as</div>
          <div className="truncate text-sm font-medium text-brand-black">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/crm/my">
            <Briefcase className="mr-2 h-4 w-4" /> My Leads
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/crm/team">
            <Users className="mr-2 h-4 w-4" /> Team &amp; notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 h-4 w-4" /> Proposal Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600"
          onClick={async () => {
            await supabase!.auth.signOut();
            window.location.assign('/');
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Two products at the top; each area carries its own sub-navigation.
const NAV = [
  { to: '/crm', label: 'CRM' },
  { to: '/', label: 'Proposals' },
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
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between gap-2 px-3 sm:h-20 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <img
              src={logoUrl}
              alt="PFCS"
              className="h-12 max-w-[96px] rounded-lg object-contain sm:h-[72px] sm:max-w-[400px]"
            />
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
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <SyncBadge />
          {right}
          <ProfileButton />
        </div>
      </div>
      {PROPOSAL_ROUTES.includes(pathname) && (
        <div className="border-t bg-white">
          <nav className="mx-auto flex max-w-[1800px] items-center gap-1 px-4 py-2">
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
