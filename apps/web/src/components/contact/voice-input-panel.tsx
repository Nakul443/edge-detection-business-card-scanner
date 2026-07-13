import { useRef, useState } from 'react'
import { AudioLines, FileAudio, LoaderCircle, Mic, Square } from 'lucide-react'
import { Button } from '../ui/button'

type VoiceInputPanelProps = {
  isSubmitting: boolean
  onExtract: (transcript: string) => void
  onExtractAudio: (file: File, transcript?: string) => void
}

export function VoiceInputPanel({
  isSubmitting,
  onExtract,
  onExtractAudio,
}: VoiceInputPanelProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [transcript, setTranscript] = useState('')
  const [recordedFile, setRecordedFile] = useState<File | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startRecording() {
    setError(null)
    setRecordedFile(null)

    if (!canUseLiveRecording()) {
      fileInputRef.current?.click()
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType(),
      })
      chunksRef.current = []
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `voice-contact.${extension}`, { type: mimeType })
        setRecordedFile(file)
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      fileInputRef.current?.click()
      setError(err instanceof Error ? err.message : 'Microphone permission failed. You can upload or record audio instead.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <AudioLines className="mx-auto text-slate-500" size={30} />
        <h2 className="mt-3 text-base font-semibold text-slate-950">
          Speak naturally
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          Say the contact details in one sentence. We will place each detail in
          the right field for you to review.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button disabled={isSubmitting || isRecording} variant="secondary" onClick={startRecording}>
            <Mic size={16} />
            {canUseLiveRecording() ? 'Start' : 'Record audio'}
          </Button>
          <Button disabled={!isRecording} variant="secondary" onClick={stopRecording}>
            <Square size={14} />
            Stop
          </Button>
        </div>
        {isRecording ? (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            Recording... speak naturally, then press Stop.
          </div>
        ) : null}
        {recordedFile ? (
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
            Audio captured. You can fill the form now or type a backup note below.
          </div>
        ) : null}
        {isSubmitting ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            <LoaderCircle className="animate-spin" size={16} />
            Listening and filling contact details...
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
          <span className="flex min-w-0 items-center gap-2">
            <FileAudio className="shrink-0 text-slate-500" size={18} />
            <span className="truncate">
              {recordedFile ? recordedFile.name : 'Upload or record audio'}
            </span>
          </span>
          <input
            ref={fileInputRef}
            className="sr-only"
            accept="audio/*,.mp3,.m4a,.aac,.wav,.webm,.ogg"
            type="file"
            onChange={(event) => setRecordedFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <textarea
          className="mt-4 min-h-28 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          placeholder="Optional note: John Smith, Sales Manager at ABC Realty..."
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
        />
      </div>
      <Button
        className="mt-4 w-full"
        disabled={isSubmitting || (!transcript.trim() && !recordedFile)}
        onClick={() =>
          recordedFile ? onExtractAudio(recordedFile, transcript) : onExtract(transcript)
        }
      >
        {isSubmitting ? <LoaderCircle className="animate-spin" size={16} /> : <AudioLines size={16} />}
        {recordedFile ? 'Fill from Voice' : 'Fill from Note'}
      </Button>
    </div>
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
