import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  FileDown,
  FileJson,
  FileSpreadsheet,
  Link2,
  Loader2,
  MoreHorizontal,
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
  const navigate = useNavigate();
  const location = useLocation();
  // where "Done" returns to: the CRM card that launched this proposal, else home
  const from = (location.state as { from?: string } | null)?.from;
  const done = () => navigate(from ?? '/');

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="flex h-16 items-center gap-2 px-3 sm:h-20 sm:gap-3 sm:px-4">
        <Link to="/" className="hidden shrink-0 sm:block" title="Back to dashboard">
          <img
            src={logoUrl}
            alt="PFCS"
            className="h-12 max-w-[130px] rounded-lg object-contain sm:h-[72px] sm:max-w-[340px]"
          />
        </Link>
        {/* everything is saved as you type — Done just takes you back */}
        <Button variant="outline" size="sm" className="shrink-0" onClick={done}
          title={from ? 'Back to the customer card — the proposal stays linked there' : 'Back to proposals'}>
          <ArrowLeft className="h-4 w-4" /> Done
        </Button>

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
          <span className="hidden lg:block">{crmControl}</span>
          {/* full-size: labeled buttons */}
          <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={onPreview}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
          <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={onShare}>
            {shareCopied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
            {shareCopied ? 'Copied!' : 'Share Link'}
          </Button>
          <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={onExportPdf} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden lg:inline-flex">
                <FileSpreadsheet className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3" />
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
            <Send className="h-4 w-4" /> <span className="hidden sm:inline">Send…</span>
          </Button>
          {/* phones: one labeled menu instead of a row of mystery icons */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onPreview}><Eye /> Preview</DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}><Link2 /> Copy share link</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPdf} disabled={pdfBusy}><FileDown /> Download PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExportEstimateCsv}><FileSpreadsheet /> QuickBooks Estimate CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCustomerCsv}><Users /> QuickBooks Customer CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={onExportJson}><FileJson /> Proposal JSON (backup)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete proposal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 text-brand-steel hover:text-red-600 lg:inline-flex"
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
