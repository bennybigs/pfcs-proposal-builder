// "Your offline changes clashed with a teammate's." Shown wherever the copy
// is: on the Proposals page for every waiting copy, and on the copy itself
// in the editor. Nothing is overwritten until someone picks.
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { keepMine, keepTheirs } from '@/lib/builderSync';
import { toast } from '@/components/ui/toast';
import { formatDateUS } from '@/lib/format';
import type { Proposal } from '@/types';

export function ConflictBanner({
  copy,
  onResolved,
  showOpen = true,
}: {
  copy: Proposal;
  onResolved?: (keptId: string) => void;
  showOpen?: boolean;
}) {
  if (!copy.conflictOf) return null;
  const who = copy.conflictOf.theirsBy.split('@')[0] || 'A teammate';
  const at = new Date(copy.conflictOf.at);
  const when = Number.isNaN(at.getTime())
    ? ''
    : ` on ${formatDateUS(copy.conflictOf.at)} at ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return (
    <div className="mb-4 grid gap-2 rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm text-red-900">
      <div>
        <strong>
          {copy.proposalNumber} — {copy.project.referenceName || copy.customer.fullName}: two versions
        </strong>
        <div className="mt-0.5 text-red-800">
          You changed it on this device while offline, and {who} changed it too{when}. Both are
          kept until you choose. Keeping yours replaces theirs for the whole team.
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {showOpen && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/proposal/${copy.id}`}>Open my version</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link to={`/proposal/${copy.conflictOf.id}`}>Open {who}&apos;s version</Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const id = copy.conflictOf!.id;
            keepTheirs(copy.id);
            toast.success(`Kept ${who}'s version`, 'Your offline changes were discarded.');
            onResolved?.(id);
          }}
        >
          Keep {who}&apos;s
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const id = copy.conflictOf!.id;
            keepMine(copy.id);
            toast.success('Kept your version', 'It now replaces the team copy.');
            onResolved?.(id);
          }}
        >
          Keep mine
        </Button>
      </div>
    </div>
  );
}
