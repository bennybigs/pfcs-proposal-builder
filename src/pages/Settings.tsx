import { useRef } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useLibraryStore } from '@/store/useLibraryStore';
import { formatProposalNumber } from '@/lib/proposalNumber';
import { MAX_EMBEDDED_LOGO_CHARS } from '@/lib/shareLink';
import { toast } from '@/components/ui/toast';

/**
 * Downscale an uploaded logo to display size and re-encode it so the data URL
 * stays small enough to embed in share links (see MAX_EMBEDDED_LOGO_CHARS).
 * Falls back to JPEG on a white background if the PNG is still too large.
 */
function fileToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_H = 480;
      const MAX_W = 1600;
      const scale = Math.min(1, MAX_H / img.height, MAX_W / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length > MAX_EMBEDDED_LOGO_CHARS) {
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = canvas.width;
        jpegCanvas.height = canvas.height;
        const jctx = jpegCanvas.getContext('2d');
        if (jctx) {
          jctx.fillStyle = '#ffffff';
          jctx.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
          jctx.drawImage(canvas, 0, 0);
          dataUrl = jpegCanvas.toDataURL('image/jpeg', 0.85);
        }
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image file'));
    };
    img.src = objectUrl;
  });
}

export default function Settings() {
  const settings = useLibraryStore((s) => s.settings);
  const updateSettings = useLibraryStore((s) => s.updateSettings);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    try {
      const logoUrl = await fileToLogoDataUrl(file);
      updateSettings({ logoUrl });
    } catch (err) {
      toast.error('Could not process logo', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-heading text-3xl font-bold uppercase tracking-wide">Proposal Settings</h1>

        <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
          <section className="space-y-4">
            <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-brand-orange">
              Company
            </h2>
            <div className="flex items-center gap-4">
              <img
                src={settings.logoUrl}
                alt="Company logo"
                className="h-16 max-w-[220px] rounded border bg-white object-contain p-1"
              />
              <div className="space-y-1">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleLogoUpload(f);
                    e.target.value = '';
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  Upload logo…
                </Button>
                <p className="text-xs text-brand-steel">
                  Stored locally. Used on proposals, PDFs, and share links.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Company Name</Label>
                <Input
                  value={settings.companyName}
                  onChange={(e) => updateSettings({ companyName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Tagline</Label>
                <Input
                  value={settings.tagline}
                  onChange={(e) => updateSettings({ tagline: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input
                  value={settings.address}
                  onChange={(e) => updateSettings({ address: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={settings.phone}
                  onChange={(e) => updateSettings({ phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={settings.email}
                  onChange={(e) => updateSettings({ email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default Project Manager</Label>
                <Input
                  value={settings.defaultSalesRep}
                  onChange={(e) => updateSettings({ defaultSalesRep: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default PM Phone</Label>
                <Input
                  value={settings.defaultSalesRepPhone ?? ''}
                  onChange={(e) => updateSettings({ defaultSalesRepPhone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Default PM Email</Label>
                <Input
                  value={settings.defaultSalesRepEmail ?? ''}
                  placeholder="pm@yourcompany.com"
                  onChange={(e) => updateSettings({ defaultSalesRepEmail: e.target.value })}
                />
                <p className="text-xs text-brand-steel">
                  Seeded onto new proposals and used to notify the project manager when a customer
                  signs electronically. Without an email here or on the proposal, the signing
                  section stays hidden on the customer's link.
                </p>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-brand-orange">
              Proposal Numbering
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Prefix</Label>
                <Input
                  value={settings.proposalNumberPrefix}
                  onChange={(e) => updateSettings({ proposalNumberPrefix: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Next Number</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.nextProposalNumber}
                  onChange={(e) =>
                    updateSettings({ nextProposalNumber: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-brand-steel">
              Next proposal will be numbered{' '}
              <span className="font-semibold">
                {formatProposalNumber(settings.proposalNumberPrefix, settings.nextProposalNumber)}
              </span>
              .
            </p>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-brand-orange">
              Default Disclaimers
            </h2>
            <p className="text-xs text-brand-steel">
              Seeded onto every new proposal (editable per proposal). Markdown supported.
            </p>
            <Textarea
              className="min-h-[160px] text-xs"
              value={settings.defaultDisclaimers}
              onChange={(e) => updateSettings({ defaultDisclaimers: e.target.value })}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
