import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeft, Check, Copy, GitBranchPlus, Lock, MoveLeft, Plus, X } from 'lucide-react';
import type { Card, CardTemplate } from '@/types';
import { TopBar, type SaveStatus } from '@/components/layout/TopBar';
import { LibrarySidebar } from '@/components/editor/LibrarySidebar';
import { ProposalCard } from '@/components/editor/ProposalCard';
import { CustomerBlock } from '@/components/editor/CustomerBlock';
import { PaymentScheduleBlock } from '@/components/editor/PaymentScheduleBlock';
import { GrandTotal } from '@/components/editor/GrandTotal';
import { CardEditorPanel } from '@/components/editor/CardEditorPanel';
import { CustomerProposal } from '@/components/customer/CustomerProposal';
import { SingleCardDocument } from '@/components/customer/SingleCardDocument';
import { AcceptanceBlock } from '@/components/customer/AcceptanceBlock';
import { SignatureSection } from '@/components/customer/SignatureSection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { cardFromTemplate, useProposalStore } from '@/store/useProposalStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { buildShareUrl, companySnapshot } from '@/lib/shareLink';
import { SendProposalDialog } from '@/components/editor/SendProposalDialog';
import { cardPdfFilename, exportElementToPdf } from '@/lib/pdfExport';
import { logProposalEvent } from '@/lib/crm/integration/proposalEvents';
import { CrmLinkControl } from '@/components/crm/CrmLinkControl';
import {
  downloadTextFile,
  generateCustomerCsv,
  generateEstimateCsv,
} from '@/lib/qbCsvExport';
import { lastName } from '@/lib/format';
import { uuid } from '@/lib/uuid';
import { cn } from '@/lib/utils';
import { familyLabel, familyOf, latestOf, lockReason } from '@/lib/proposalFamily';
import { createVersion, discardVersion, saveVersion, versionName } from '@/lib/crm/integration/versions';
import { TemplatePickerDialog } from '@/components/dashboard/TemplatePickerDialog';
import { formatDateUS } from '@/lib/format';

type MobileTab = 'library' | 'proposal' | 'editor';

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const allProposals = useProposalStore((s) => s.proposals);
  const [searchParams, setSearchParams] = useSearchParams();
  const proposal = useProposalStore((s) => (id ? s.proposals[id] : undefined));
  const settings = useLibraryStore((s) => s.settings);
  const addCard = useProposalStore((s) => s.addCard);
  const moveCard = useProposalStore((s) => s.moveCard);
  const updateProposal = useProposalStore((s) => s.updateProposal);
  const deleteProposal = useProposalStore((s) => s.deleteProposal);
  const templates = useLibraryStore((s) => s.templates);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('proposal');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [exportCardId, setExportCardId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [signedBanner, setSignedBanner] = useState<string | null>(null);
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  // leaving an unsaved revision/option: where we were headed
  const [leaveTo, setLeaveTo] = useState<null | (() => void)>(null);
  // "Edit this version anyway" — per visit, never remembered
  const [unlockedId, setUnlockedId] = useState<string | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const cardPdfContainerRef = useRef<HTMLDivElement>(null);

  // Autosave indicator: any store change flips to "saving", settles to "saved".
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useProposalStore.subscribe(() => {
      setSaveStatus('saving');
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setSaveStatus('saved'), 800);
    });
    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // Arriving from the "mark as Contract" button in a signature notification
  // email: flip the status here, where the proposal data actually lives.
  useEffect(() => {
    if (searchParams.get('signed') !== '1' || !id) return;
    const signer = searchParams.get('by') || 'the customer';
    updateProposal(id, { status: 'contract' });
    setSignedBanner(signer);
    const next = new URLSearchParams(searchParams);
    next.delete('signed');
    next.delete('by');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, id]);

  // Per-card PDF export: once the hidden single-card document is mounted,
  // print it to a file and clear the request.
  useEffect(() => {
    if (!exportCardId || !proposal) return;
    const card = proposal.cards.find((c) => c.id === exportCardId);
    const el = cardPdfContainerRef.current;
    if (!card || !el) {
      setExportCardId(null);
      return;
    }
    const timer = window.setTimeout(() => {
      exportElementToPdf(el, proposal, cardPdfFilename(proposal, card))
        .catch((err) =>
          toast.error('Card PDF export failed', err instanceof Error ? err.message : String(err))
        )
        .finally(() => setExportCardId(null));
    }, 50);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportCardId]);

  // closing the tab with an unsaved revision/option: the browser asks
  const hasPending = Boolean(proposal?.pendingVersion);
  useEffect(() => {
    if (!hasPending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPending]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { setNodeRef: setCanvasDropRef } = useDroppable({ id: 'proposal-canvas' });

  const cardIds = useMemo(() => proposal?.cards.map((c) => c.id) ?? [], [proposal]);
  const selectedCard = proposal?.cards.find((c) => c.id === selectedCardId);
  const selectedIndex = proposal?.cards.findIndex((c) => c.id === selectedCardId) ?? -1;

  if (!proposal || !id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-brand-steel">Proposal not found.</p>
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const reason = lockReason(proposal);
  const locked = Boolean(reason) && unlockedId !== proposal.id;
  const inert = locked ? ({ inert: '' } as Record<string, string>) : {};
  const newest = latestOf(allProposals, proposal);
  const chosen =
    reason === 'not-chosen'
      ? familyOf(Object.values(allProposals), proposal).find(
          (q) => !q.supersededBy && (q.status === 'accepted' || q.status === 'contract')
        )
      : undefined;
  const openVersion = (kind: 'revision' | 'option') => {
    const copy = createVersion(proposal.id, kind);
    if (copy) navigate(`/proposal/${copy.id}`, { state: location.state });
  };

  // ── unsaved revision / option ──
  const pending = proposal.pendingVersion;
  const pendingSource = pending ? allProposals[pending.sourceId] : undefined;
  const doSave = () => saveVersion(proposal.id);
  const doDiscard = (then?: () => void) => {
    const id = proposal.id;
    const sourceId = pending?.sourceId;
    toast.success(`${versionName(proposal)} discarded`, 'Nothing was changed.');
    // leave first, then drop it — so this page never flashes "not found"
    if (then) then();
    else if (sourceId && allProposals[sourceId]) navigate(`/proposal/${sourceId}`, { state: location.state, replace: true });
    else navigate('/', { replace: true });
    window.setTimeout(() => discardVersion(id), 0);
  };
  const guardLeave = (go: () => void) => (pending ? setLeaveTo(() => go) : go());
  // sending or exporting an unsaved version saves it first — the customer
  // can only ever receive a saved proposal
  const ensureSaved = () => {
    if (pending) doSave();
  };

  const handleAddTemplate = (template: CardTemplate, index?: number) => {
    const card = cardFromTemplate(template);
    addCard(proposal.id, card, index);
    setSelectedCardId(card.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('lib:')) {
      const templateId = activeId.slice(4);
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;
      const overIndex = cardIds.indexOf(overId);
      handleAddTemplate(template, overIndex >= 0 ? overIndex : undefined);
      return;
    }

    const from = cardIds.indexOf(activeId);
    const to = cardIds.indexOf(overId);
    if (from >= 0 && to >= 0 && from !== to) {
      moveCard(proposal.id, from, to);
    }
  };

  // Sharing counts as "sent": auto-log to the CRM when linked, and nudge the
  // proposal's own status forward the first time.
  // DECISION: status only auto-advances from 'draft' → 'sent' — later manual
  // statuses (accepted/contract) are never overwritten by re-sharing.
  const afterSent = (kind: 'share' | 'pdf', url?: string) => {
    if (proposal.status === 'draft') updateProposal(proposal.id, { status: 'sent' });
    logProposalEvent(proposal, kind, url);
  };

  const handleShare = async () => {
    ensureSaved();
    const url = buildShareUrl(proposal, settings);
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
      toast.success('Share link copied', 'Paste it into an email or text for your customer.');
    } catch {
      // Clipboard blocked (common in some browsers) — show the link in-app to copy by hand.
      setShareFallbackUrl(url);
    }
    afterSent('share', url);
  };

  const handleExportPdf = async () => {
    ensureSaved();
    if (!pdfContainerRef.current) return;
    setPdfBusy(true);
    try {
      await exportElementToPdf(pdfContainerRef.current, proposal);
      afterSent('pdf');
    } catch (err) {
      toast.error('PDF export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSend = () => {
    const url = buildShareUrl(proposal, settings);
    const subject = `${settings.companyName} — Proposal ${proposal.proposalNumber}: ${proposal.project.referenceName}`;
    const body = [
      `Hello ${proposal.customer.fullName},`,
      '',
      `Please find your proposal for ${proposal.project.referenceName} at the link below:`,
      '',
      url,
      '',
      'To accept, print the proposal (or save it as a PDF), sign the acceptance section, and return it to us.',
      '',
      `${proposal.salesRep}`,
      settings.companyName,
    ].join('\n');
    window.location.href = `mailto:${encodeURIComponent(proposal.customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    afterSent('share', url);
  };

  const handleExportJson = () => {
    downloadTextFile(
      `${proposal.proposalNumber}-${lastName(proposal.customer.fullName) || 'proposal'}.json`,
      JSON.stringify(proposal, null, 2),
      'application/json'
    );
  };

  const showRightPanel = Boolean(selectedCard);

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        proposal={proposal}
        saveStatus={saveStatus}
        onPreview={() => setPreviewOpen(true)}
        onShare={handleShare}
        crmControl={<CrmLinkControl proposal={proposal} />}
        shareCopied={shareCopied}
        onExportPdf={handleExportPdf}
        pdfBusy={pdfBusy}
        onExportEstimateCsv={() =>
          downloadTextFile(`${proposal.proposalNumber}-estimate.csv`, generateEstimateCsv(proposal))
        }
        onExportCustomerCsv={() =>
          downloadTextFile(`${proposal.proposalNumber}-customer.csv`, generateCustomerCsv(proposal))
        }
        onExportJson={handleExportJson}
        onSend={() => {
          ensureSaved();
          setSendOpen(true);
        }}
        guardLeave={guardLeave}
        onRevise={() => openVersion('revision')}
        onAddOption={() => openVersion('option')}
        onCopyForCustomer={() => setCopyOpen(true)}
        onDelete={() => {
          if (pending) return doDiscard();
          deleteProposal(proposal.id);
          navigate('/');
        }}
      />

      {/* Mobile tab bar */}
      <div className="sticky top-16 z-30 flex border-b bg-white sm:top-20 lg:hidden">
        {(
          [
            ['library', 'Library'],
            ['proposal', 'Proposal'],
            ['editor', 'Card Editor'],
          ] as [MobileTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            className={cn(
              'flex-1 border-b-2 px-3 py-2 text-sm font-medium',
              mobileTab === tab
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-brand-steel'
            )}
            onClick={() => setMobileTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — card library */}
          <aside
            className={cn(
              'w-full shrink-0 overflow-hidden border-r bg-brand-gray-bg lg:block lg:w-[280px]',
              mobileTab === 'library' ? 'block' : 'hidden',
              locked && 'opacity-50'
            )}
            {...inert}
          >
            <LibrarySidebar
              onAdd={(t) => {
                handleAddTemplate(t);
                setMobileTab('proposal');
              }}
              proposal={proposal}
              onAddCard={(c) => {
                const card = { ...c, id: uuid() };
                addCard(proposal.id, card);
                setSelectedCardId(card.id);
                toast.success(`Added “${c.title}”`, 'A copy — changing it here leaves the other proposal alone.');
              }}
            />
          </aside>

          {/* Middle panel — proposal canvas */}
          <main
            ref={setCanvasDropRef}
            className={cn(
              'min-w-0 flex-1 overflow-y-auto px-4 py-6 lg:block',
              mobileTab === 'proposal' ? 'block' : 'hidden'
            )}
          >
            <div className="mx-auto max-w-3xl space-y-5 pb-24">
              {signedBanner && (
                <div className="flex items-start gap-3 rounded-lg border-2 border-green-600 bg-green-50 p-4">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                  <div className="text-sm text-green-900">
                    <div className="font-heading text-base font-bold uppercase tracking-wide">
                      Signed — moved to Contract
                    </div>
                    Electronically signed by <strong>{signedBanner}</strong>. This proposal now
                    appears under Contracts on the dashboard.
                  </div>
                  <button
                    className="ml-auto text-green-700 hover:text-green-900"
                    onClick={() => setSignedBanner(null)}
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {pending && (
                <div className="sticky top-0 z-20 rounded-lg border-2 border-brand-orange bg-white p-4 shadow-md">
                  <div className="font-heading text-base font-bold uppercase tracking-wide text-brand-black">
                    {pending.kind === 'revision' ? 'Revising' : 'New option for'}{' '}
                    {pendingSource?.proposalNumber ?? 'this proposal'} — {versionName(proposal)} isn&apos;t saved
                  </div>
                  <p className="mt-0.5 text-sm text-brand-steel">
                    Make your changes, then save or discard.{' '}
                    {pending.kind === 'revision'
                      ? `Nothing happens to ${pendingSource?.proposalNumber ?? 'the original'} or the deal until you save.`
                      : 'Nothing is added to the deal until you save.'}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => doDiscard()}>
                      <X className="h-3.5 w-3.5" /> Discard
                    </Button>
                    <Button size="sm" onClick={doSave}>
                      <Check className="h-3.5 w-3.5" /> Save {versionName(proposal)}
                    </Button>
                  </div>
                </div>
              )}
              {reason && (
                <VersionBanner
                  reason={reason}
                  locked={locked}
                  proposal={proposal}
                  newestLabel={newest.id !== proposal.id ? familyLabel(newest) || newest.proposalNumber : ''}
                  chosenLabel={chosen ? familyLabel(chosen) || chosen.proposalNumber : ''}
                  onOpen={(pid) => navigate(`/proposal/${pid}`, { state: location.state })}
                  newestId={newest.id}
                  chosenId={chosen?.id}
                  onRevise={() => openVersion('revision')}
                  onAddOption={() => openVersion('option')}
                  onUnlock={() => setUnlockedId(proposal.id)}
                  onLock={() => setUnlockedId(null)}
                />
              )}
              <div className={cn('space-y-5', locked && 'select-text')} {...inert}>
              <CustomerBlock proposal={proposal} />

              <div className="rounded-lg bg-white p-4 shadow-sm">
                <Label htmlFor="intro">Intro Paragraph (optional)</Label>
                <Textarea
                  id="intro"
                  className="mt-1.5"
                  placeholder="Thank you for the opportunity to quote your project…"
                  value={proposal.intro ?? ''}
                  onChange={(e) => updateProposal(proposal.id, { intro: e.target.value })}
                />
              </div>

              {proposal.cards.length === 0 ? (
                <div className="relative rounded-lg border-2 border-dashed border-brand-gray-light bg-white p-12 text-center">
                  <MoveLeft className="mx-auto hidden h-8 w-8 animate-nudge-left text-brand-orange lg:block" />
                  <p className="mt-3 font-heading text-lg font-bold uppercase tracking-wide text-brand-steel">
                    No cards yet
                  </p>
                  <p className="mt-1 text-sm text-brand-steel">
                    Start by dragging cards from the library or click one to add.
                  </p>
                </div>
              ) : (
                <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {proposal.cards.map((card: Card) => (
                      <ProposalCard
                        key={card.id}
                        proposalId={proposal.id}
                        card={card}
                        selected={card.id === selectedCardId}
                        onSelect={(cardId) => {
                          setSelectedCardId(cardId);
                          setMobileTab('editor');
                        }}
                        onExportPdf={(cardId) => setExportCardId(cardId)}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}

              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => {
                  const custom = templates.find((t) => t.id === 'custom');
                  if (custom) handleAddTemplate(custom);
                }}
              >
                <Plus className="h-4 w-4" /> Add custom card
              </Button>

              <PaymentScheduleBlock proposal={proposal} />
              <GrandTotal proposal={proposal} />

              <div className="rounded-lg bg-white p-4 shadow-sm">
                <Label htmlFor="disclaimers">Disclaimers (markdown)</Label>
                <Textarea
                  id="disclaimers"
                  className="mt-1.5 min-h-[120px] text-xs"
                  value={proposal.disclaimers ?? ''}
                  onChange={(e) => updateProposal(proposal.id, { disclaimers: e.target.value })}
                />
              </div>
              </div>

              {/* Fixed acceptance block preview — not editable, not removable */}
              <div className="relative">
                <div className="pointer-events-none opacity-80">
                  <AcceptanceBlock />
                </div>
                <p className="mt-1 text-center text-xs italic text-brand-steel">
                  The Acceptance section is fixed and always appears last on every proposal.
                </p>
              </div>

              {/* Electronic signing preview — the live button exists on the shared link */}
              {proposal.salesRepEmail?.trim() || settings.email?.trim() ? (
                <div className="relative">
                  <div className="pointer-events-none opacity-80">
                    <SignatureSection proposal={proposal} company={companySnapshot(settings)} />
                  </div>
                  <p className="mt-1 text-center text-xs italic text-brand-steel">
                    Preview only — customers sign on the shared link, where this button is live.
                    Signing notifies {proposal.salesRepEmail?.trim() || settings.email} and the
                    email includes a one-click "mark as Contract" button.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-brand-orange bg-brand-orange/5 p-4 text-sm text-brand-steel">
                  <strong className="text-brand-black">
                    Electronic signing is OFF for this proposal.
                  </strong>{' '}
                  Add a Project Manager email above (or a company email in Settings) and the
                  customer's shared link will include an "Accept &amp; Sign Electronically"
                  section that notifies you when they sign.
                </div>
              )}
            </div>
          </main>

          {/* Right panel — card editor */}
          <aside
            className={cn(
              'w-full shrink-0 overflow-y-auto border-l bg-white lg:w-[400px]',
              mobileTab === 'editor' ? 'block' : 'hidden',
              showRightPanel ? 'lg:block' : 'lg:hidden'
            )}
            {...inert}
          >
            {selectedCard ? (
              <CardEditorPanel
                proposalId={proposal.id}
                card={selectedCard}
                index={selectedIndex}
                count={proposal.cards.length}
                onClose={() => {
                  setSelectedCardId(null);
                  setMobileTab('proposal');
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-brand-steel">
                Select a card in the proposal to edit it here.
              </div>
            )}
          </aside>
        </div>
      </DndContext>

      {/* leaving with an unsaved revision/option */}
      <Dialog open={!!leaveTo} onOpenChange={(o) => !o && setLeaveTo(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Save {versionName(proposal)}?</DialogTitle>
          <p className="text-sm text-brand-steel">
            You&apos;re {pending?.kind === 'option' ? 'adding an option to' : 'revising'}{' '}
            {pendingSource?.proposalNumber ?? 'a proposal'} and haven&apos;t saved it. Discard and
            nothing changes.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setLeaveTo(null)}>
              Keep editing
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const go = leaveTo;
                setLeaveTo(null);
                doDiscard(go ?? undefined);
              }}
            >
              Discard
            </Button>
            <Button
              onClick={() => {
                const go = leaveTo;
                setLeaveTo(null);
                doSave();
                go?.();
              }}
            >
              Save {versionName(proposal)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TemplatePickerDialog open={copyOpen} onOpenChange={setCopyOpen} copyFrom={proposal} />

      <SendProposalDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        proposal={proposal}
        settings={settings}
        buildUrl={() => buildShareUrl(proposal, settings)}
        onMailApp={handleSend}
        afterSent={(url) => afterSent('share', url)}
      />

      {/* Share link fallback — shown only when the browser blocks clipboard access */}
      <Dialog
        open={!!shareFallbackUrl}
        onOpenChange={(open) => !open && setShareFallbackUrl(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogTitle>Copy the share link</DialogTitle>
          <p className="text-sm text-brand-steel">
            Your browser blocked automatic copying. Select the link below and copy it
            (&#8984;C), then send it to your customer.
          </p>
          <textarea
            readOnly
            rows={4}
            className="w-full rounded-md border border-input bg-brand-gray-bg p-2 font-mono text-xs"
            value={shareFallbackUrl ?? ''}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShareFallbackUrl(null)}>
              Close
            </Button>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareFallbackUrl ?? '');
                  toast.success('Share link copied');
                  setShareFallbackUrl(null);
                } catch {
                  toast.error('Still blocked', 'Select the text above and press ⌘C.');
                }
              }}
            >
              Try copying again
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer-view preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="light-scope max-h-[90vh] max-w-4xl overflow-y-auto bg-brand-gray-bg p-4 sm:p-6">
          <DialogTitle className="sr-only">Customer Preview</DialogTitle>
          <CustomerProposal proposal={proposal} company={companySnapshot(settings)} />
          {/* Inert copy of the e-sign section so Preview matches the shared link */}
          <div className="pointer-events-none mx-auto w-full max-w-[820px] bg-white px-8 pb-10 opacity-90 shadow-md sm:px-10">
            <SignatureSection proposal={proposal} company={companySnapshot(settings)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Offscreen render target for PDF export (always mounted, hidden from view) */}
      <div
        aria-hidden
        style={{ position: 'fixed', left: '-10000px', top: 0, width: '816px', zIndex: -1 }}
      >
        <div ref={pdfContainerRef} className="light-scope">
          <CustomerProposal proposal={proposal} company={companySnapshot(settings)} />
        </div>
      </div>

      {/* Offscreen render target for single-card PDF export */}
      {exportCardId && proposal.cards.some((c) => c.id === exportCardId) && (
        <div
          aria-hidden
          style={{ position: 'fixed', left: '-10000px', top: 0, width: '816px', zIndex: -1 }}
        >
          <div ref={cardPdfContainerRef} className="light-scope">
            <SingleCardDocument
              card={proposal.cards.find((c) => c.id === exportCardId)!}
              proposal={proposal}
              company={companySnapshot(settings)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sent proposals are the record of what the customer was quoted, so they
 * open read-only with the two ways forward front and centre. Nothing is
 * hidden: the page stays readable, and "Edit this version anyway" is there
 * for the typo that genuinely doesn't need a revision.
 */
function VersionBanner({
  reason,
  locked,
  proposal,
  newestLabel,
  newestId,
  chosenLabel,
  chosenId,
  onOpen,
  onRevise,
  onAddOption,
  onUnlock,
  onLock,
}: {
  reason: 'sent' | 'superseded' | 'not-chosen';
  locked: boolean;
  proposal: { status: string; updatedAt: string; proposalNumber: string };
  newestLabel: string;
  newestId: string;
  chosenLabel: string;
  chosenId?: string;
  onOpen: (id: string) => void;
  onRevise: () => void;
  onAddOption: () => void;
  onUnlock: () => void;
  onLock: () => void;
}) {
  if (!locked) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <span className="min-w-0 flex-1">
          <strong>Editing a {reason === 'sent' ? 'sent' : 'closed'} version.</strong> The customer&apos;s
          copy won&apos;t change — resend it if they need to see this.
        </span>
        <Button size="sm" variant="outline" onClick={onLock}>
          <Lock className="h-3.5 w-3.5" /> Done editing
        </Button>
      </div>
    );
  }
  const title =
    reason === 'superseded'
      ? `Replaced by ${newestLabel}`
      : reason === 'not-chosen'
        ? chosenLabel
          ? `Not chosen — the customer went with ${chosenLabel}`
          : 'Not chosen'
        : proposal.status === 'contract'
          ? 'Signed — this is the contract'
          : proposal.status === 'accepted'
            ? 'Accepted by the customer'
            : `Sent to the customer${proposal.status === 'sent' ? '' : ` (${proposal.status})`}`;
  return (
    <div className="rounded-lg border-2 border-brand-orange bg-brand-orange/5 p-4">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
        <div className="min-w-0 flex-1 text-sm text-brand-black">
          <div className="font-heading text-base font-bold uppercase tracking-wide">{title}</div>
          <p className="mt-0.5 text-brand-steel">
            {reason === 'sent'
              ? `${proposal.proposalNumber} is kept exactly as the customer saw it. To change what they're getting, make a revision; to give them a choice, add an option.`
              : `${proposal.proposalNumber} is kept for the record (last changed ${formatDateUS(proposal.updatedAt)}).`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {reason === 'superseded' && (
          <Button size="sm" onClick={() => onOpen(newestId)}>
            Open {newestLabel}
          </Button>
        )}
        {reason === 'not-chosen' && chosenId && (
          <Button size="sm" onClick={() => onOpen(chosenId)}>
            Open {chosenLabel}
          </Button>
        )}
        {reason === 'sent' && (
          <>
            <Button size="sm" onClick={onRevise}>
              <Copy className="h-3.5 w-3.5" /> Revise
            </Button>
            {/* once signed there's nothing left to choose between */}
            {proposal.status !== 'contract' && proposal.status !== 'accepted' && (
              <Button size="sm" variant="outline" onClick={onAddOption}>
                <GitBranchPlus className="h-3.5 w-3.5" /> Add option
              </Button>
            )}
          </>
        )}
        <button
          className="ml-auto text-xs text-brand-steel underline-offset-2 hover:text-brand-black hover:underline"
          onClick={onUnlock}
        >
          Edit this version anyway
        </button>
      </div>
    </div>
  );
}
