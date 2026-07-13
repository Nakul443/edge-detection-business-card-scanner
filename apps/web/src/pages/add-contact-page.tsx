import { useEffect, useRef, useState } from 'react'
import { Camera, Mic } from 'lucide-react'
import { ContactReviewForm } from '../components/contact/contact-review-form'
import { DuplicateContactModal } from '../components/contact/duplicate-contact-modal'
import { ImageInputPanel } from '../components/contact/image-input-panel'
import { ModeButton } from '../components/contact/mode-button'
import { RelationshipLinkModal } from '../components/contact/relationship-link-modal'
import { VoiceInputPanel } from '../components/contact/voice-input-panel'
import {
  checkDuplicates,
  createContact,
  createContactRelationship,
  extractBusinessCard,
  extractVoiceAudio,
  extractVoiceTranscript,
  fetchContacts,
  mergeContact,
  type ApiContactSummary,
  type ContactDraftPayload,
  type DuplicateCheckResult,
  type ExtractionResult,
  type RelationshipType,
} from '../lib/api'
import type { ContactDraft, InputMode } from '../types'

type AddContactPageProps = {
  mode: InputMode
  setMode: (mode: InputMode) => void
}

export function AddContactPage({ mode, setMode }: AddContactPageProps) {
  const reviewRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft())
  const [duplicateResult, setDuplicateResult] =
    useState<DuplicateCheckResult | null>(null)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [relationshipContactId, setRelationshipContactId] = useState<string | null>(null)
  const [relationshipCandidates, setRelationshipCandidates] = useState<ApiContactSummary[]>([])
  const [relationshipChoices, setRelationshipChoices] = useState<
    Array<{ contactId: string; relationshipType: RelationshipType | '' }>
  >([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!hasDraftIdentity(draft)) {
      setDuplicateResult(null)
      return
    }

    const timeout = window.setTimeout(async () => {
      try {
        const result = await checkDuplicates(toPayload(draft))
        setDuplicateResult(result)
      } catch {
        setDuplicateResult(null)
      }
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [draft])

  function updateDraft(patch: Partial<ContactDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setDuplicateResult(null)
    setError(null)
    setStatus(null)
  }

  async function handleBusinessCardExtraction(file: File) {
    setIsSubmitting(true)
    setError(null)
    setStatus(null)

    try {
      const result = await extractBusinessCard(file)
      applyExtractionResult(result)
      setStatus('Card details added. Please review them before saving.')
      scrollToDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this card. Please try another photo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVoiceExtraction(transcript: string) {
    setIsSubmitting(true)
    setError(null)
    setStatus(null)

    try {
      const result = await extractVoiceTranscript(transcript)
      applyExtractionResult(result)
      setStatus('Voice details added. Please review them before saving.')
      scrollToDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fill the contact from this note.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVoiceAudioExtraction(file: File, transcript?: string) {
    setIsSubmitting(true)
    setError(null)
    setStatus(null)

    try {
      const result = await extractVoiceAudio(file, transcript)
      applyExtractionResult(result)
      setStatus('Voice details added. Please review them before saving.')
      scrollToDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fill the contact from this recording.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function applyExtractionResult(result: ExtractionResult) {
    setDraft({
      fullName: result.draft.fullName ?? '',
      designation: result.draft.designation ?? '',
      company: result.draft.company ?? '',
      relationshipToUser: result.draft.relationshipToUser ?? '',
      email: result.draft.emails[0] ?? '',
      phone: result.draft.phones[0]?.number ?? '',
      website: result.draft.website ?? '',
      address: result.draft.address ?? '',
      sourceType: result.sourceType,
    })
    setDuplicateResult(null)
  }

  function scrollToDraft() {
    window.setTimeout(() => {
      reviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 120)
  }

  async function handleSave() {
    setIsSubmitting(true)
    setError(null)
    setStatus(null)

    try {
      const duplicateCheck = await checkDuplicates(toPayload(draft))
      setDuplicateResult(duplicateCheck)

      if (duplicateCheck.hasMatches) {
        setShowDuplicateModal(true)
        return
      }

      await saveAsNew()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function saveAsNew() {
    const contact = await createContact(toPayload(draft))
    setStatus('Contact saved. Add optional relationship links or skip.')
    setDuplicateResult(null)
    setShowDuplicateModal(false)
    await openRelationshipModal(contact.id)
  }

  async function handleCreateNewFromDuplicate() {
    setIsSubmitting(true)
    setError(null)

    try {
      await saveAsNew()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contact')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUseExisting(contactId: string) {
    setShowDuplicateModal(false)
    setStatus('Using existing contact. No new contact was created.')
    setDuplicateResult(null)
    await openRelationshipModal(contactId)
  }

  async function handleMerge(contactId: string) {
    setIsMerging(true)
    setError(null)

    try {
      window.setTimeout(async () => {
        try {
          const contact = await mergeContact(contactId, toPayload(draft))
          setStatus('Contact merged. Add optional relationship links or skip.')
          setShowDuplicateModal(false)
          setDuplicateResult(null)
          await openRelationshipModal(contact.id)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to merge contact')
        } finally {
          setIsMerging(false)
        }
      }, 700)
    } catch {
      setIsMerging(false)
    }
  }

  async function openRelationshipModal(contactId: string) {
    const contacts = await fetchContacts()
    const candidates = rankRelationshipCandidates(contacts, draft, contactId).slice(0, 8)
    setRelationshipContactId(contactId)
    setRelationshipCandidates(candidates)
    setRelationshipChoices(
      candidates.map((contact) => ({
        contactId: contact.id,
        relationshipType: '',
      })),
    )
  }

  async function handleLinkRelationships() {
    if (!relationshipContactId) return
    setIsSubmitting(true)
    setError(null)

    try {
      const selected = relationshipChoices.filter((choice) => choice.relationshipType)
      await Promise.all(
        selected.map((choice) =>
          createContactRelationship(
            relationshipContactId,
            choice.contactId,
            choice.relationshipType as RelationshipType,
          ),
        ),
      )
      setStatus(selected.length > 0 ? 'Relationships linked.' : 'No relationships linked.')
      closeRelationshipModal()
      setDraft(emptyDraft())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link relationships')
    } finally {
      setIsSubmitting(false)
    }
  }

  function closeRelationshipModal() {
    setRelationshipContactId(null)
    setRelationshipCandidates([])
    setRelationshipChoices([])
    setDraft(emptyDraft())
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <ModeButton
            active={mode === 'image'}
            icon={<Camera size={16} />}
            label="Image"
            onClick={() => setMode('image')}
          />
          <ModeButton
            active={mode === 'voice'}
            icon={<Mic size={16} />}
            label="Voice"
            onClick={() => setMode('voice')}
          />
        </div>

        {mode === 'image' ? (
          <ImageInputPanel
            isSubmitting={isSubmitting}
            onExtract={handleBusinessCardExtraction}
          />
        ) : (
          <VoiceInputPanel
            isSubmitting={isSubmitting}
            onExtract={handleVoiceExtraction}
            onExtractAudio={handleVoiceAudioExtraction}
          />
        )}
      </section>

      <div ref={reviewRef}>
        <ContactReviewForm
          draft={draft}
          error={error}
          status={status}
          isSubmitting={isSubmitting}
          onDraftChange={updateDraft}
          onSave={handleSave}
        />
      </div>

      {showDuplicateModal && duplicateResult?.hasMatches ? (
        <DuplicateContactModal
          draft={draft}
          duplicateResult={duplicateResult}
          isMerging={isMerging}
          onClose={() => setShowDuplicateModal(false)}
          onUseExisting={handleUseExisting}
          onMerge={handleMerge}
          onCreateNew={handleCreateNewFromDuplicate}
        />
      ) : null}

      {relationshipContactId ? (
        <RelationshipLinkModal
          contacts={relationshipCandidates}
          choices={relationshipChoices}
          isSubmitting={isSubmitting}
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
          onSkip={closeRelationshipModal}
        />
      ) : null}
    </div>
  )
}

function toPayload(draft: ContactDraft): ContactDraftPayload {
  return {
    fullName: draft.fullName || undefined,
    designation: draft.designation || undefined,
    company: draft.company || undefined,
    relationshipToUser: draft.relationshipToUser || undefined,
    emails: draft.email ? [draft.email] : [],
    phones: draft.phone ? [{ label: 'mobile', number: draft.phone }] : [],
    website: draft.website || undefined,
    address: draft.address || undefined,
    sourceType: draft.sourceType,
  }
}

function emptyDraft(): ContactDraft {
  return {
    fullName: '',
    designation: '',
    company: '',
    relationshipToUser: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    sourceType: 'manual',
  }
}

function hasDraftIdentity(draft: ContactDraft) {
  return Boolean(draft.fullName.trim() || draft.email.trim() || draft.phone.trim())
}

function rankRelationshipCandidates(
  contacts: ApiContactSummary[],
  draft: ContactDraft,
  currentContactId: string,
) {
  const lastName = draft.fullName.trim().split(/\s+/).at(-1)?.toLowerCase()

  return contacts
    .filter((contact) => contact.id !== currentContactId)
    .map((contact) => {
      const contactLastName = contact.fullName.trim().split(/\s+/).at(-1)?.toLowerCase()
      const sameLastName = lastName && contactLastName && lastName === contactLastName
      return {
        contact,
        score: sameLastName ? 2 : contact.company && contact.company === draft.company ? 1 : 0,
      }
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.contact)
}
