import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Eye,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Link2,
  Loader2,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import type { Proposal } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATUS_META } from '@/constants/defaults';
import { useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';

export type SaveStatus = 'saved' | 'saving';

export function TopBar({
  proposal,
  saveStatus,
  onPreview,
  onShare,
  shareCopied,
  onExportPdf,
  pdfBusy,
  onExportEstimateCsv,
  onExportCustomerCsv,
  onExportJson,
  onSend,
  onDelete,
  crmControl,
}: {
  proposal: Proposal;
  saveStatus: SaveStatus;
  onPreview: () => void;
  onShare: () => void;
  shareCopied: boolean;
  onExportPdf: () => void;
  pdfBusy: boolean;
  onExportEstimateCsv: () => void;
  onExportCustomerCsv: () => void;
  onExportJson: () => void;
  onSend: () => void;
  onDelete: () => void;
  crmControl?: React.ReactNode;
}) {
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const logoUrl = useLibraryStore((s) => s.settings.logoUrl);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="flex h-16 items-center gap-3 px-3 sm:h-20 sm:px-4">
        <Link to="/" className="shrink-0" title="Back to dashboard">
          <img
            src={logoUrl}
            alt="PFCS"
            className="h-12 max-w-[130px] rounded-lg object-contain sm:h-[72px] sm:max-w-[340px]"
          />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden whitespace-nowrap text-xs font-semibold text-brand-steel sm:inline">
            {proposal.proposalNumber}
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent font-heading text-lg font-bold uppercase tracking-wide outline-none focus:text-brand-orange"
            value={proposal.project.referenceName}
            onChange={(e) =>
              updateProposal(proposal.id, {
                project: { ...proposal.project, referenceName: e.target.value },
              })
            }
            placeholder="Untitled Project"
          />
          <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-brand-steel md:flex">
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="h-3 w-3 text-green-600" /> Saved
              </>
            )}
          </span>
          <Select
            value={proposal.status}
            onValueChange={(v) =>
              updateProposal(proposal.id, { status: v as Proposal['status'] })
            }
          >
            <SelectTrigger className="hidden h-7 w-[110px] text-xs md:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {crmControl}
          <Button variant="outline" size="sm" onClick={onPreview}>
            <Eye className="h-4 w-4" />
            <span className="hidden lg:inline">Preview</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            {shareCopied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
            <span className="hidden lg:inline">{shareCopied ? 'Copied!' : 'Share Link'}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onExportPdf} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            <span className="hidden lg:inline">PDF</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden lg:inline">Export</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportEstimateCsv}>
                <FileSpreadsheet /> QuickBooks Estimate CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCustomerCsv}>
                <Users /> QuickBooks Customer CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExportJson}>
                <FileJson /> Proposal JSON (backup)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={onSend}>
            <Send className="h-4 w-4" />
            <span className="hidden lg:inline">Send…</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-brand-steel hover:text-red-600"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete proposal"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Proposal</DialogTitle>
            <DialogDescription>
              Delete {proposal.proposalNumber} — {proposal.project.referenceName}? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
