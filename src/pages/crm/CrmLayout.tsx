// Shared shell for every /crm/* page: app header + CRM sub-nav. All CRM
// routes render inside AuthGate (see App.tsx), so children can assume a
// signed-in team member.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { AuthGate, useSessionEmail } from '@/components/crm/AuthGate';
import { NotificationBell } from '@/components/crm/NotificationBell';
import { PushBanner } from '@/components/crm/PushBanner';
import { useNotifications } from '@/lib/crm/api/notifications';
import { supabase } from '@/lib/supabase';
import { useLeadBadge } from '@/lib/crm/leadBadge';
import { cn } from '@/lib/utils';

const SUBNAV = [
  { to: '/crm/leads', label: 'Leads' },
  { to: '/crm/my', label: 'My Leads' },
  { to: '/crm', label: 'Contacts' },
  { to: '/crm/pipeline', label: 'Pipeline' },
  { to: '/crm/tasks', label: 'Tasks' },
  { to: '/crm/reports', label: 'Reports' },
  { to: '/crm/integrations', label: 'Integrations' },
  { to: '/crm/team', label: 'Team' },
];

// One client for the CRM's server cache. Zustand remains the UI state store —
// react-query only caches fetched rows (allowed by the brief).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function CrmLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <CrmShell />
      </AuthGate>
    </QueryClientProvider>
  );
}

/** Inside the gate + query provider, so nav badges can fetch. */
function CrmShell() {
  const { pathname } = useLocation();
  const leadCount = useLeadBadge((s) => s.count);
  const { data: notifications = [] } = useNotifications();
  const unreadAssigned = notifications.filter((n) => !n.read_at && n.type === 'deal_assigned').length;
  return (
    <div className="min-h-screen bg-brand-gray-bg">
      <AppHeader />
      <div className="border-b bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2">
          <SessionBadge />
          {SUBNAV.map((item) => {
            const active =
              item.to === '/crm'
                ? pathname === '/crm' || pathname.startsWith('/crm/contacts')
                : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-brand-steel hover:bg-brand-gray-bg hover:text-brand-black'
                )}
              >
                {item.label}
                {item.to === '/crm/leads' && leadCount > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
                    {leadCount}
                  </span>
                )}
                {item.to === '/crm/my' && unreadAssigned > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-[18px] text-white">
                    {unreadAssigned}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <PushBanner />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/** The bell, pinned to the right edge of the CRM sub-nav. Who-am-I and
 *  sign-out live in the header's profile button now. */
function SessionBadge() {
  return (
    <span className="order-last ml-auto flex items-center">
      <NotificationBell />
    </span>
  );
}
