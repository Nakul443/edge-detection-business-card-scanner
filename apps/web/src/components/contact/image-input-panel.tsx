import { useState } from 'react'
import { Camera, FileImage, LoaderCircle, ScanLine, Upload } from 'lucide-react'
import { Button } from '../ui/button'

type ImageInputPanelProps = {
  isSubmitting: boolean
  onExtract: (file: File) => void
}

export function ImageInputPanel({ isSubmitting, onExtract }: ImageInputPanelProps) {
  const [file, setFile] = useState<File | null>(null)

  return (
    <div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
          <Upload size={24} />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-950">
          Capture or upload a business card
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          Take a photo or choose an image. We will read the card and fill in
          the contact details for you to review.
        </p>
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
          <span className="flex min-w-0 items-center gap-2">
            <Camera className="shrink-0 text-slate-500" size={18} />
            <span className="truncate">
              {file ? file.name : 'Browse or open camera'}
            </span>
          </span>
          <FileImage className="shrink-0 text-slate-400" size={17} />
          <input
            className="sr-only"
            accept="image/*"
            capture="environment"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {file ? (
          <p className="mt-3 text-xs text-slate-500">
            Ready to scan. Larger photos may take a little longer.
          </p>
        ) : null}
      </div>
      {isSubmitting ? (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-blue-700 shadow-sm">
              <LoaderCircle className="animate-spin" size={22} />
              <span className="absolute h-10 w-10 animate-ping rounded-full bg-blue-200 opacity-30" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-blue-950">
                Scanning card details
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                Reading the card and organizing the contact details.
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full w-1/2 animate-[scan-progress_1.4s_ease-in-out_infinite] rounded-full bg-blue-600" />
          </div>
        </div>
      ) : null}
      <Button
        className="mt-4 w-full"
        disabled={!file || isSubmitting}
        onClick={() => file && onExtract(file)}
      >
        {isSubmitting ? <LoaderCircle className="animate-spin" size={16} /> : <ScanLine size={16} />}
        {isSubmitting ? 'Scanning...' : 'Scan Card'}
      </Button>
    </div>
  )
}
