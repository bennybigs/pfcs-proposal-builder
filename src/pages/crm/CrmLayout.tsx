// Shared shell for every /crm/* page: app header + CRM sub-nav. All CRM
// routes render inside AuthGate (see App.tsx), so children can assume a
// signed-in team member.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppHeader } from '@/components/layout/AppHeader';
import { AuthGate } from '@/components/crm/AuthGate';
import { cn } from '@/lib/utils';

const SUBNAV = [
  { to: '/crm', label: 'Contacts' },
  { to: '/crm/pipeline', label: 'Pipeline' },
  { to: '/crm/tasks', label: 'Tasks' },
  { to: '/crm/team', label: 'Team' },
];

// One client for the CRM's server cache. Zustand remains the UI state store —
// react-query only caches fetched rows (allowed by the brief).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function CrmLayout() {
  const { pathname } = useLocation();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <div className="min-h-screen bg-brand-gray-bg">
          <AppHeader />
          <div className="border-b bg-white">
            <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
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
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-orange/10 text-brand-orange'
                        : 'text-brand-steel hover:bg-brand-gray-bg hover:text-brand-black'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <main className="mx-auto max-w-6xl px-4 py-6">
            <Outlet />
          </main>
        </div>
      </AuthGate>
    </QueryClientProvider>
  );
}
