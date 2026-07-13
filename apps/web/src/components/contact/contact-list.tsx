import { Download, Search } from 'lucide-react'
import type { ContactSummary } from '../../types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type ContactListProps = {
  contacts: ContactSummary[]
  isLoading?: boolean
  isExporting?: boolean
  selected: string[]
  activeContactId?: string | null
  selectedCount: number
  onToggleContact: (id: string) => void
  onOpenContact: (id: string) => void
  onExportSelected: () => void
}

export function ContactList({
  contacts,
  isLoading = false,
  isExporting = false,
  selected,
  activeContactId,
  selectedCount,
  onToggleContact,
  onOpenContact,
  onExportSelected,
}: ContactListProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
              size={16}
            />
            <input
              className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
              placeholder="Search name, company, email, phone"
              type="search"
            />
          </div>
          <Button disabled={selectedCount === 0 || isExporting} variant="secondary" onClick={onExportSelected}>
            <Download size={16} />
            {isExporting ? 'Exporting...' : `Export ${selectedCount > 0 ? selectedCount : 'Selected'} VCF`}
          </Button>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading contacts...</div>
        ) : null}
        {!isLoading && contacts.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No contacts yet. Add one from image, voice, or manual entry.
          </div>
        ) : null}
        {contacts.map((contact) => (
          <button
            key={contact.id}
            className={`grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${
              activeContactId === contact.id ? 'bg-blue-50/70' : ''
            }`}
            type="button"
            onClick={() => onOpenContact(contact.id)}
          >
            <input
              checked={selected.includes(contact.id)}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={() => onToggleContact(contact.id)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-950">{contact.name}</h2>
                <Badge tone="green">{contact.relationship}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {contact.title} at {contact.company}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>{contact.email}</span>
                <span>{contact.phone}</span>
              </div>
            </div>
            <Badge>{contact.source}</Badge>
          </button>
        ))}
      </div>
    </section>
  )
}
