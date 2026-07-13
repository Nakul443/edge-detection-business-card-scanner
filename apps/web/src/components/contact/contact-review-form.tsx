import { useEffect, useMemo, useRef, useState } from 'react'
import { Mail, Mic, Phone, RotateCcw } from 'lucide-react'
import type { ContactDraft } from '../../types'
import { extractVoiceAudio, type ExtractionResult } from '../../lib/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ContactInput } from './contact-input'

type ContactReviewFormProps = {
  draft: ContactDraft
  error: string | null
  status: string | null
  isSubmitting: boolean
  onDraftChange: (patch: Partial<ContactDraft>) => void
  onSave: () => void
}

type DraftField = Exclude<keyof ContactDraft, 'sourceType'>

type DraftFieldConfig = {
  key: DraftField
  label: string
  placeholder: string
  icon?: React.ReactNode
}

const draftFields: DraftFieldConfig[] = [
  { key: 'fullName', label: 'Full Name', placeholder: 'John Smith' },
  { key: 'relationshipToUser', label: 'Relationship to Me', placeholder: 'Client, Vendor, Friend' },
  { key: 'designation', label: 'Designation', placeholder: 'Sales Manager' },
  { key: 'company', label: 'Company', placeholder: 'ABC Realty' },
  { key: 'email', label: 'Email', placeholder: 'john@abc.com', icon: <Mail size={16} /> },
  { key: 'phone', label: 'Phone', placeholder: '518-555-1111', icon: <Phone size={16} /> },
  { key: 'website', label: 'Website', placeholder: 'abc.com' },
  { key: 'address', label: 'Address', placeholder: '12 Market Street, Albany' },
]

export function ContactReviewForm({
  draft,
  error,
  status,
  isSubmitting,
  onDraftChange,
  onSave,
}: ContactReviewFormProps) {
  const [activeField, setActiveField] = useState<DraftField | null>(null)
  const [quickFillField, setQuickFillField] = useState<DraftField | null>(null)
  const [listeningField, setListeningField] = useState<DraftField | null>(null)
  const [processingField, setProcessingField] = useState<DraftField | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const audioFileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAudioFieldRef = useRef<DraftField | null>(null)
  const quickFillFieldRef = useRef<DraftField | null>(null)
  const inputRefs = useRef<Record<DraftField, HTMLInputElement | null>>({
    fullName: null,
    relationshipToUser: null,
    designation: null,
    company: null,
    email: null,
    phone: null,
    website: null,
    address: null,
  })
  const emptyFields = useMemo(
    () => draftFields.filter((field) => !draft[field.key].trim()).map((field) => field.key),
    [draft],
  )
  const quickFillActive = quickFillField !== null

  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [])

  function updateQuickFillField(field: DraftField | null) {
    quickFillFieldRef.current = field
    setQuickFillField(field)
  }

  async function startVoiceForField(field: DraftField, options: { reset: boolean }) {
    if (processingField) return

    if (!canUseLiveRecording()) {
      stopRecording()
      setVoiceError(null)
      setActiveField(field)
      inputRefs.current[field]?.focus()

      if (options.reset) {
        onDraftChange({ [field]: '' })
      }

      pendingAudioFieldRef.current = field
      audioFileInputRef.current?.click()
      return
    }

    stopRecording()
    setVoiceError(null)
    setActiveField(field)
    inputRefs.current[field]?.focus()

    if (options.reset) {
      onDraftChange({ [field]: '' })
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType() })
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `draft-${field}.${extension}`, { type: mimeType })
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null

        if (blob.size > 0) {
          setListeningField(null)
          setProcessingField(field)
          void transcribeFieldAudio(field, file)
        } else {
          setListeningField(null)
        }
      }

      recorder.start()
      setListeningField(field)
    } catch (err) {
      setListeningField(null)
      setVoiceError(err instanceof Error ? err.message : 'Microphone permission failed.')
    }
  }

  function handleQuickFill() {
    if (processingField) return

    if (!quickFillActive) {
      const firstEmptyField = emptyFields[0]
      if (!firstEmptyField) {
        setVoiceError('All contact fields already have values.')
        return
      }

      updateQuickFillField(firstEmptyField)
      void startVoiceForField(firstEmptyField, { reset: false })
      return
    }

    if (listeningField) {
      stopRecording()
      return
    }

    const currentIndex = quickFillField ? draftFields.findIndex((field) => field.key === quickFillField) : -1
    const nextEmptyField =
      draftFields
        .slice(Math.max(currentIndex + 1, 0))
        .find((field) => !draft[field.key].trim())?.key ??
      draftFields.slice(0, Math.max(currentIndex, 0)).find((field) => !draft[field.key].trim())?.key

    if (!nextEmptyField) {
      stopRecording()
      updateQuickFillField(null)
      setVoiceError(null)
      return
    }

    updateQuickFillField(nextEmptyField)
    void startVoiceForField(nextEmptyField, { reset: false })
  }

  function handleResetQuickFillField() {
    if (!quickFillField || processingField) return
    stopRecording()
    onDraftChange({ [quickFillField]: '' })
    void startVoiceForField(quickFillField, { reset: false })
  }

  function handleFieldVoice(field: DraftField) {
    if (processingField) return

    updateQuickFillField(null)
    void startVoiceForField(field, { reset: true })
  }

  function handleAudioFileFallback(file: File | undefined) {
    const field = pendingAudioFieldRef.current
    pendingAudioFieldRef.current = null

    if (!field || !file) return

    setListeningField(null)
    setProcessingField(field)
    void transcribeFieldAudio(field, file)
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    mediaRecorderRef.current = null
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }

  async function transcribeFieldAudio(field: DraftField, file: File) {
    try {
      const result = await extractVoiceAudio(file)
      const value = valueForField(field, result)
      if (value) {
        onDraftChange({ [field]: value })
        if (quickFillFieldRef.current === field) {
          const nextField = nextEmptyFieldAfter(field, draft, field)
          if (nextField) {
            updateQuickFillField(nextField)
            window.setTimeout(() => {
              void startVoiceForField(nextField, { reset: false })
            }, 150)
          } else {
            updateQuickFillField(null)
          }
        }
      } else {
        setVoiceError('We could not find a clear value for this field. Please try again.')
      }
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not fill this field from voice.')
    } finally {
      setListeningField(null)
      setProcessingField(null)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Review Contact
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Check the details and make any changes before saving.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={isSubmitting || Boolean(processingField)}
            variant={quickFillActive ? 'secondary' : 'primary'}
            onClick={handleQuickFill}
          >
            <Mic size={16} />
            {processingField
              ? 'Processing...'
              : listeningField
                ? 'Stop & next'
                : quickFillActive
                  ? 'Next'
                  : 'Quick voice fill'}
          </Button>
          {quickFillActive ? (
            <Button
              disabled={isSubmitting || !quickFillField || Boolean(processingField)}
              variant="secondary"
              onClick={handleResetQuickFillField}
            >
              <RotateCcw size={16} />
              Reset field
            </Button>
          ) : null}
          <Badge tone="blue">Review</Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {draftFields.map((field) => (
          <ContactInput
            key={field.key}
            ref={(element) => {
              inputRefs.current[field.key] = element
            }}
            label={field.label}
            placeholder={field.placeholder}
            value={draft[field.key]}
            icon={field.icon}
            isActive={activeField === field.key || quickFillField === field.key}
            isListening={listeningField === field.key}
            isProcessing={processingField === field.key}
            isVoiceSupported
            onFocus={() => setActiveField(field.key)}
            onChange={(value) => onDraftChange({ [field.key]: value })}
            onVoiceClick={() => handleFieldVoice(field.key)}
          />
        ))}
      </div>

      <input
        ref={audioFileInputRef}
        className="sr-only"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.webm,.ogg"
        type="file"
        onChange={(event) => {
          handleAudioFileFallback(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      {quickFillActive ? (
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {processingField
            ? `Processing ${draftFields.find((field) => field.key === processingField)?.label}. Please wait.`
            : `Filling ${draftFields.find((field) => field.key === quickFillField)?.label}. Speak, review the text, then click Next for the next empty field.`}
        </div>
      ) : null}

      {voiceError ? (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {voiceError}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {status}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button disabled={isSubmitting} onClick={onSave}>
          Save Contact
        </Button>
      </div>
    </section>
  )
}

function supportedMimeType() {
  const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function canUseLiveRecording() {
  return Boolean(
    typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined',
  )
}

function valueForField(field: DraftField, result: ExtractionResult) {
  if (field === 'fullName') return result.draft.fullName ?? result.rawText
  if (field === 'designation') return result.draft.designation ?? result.rawText
  if (field === 'company') return result.draft.company ?? result.rawText
  if (field === 'relationshipToUser') return result.draft.relationshipToUser ?? result.rawText
  if (field === 'email') return result.draft.emails[0] ?? result.rawText
  if (field === 'phone') return normalizePhoneField(result.draft.phones[0]?.number ?? result.rawText)
  if (field === 'website') return result.draft.website ?? result.rawText
  return result.draft.address ?? result.rawText
}

function normalizePhoneField(value: string) {
  const digitTokens: Record<string, string> = {
    zero: '0',
    oh: '0',
    o: '0',
    one: '1',
    won: '1',
    two: '2',
    to: '2',
    too: '2',
    three: '3',
    tree: '3',
    four: '4',
    for: '4',
    fore: '4',
    five: '5',
    fife: '5',
    by: '5',
    six: '6',
    seven: '7',
    eight: '8',
    ate: '8',
    nine: '9',
    ten: '10',
  }

  return value
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .split(/[^a-z0-9]+/)
    .flatMap((token) => {
      if (!token) return []
      if (/^\d+$/.test(token)) return token.split('')
      return digitTokens[token]?.split('') ?? []
    })
    .join('')
}

function nextEmptyFieldAfter(currentField: DraftField, draft: ContactDraft, filledField?: DraftField) {
  const currentIndex = draftFields.findIndex((field) => field.key === currentField)
  const orderedFields = [
    ...draftFields.slice(Math.max(currentIndex + 1, 0)),
    ...draftFields.slice(0, Math.max(currentIndex, 0)),
  ]

  return orderedFields.find((field) => field.key !== filledField && !draft[field.key].trim())?.key ?? null
}
