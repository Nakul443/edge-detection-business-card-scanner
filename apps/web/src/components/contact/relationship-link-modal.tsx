import { useMemo, useState } from 'react'
import { Link2, Plus, Search, X } from 'lucide-react'
import type { ApiContactSummary, RelationshipType } from '../../lib/api'
import { Button } from '../ui/button'

type RelationshipChoice = {
  contactId: string
  relationshipType: RelationshipType | ''
}

type RelationshipLinkModalProps = {
  contacts: ApiContactSummary[]
  choices: RelationshipChoice[]
  onChoiceChange: (contactId: string, relationshipType: RelationshipType | '') => void
  onLink: () => void
  onSkip: () => void
  isSubmitting: boolean
}

const relationshipOptions: Array<{ value: RelationshipType; label: string }> = [
  { value: 'referral', label: 'Referred me to them' },
  { value: 'work_partner', label: 'Work partner' },
  { value: 'relative', label: 'Relative' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'guardian', label: 'Guardian' },
]

export function RelationshipLinkModal({
  contacts,
  choices,
  onChoiceChange,
  onLink,
  onSkip,
  isSubmitting,
}: RelationshipLinkModalProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const visibleContacts = contacts.filter((contact) =>
    choices.some((choice) => choice.contactId === contact.id),
  )
  const searchableContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return contacts.slice(0, 8)

    return contacts
      .filter((contact) => {
        const haystack = [
          contact.fullName,
          contact.displayName,
          contact.company,
          contact.primaryEmail,
          contact.primaryPhone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      .slice(0, 8)
  }, [contacts, query])

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Link related contacts
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Optional. Pick only the people who are actually related to this contact.
            </p>
          </div>
          <button
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            type="button"
            onClick={onSkip}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-950">
                Secondary relationships
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Search and add more people when suggestions are not enough.
              </p>
            </div>
            <Button
              className="sm:w-auto"
              variant="secondary"
              onClick={() => setShowSearch((current) => !current)}
            >
              <Plus size={16} />
              Add Secondary Relationship
            </Button>
          </div>

          {showSearch ? (
            <div className="mt-3">
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <Search size={16} className="text-slate-400" />
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-slate-400"
                  placeholder="Search saved contacts"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="mt-2 max-h-44 space-y-1 overflow-auto">
                {searchableContacts.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-slate-500">No contacts found.</p>
                ) : (
                  searchableContacts.map((contact) => {
                    const alreadyAdded = choices.some((choice) => choice.contactId === contact.id)
                    return (
                      <button
                        key={contact.id}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-white disabled:opacity-50"
                        disabled={alreadyAdded}
                        type="button"
                        onClick={() => onChoiceChange(contact.id, 'relative')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">
                            {contact.displayName}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {contact.company ?? contact.primaryEmail ?? contact.primaryPhone ?? 'Saved contact'}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {alreadyAdded ? 'Added' : 'Add'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {visibleContacts.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No related contacts selected yet. You can skip this or add one above.
            </div>
          ) : (
            visibleContacts.map((contact) => (
              <div
                key={contact.id}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_220px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-950">
                    {contact.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {contact.company ?? contact.primaryEmail ?? contact.primaryPhone ?? 'Saved contact'}
                  </p>
                </div>
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                  value={
                    choices.find((choice) => choice.contactId === contact.id)?.relationshipType ?? ''
                  }
                  onChange={(event) =>
                    onChoiceChange(contact.id, event.target.value as RelationshipType | '')
                  }
                >
                  <option value="">Skip / unrelated</option>
                  {relationshipOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={isSubmitting} onClick={onSkip}>
            Skip for now
          </Button>
          <Button disabled={isSubmitting || visibleContacts.length === 0} onClick={onLink}>
            <Link2 size={16} />
            Link Selected
          </Button>
        </div>
      </div>
    </div>
  )
}
