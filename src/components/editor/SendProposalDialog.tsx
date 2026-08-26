// The Send… dialog: email the customer their proposal from the app (branded
// Postmark email, replies go to the PM), with "open in my mail app" as the
// no-server fallback. App-send needs a signed-in team member; the endpoint
// enforces that server-side too.
import { useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase';
import type { CompanySettings, Proposal } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  settings: CompanySettings;
  buildUrl: () => string;
  /** The existing mailto flow — kept as the fallback path. */
  onMailApp: () => void;
  /** Marks status sent + logs to CRM; runs after either path. */
  afterSent: (url: string) => void;
}

export function SendProposalDialog({
  open,
  onOpenChange,
  proposal,
  settings,
  buildUrl,
  onMailApp,
  afterSent,
}: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(proposal.customer.email);
    setSubject(
      `${settings.companyName} — Proposal ${proposal.proposalNumber}${proposal.project.referenceName ? `: ${proposal.project.referenceName}` : ''}`
    );
    setMessage(
      `Thank you for the opportunity to quote your project. Your full proposal is at the button below — give me a call with any questions.`
    );
    if (!supabase) setSignedIn(false);
    else {
      void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    }
  }, [open, proposal, settings]);

  const sendFromApp = async () => {
    if (!supabase) return;
    setBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const url = buildUrl();
      const r = await fetch('/api/send-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: to.trim(),
          customerName: proposal.customer.fullName,
          subject: subject.trim(),
          message: message.trim(),
          shareUrl: url,
          pmName: proposal.salesRep,
          pmPhone: proposal.salesRepPhone ?? '',
          companyName: settings.companyName,
          replyTo: proposal.salesRepEmail || settings.email,
        }),
      });
      const body = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) {
        if (r.status === 503) {
          toast.error(
            'App email not switched on yet',
            'The Postmark token isn’t configured — use "Open in my mail app" for now.'
          );
        } else {
          toast.error('Could not send', body.error ?? `HTTP ${r.status}`);
        }
        return;
      }
      toast.success('Proposal emailed', `Sent to ${to.trim()} — replies go to ${proposal.salesRepEmail || settings.email}.`);
      afterSent(url);
      onOpenChange(false);
    } catch (err) {
      toast.error('Could not send', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const valid = /\S+@\S+\.\S+/.test(to.trim()) && subject.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send proposal</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">To (customer email)</Label>
            <Input
              type="email"
              value={to}
              placeholder="customer@email.com"
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-brand-steel">Personal note (top of the email)</Label>
            <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <p className="text-xs text-brand-steel">
            Sends a branded email from {settings.companyName} with a &quot;View Your Proposal&quot;
            button. Replies go to {proposal.salesRepEmail || settings.email || 'the company email'}.
            Sending also marks the proposal Sent and logs it to the CRM when linked.
          </p>
          {signedIn === false && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Sign in (CRM tab) to send from the app — or use your mail app below.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:flex-col">
          <Button className="w-full" onClick={sendFromApp} disabled={!valid || busy || signedIn === false}>
            <Send className="mr-1.5 h-4 w-4" />
            {busy ? 'Sending…' : 'Send email'}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onMailApp();
            }}
          >
            <Mail className="mr-1.5 h-4 w-4" /> Open in my mail app instead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
