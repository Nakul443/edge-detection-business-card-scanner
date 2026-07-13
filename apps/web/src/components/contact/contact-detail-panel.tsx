import { Download, Link2, Trash2, Users } from 'lucide-react'
import type { ApiContactDetail, ApiContactSummary } from '../../lib/api'
import type { ContactSummary } from '../../types'
import { Button } from '../ui/button'
import { InfoRow } from './info-row'

type ContactDetailPanelProps = {
  contact?: ContactSummary
  detail?: ApiContactDetail | null
  contacts: ApiContactSummary[]
  isLoading?: boolean
  isDeleting?: boolean
  isExporting?: boolean
  onAddRelationship: () => void
  onAddGroup: () => void
  onDelete: () => void
  onExport: () => void
}

export function ContactDetailPanel({
  contact,
  detail,
  contacts,
  isLoading = false,
  isDeleting = false,
  isExporting = false,
  onAddRelationship,
  onAddGroup,
  onDelete,
  onExport,
}: ContactDetailPanelProps) {
  if (!contact) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        Select a contact to view details.
      </aside>
    )
  }

  const relatedContacts = (detail?.relationships ?? []).map((relationship) => ({
    relationship,
    contact: contacts.find((candidate) => candidate.id === relationship.toContactId),
  }))

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {contact.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {contact.title} at {contact.company}
            </p>
        </div>
        <Button className="h-9 px-3" disabled={isExporting} variant="secondary" onClick={onExport}>
          <Download size={16} />
        </Button>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        <InfoRow label="Email" value={contact.email} />
        <InfoRow label="Phone" value={contact.phone} />
        <InfoRow label="Relationship" value={contact.relationship} />
        <InfoRow label="Source" value={contact.source} />
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-950">Relationships</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Links used by the graph view.
            </p>
          </div>
          <Button className="h-9 px-3" variant="secondary" onClick={onAddRelationship}>
            <Link2 size={15} />
            Add
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading relationships...</p>
          ) : relatedContacts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No linked people yet. Add one or leave this contact orphaned.
            </p>
          ) : (
            relatedContacts.map(({ relationship, contact: relatedContact }) => (
              <div
                key={relationship.id}
                className="rounded-md border border-slate-200 bg-white p-2"
              >
                <p className="text-sm font-medium text-slate-950">
                  {relatedContact?.displayName ?? 'Unknown contact'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {relationship.relationshipType}
                  {relatedContact?.company ? ` · ${relatedContact.company}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <Button variant="secondary" onClick={onAddGroup}>
          <Users size={16} />
          Add to Group
        </Button>
        <Button disabled={isExporting} onClick={onExport}>
          <Download size={16} />
          {isExporting ? 'Exporting...' : 'Export VCF'}
        </Button>
        <Button disabled={isDeleting} variant="danger" onClick={onDelete}>
          <Trash2 size={16} />
          {isDeleting ? 'Deleting...' : 'Delete Contact'}
        </Button>
      </div>
    </aside>
  )
}
