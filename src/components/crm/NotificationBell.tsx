// The bell in the CRM sub-nav: unread count, latest 20, click-through to the
// deal (marks read), mark-all-read. Data arrives via the 60s poll in
// useNotifications; assignment actions invalidate it for instant updates.
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications, useNotificationMutations } from '@/lib/crm/api/notifications';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/crm/types';

/** "2m" / "3h" / "5d" ago. */
function relTime(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export function NotificationBell() {
  const { data: items = [] } = useNotifications();
  const { read, readAll } = useNotificationMutations();
  const navigate = useNavigate();
  const unread = items.filter((n) => !n.read_at).length;

  const open = (n: Notification) => {
    if (!n.read_at) read.mutate(n.id);
    if (n.deal_id) navigate(`/crm/pipeline?deal=${n.deal_id}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'}
          className="relative rounded-md p-1.5 text-brand-steel hover:bg-brand-gray-bg hover:text-brand-black"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-[16px] text-white">
              {unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-steel">
            Notifications
          </span>
          {unread > 0 && (
            <button
              onClick={() => readAll.mutate()}
              className="flex items-center gap-1 text-xs text-brand-orange hover:underline"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-2 pb-2 text-sm text-brand-steel">Nothing yet — you&apos;ll see deal assignments and inbound leads here.</p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => open(n)}
              className={cn('flex-col items-start gap-0.5 py-2', !n.read_at && 'bg-brand-orange/5')}
            >
              <div className="flex w-full items-baseline gap-2">
                <span className={cn('min-w-0 flex-1 truncate text-sm', !n.read_at && 'font-semibold')}>
                  {n.title}
                </span>
                <span className="shrink-0 text-[10px] text-brand-steel">{relTime(n.created_at)}</span>
              </div>
              {n.body && <span className="line-clamp-2 text-xs text-brand-steel">{n.body}</span>}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
