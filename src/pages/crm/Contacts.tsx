// /crm — the contact list. Debounced instant search + source/tag filter
// chips, add/edit dialog, CSV import/export of the filtered list.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { Download, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ContactDialog } from '@/components/crm/ContactDialog';
import { CsvImportDialog } from '@/components/crm/CsvImportDialog';
import { useContacts } from '@/lib/crm/api/contacts';
import { SOURCE_LABEL, SOURCES, type Contact, type ContactSource } from '@/lib/crm/types';
import { cn } from '@/lib/utils';

export default function Contacts() {
  const { data: contacts = [], isLoading, error } = useContacts();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [source, setSource] = useState<ContactSource | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const allTags = useMemo(
    () => [...new Set(contacts.flatMap((c) => c.tags))].sort(),
    [contacts]
  );

  const archivedCount = useMemo(() => contacts.filter((c) => c.archived).length, [contacts]);
  const filtered = useMemo(
    () =>
      contacts.filter((c) => {
        if (!!c.archived !== showArchived) return false;
        if (source && c.source !== source) return false;
        if (tag && !c.tags.includes(tag)) return false;
        if (!debounced) return true;
        return [c.name, c.email, c.phone, c.company_name]
          .join(' ')
          .toLowerCase()
          .includes(debounced);
      }),
    [contacts, debounced, source, tag, showArchived]
  );

  const exportCsv = () => {
    const csv = Papa.unparse(
      filtered.map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        company: c.company_name,
        source: c.source,
        source_detail: c.source_detail ?? '',
        tags: c.tags.join('; '),
        notes: c.notes,
      }))
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'pfcs-contacts.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-black">Contacts</h1>
        <Badge variant="secondary">{contacts.length}</Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1.5 h-4 w-4" /> Import CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="mr-1.5 h-4 w-4" /> Export
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New contact
        </Button>
      </div>

      <div className="mt-3">
        <Input
          placeholder="Search name, email, phone, company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <Chip key={s} active={source === s} onClick={() => setSource(source === s ? null : s)}>
            {SOURCE_LABEL[s]}
          </Chip>
        ))}
        {allTags.length > 0 && <span className="mx-1 text-brand-steel">·</span>}
        {allTags.map((t) => (
          <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
            #{t}
          </Chip>
        ))}
        {archivedCount > 0 && (
          <>
            <span className="mx-1 text-brand-steel">·</span>
            <Chip active={showArchived} onClick={() => setShowArchived(!showArchived)}>
              Archived ({archivedCount})
            </Chip>
          </>
        )}
      </div>
      {showArchived && (
        <p className="mt-2 text-xs text-brand-steel">
          Archived contacts — hidden from the working list, everything kept. Open one to
          restore it.
        </p>
      )}

      {error ? (
        <p className="mt-8 text-sm text-red-600">Could not load contacts: {String(error)}</p>
      ) : isLoading ? (
        <p className="mt-8 text-sm text-brand-steel">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-brand-steel">
          {contacts.length === 0
            ? 'No contacts yet — add your first, or import a CSV.'
            : showArchived
              ? 'Nothing archived matches.'
              : 'No matches.'}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          {filtered.map((c) => (
            <ContactRow key={c.id} contact={c} />
          ))}
        </div>
      )}

      <ContactDialog open={addOpen} onOpenChange={setAddOpen} />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} existing={contacts} />
    </div>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <Link
      to={`/crm/contacts/${contact.id}`}
      className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-brand-gray-bg"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-brand-black">{contact.name}</span>
          {contact.company_name && (
            <span className="truncate text-xs text-brand-steel">{contact.company_name}</span>
          )}
        </div>
        <div className="truncate text-xs text-brand-steel">
          {[contact.phone, contact.email].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="hidden flex-wrap justify-end gap-1 sm:flex">
        {contact.tags.slice(0, 3).map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">
            {t}
          </Badge>
        ))}
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {SOURCE_LABEL[contact.source]}
      </Badge>
    </Link>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
          : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
      )}
    >
      {children}
    </button>
  );
}
