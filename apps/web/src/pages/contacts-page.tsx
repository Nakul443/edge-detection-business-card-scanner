import { useEffect, useMemo, useState } from 'react'
import { ContactDetailPanel } from '../components/contact/contact-detail-panel'
import { ContactList } from '../components/contact/contact-list'
import { RelationshipLinkModal } from '../components/contact/relationship-link-modal'
import {
  addContactToGroup,
  createContactRelationship,
  deleteContact,
  exportContactVcf,
  exportContactsVcf,
  fetchContact,
  fetchContactGroups,
  fetchContacts,
  type ApiContactDetail,
  type ApiContactSummary,
  type ContactGroup,
  type RelationshipType,
} from '../lib/api'
import { Button } from '../components/ui/button'
import type { ContactSummary } from '../types'

type ContactsPageProps = {
  selected: string[]
  setSelected: (ids: string[]) => void
  selectedCount: number
}

export function ContactsPage({
  selected,
  setSelected,
  selectedCount,
}: ContactsPageProps) {
  const [contacts, setContacts] = useState<ApiContactSummary[]>([])
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [activeContactDetail, setActiveContactDetail] = useState<ApiContactDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [showRelationshipModal, setShowRelationshipModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groups, setGroups] = useState<ContactGroup[]>([])
  const [relationshipChoices, setRelationshipChoices] = useState<
    Array<{ contactId: string; relationshipType: RelationshipType | '' }>
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLinking, setIsLinking] = useState(false)
  const [isGrouping, setIsGrouping] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadContacts() {
    setIsLoading(true)
    try {
      const data = await fetchContacts()
      setContacts(data)
      setActiveContactId((current) =>
        current && data.some((contact) => contact.id === current) ? current : data[0]?.id ?? null,
      )
      setSelected(selected.filter((id) => data.some((contact) => contact.id === id)))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([fetchContacts(), fetchContactGroups()])
      .then((data) => {
        if (!isMounted) return
        const [contacts, groups] = data
        setContacts(contacts)
        setGroups(groups)
        setActiveContactId((current) => current ?? contacts[0]?.id ?? null)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Failed to load contacts')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!activeContactId) {
      setActiveContactDetail(null)
      return
    }

    let isMounted = true
    setIsDetailLoading(true)

    fetchContact(activeContactId)
      .then((detail) => {
        if (!isMounted) return
        setActiveContactDetail(detail)
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Failed to load contact detail')
      })
      .finally(() => {
        if (isMounted) setIsDetailLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeContactId])

  const contactSummaries = useMemo(
    () => contacts.map(toContactSummary),
    [contacts],
  )

  function toggleContact(id: string) {
    setSelected(
      selected.includes(id)
        ? selected.filter((selectedId) => selectedId !== id)
        : [...selected, id],
    )
  }

  async function refreshActiveDetail() {
    if (!activeContactId) return
    const detail = await fetchContact(activeContactId)
    setActiveContactDetail(detail)
  }

  async function handleExportSelected() {
    if (selected.length === 0) return
    setIsExporting(true)
    setError(null)

    try {
      const blob = await exportContactsVcf(selected)
      downloadBlob(blob, selected.length === 1 ? 'contact.vcf' : 'contacts.vcf')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export selected contacts')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportActive() {
    if (!activeContactId) return
    setIsExporting(true)
    setError(null)

    try {
      const blob = await exportContactVcf(activeContactId)
      downloadBlob(blob, `${activeContactSummary?.name ?? 'contact'}.vcf`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export contact')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleDeleteActive() {
    if (!activeContactId || !activeContactSummary) return
    const confirmed = window.confirm(`Delete ${activeContactSummary.name}? This hides the contact from lists and graph.`)
    if (!confirmed) return

    setIsDeleting(true)
    setError(null)

    try {
      await deleteContact(activeContactId)
      setSelected(selected.filter((id) => id !== activeContactId))
      setActiveContactId(null)
      setActiveContactDetail(null)
      await loadContacts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete contact')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleAddGroup() {
    if (!activeContactId || !groupName.trim()) return
    setIsGrouping(true)
    setError(null)

    try {
      await addContactToGroup(activeContactId, groupName)
      const [nextGroups] = await Promise.all([fetchContactGroups(), refreshActiveDetail()])
      setGroups(nextGroups)
      setShowGroupModal(false)
      setGroupName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact to group')
    } finally {
      setIsGrouping(false)
    }
  }

  async function handleLinkRelationships() {
    if (!activeContactId) return
    setIsLinking(true)
    setError(null)

    try {
      const selected = relationshipChoices.filter((choice) => choice.relationshipType)
      await Promise.all(
        selected.map((choice) =>
          createContactRelationship(
            activeContactId,
            choice.contactId,
            choice.relationshipType as RelationshipType,
          ),
        ),
      )
      setShowRelationshipModal(false)
      setRelationshipChoices([])
      await refreshActiveDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link relationships')
    } finally {
      setIsLinking(false)
    }
  }

  const activeContactSummary = contactSummaries.find((contact) => contact.id === activeContactId)
  const relationshipCandidates = contacts.filter((contact) => contact.id !== activeContactId)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 lg:col-span-2">
          {error}
        </div>
      ) : null}
      <ContactList
        contacts={contactSummaries}
        isLoading={isLoading}
        isExporting={isExporting}
        selected={selected}
        activeContactId={activeContactId}
        selectedCount={selectedCount}
        onToggleContact={toggleContact}
        onOpenContact={setActiveContactId}
        onExportSelected={handleExportSelected}
      />
      <ContactDetailPanel
        contact={activeContactSummary}
        detail={activeContactDetail}
        contacts={contacts}
        isLoading={isDetailLoading}
        isDeleting={isDeleting}
        isExporting={isExporting}
        onAddGroup={() => setShowGroupModal(true)}
        onAddRelationship={() => {
          setRelationshipChoices([])
          setShowRelationshipModal(true)
        }}
        onDelete={handleDeleteActive}
        onExport={handleExportActive}
      />

      {showRelationshipModal && activeContactId ? (
        <RelationshipLinkModal
          contacts={relationshipCandidates}
          choices={relationshipChoices}
          isSubmitting={isLinking}
          onChoiceChange={(contactId, relationshipType) =>
            setRelationshipChoices((current) => {
              if (!current.some((choice) => choice.contactId === contactId)) {
                return [...current, { contactId, relationshipType }]
              }

              return current.map((choice) =>
                choice.contactId === contactId ? { ...choice, relationshipType } : choice,
              )
            })
          }
          onLink={handleLinkRelationships}
          onSkip={() => {
            setShowRelationshipModal(false)
            setRelationshipChoices([])
          }}
        />
      ) : null}

      {showGroupModal && activeContactId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Add to group</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Use an existing group or type a new one.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowGroupModal(false)}>
                Close
              </Button>
            </div>
            <input
              className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              list="contact-group-options"
              placeholder="Bhumio"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <datalist id="contact-group-options">
              {groups.map((group) => (
                <option key={group.id} value={group.name} />
              ))}
            </datalist>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
                Cancel
              </Button>
              <Button disabled={isGrouping || !groupName.trim()} onClick={handleAddGroup}>
                {isGrouping ? 'Adding...' : 'Add Group'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[^\w.-]+/g, '_')
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function toContactSummary(contact: ApiContactSummary): ContactSummary {
  return {
    id: contact.id,
    name: contact.displayName || contact.fullName,
    company: contact.company ?? 'No company',
    title: contact.designation ?? 'No title',
    email: contact.primaryEmail ?? 'No email',
    phone: contact.primaryPhone ?? 'No phone',
    relationship: contact.relationshipToUser ?? 'Unspecified',
    source: contact.source,
  }
}
