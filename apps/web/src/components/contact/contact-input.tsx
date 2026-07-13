import { forwardRef, type ReactNode } from 'react'
import { LoaderCircle, Mic, MicOff } from 'lucide-react'

type ContactInputProps = {
  label: string
  value: string
  icon?: ReactNode
  placeholder?: string
  isActive?: boolean
  isListening?: boolean
  isProcessing?: boolean
  isVoiceSupported?: boolean
  onChange: (value: string) => void
  onFocus?: () => void
  onVoiceClick?: () => void
}

export const ContactInput = forwardRef<HTMLInputElement, ContactInputProps>(function ContactInput(
  {
    label,
    value,
    icon,
    placeholder,
    isActive = false,
    isListening = false,
    isProcessing = false,
    isVoiceSupported = false,
    onChange,
    onFocus,
    onVoiceClick,
  },
  ref,
) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={`mt-1 flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm text-slate-900 ${
          isProcessing
            ? 'animate-pulse border-blue-300 bg-blue-50 shadow-sm'
            : isActive
              ? 'border-slate-400 shadow-sm'
              : 'border-slate-200'
        }`}
      >
        {icon}
        <input
          ref={ref}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-slate-400"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
        />
        {isActive ? (
          <button
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!isVoiceSupported || isProcessing}
            title={
              isProcessing
                ? `${label} is being processed`
                : isVoiceSupported
                ? `Replace ${label.toLowerCase()} by voice`
                : 'Voice input is not supported in this browser'
            }
            type="button"
            onClick={onVoiceClick}
          >
            {isProcessing ? (
              <LoaderCircle className="animate-spin text-blue-600" size={15} />
            ) : isListening ? (
              <MicOff size={15} />
            ) : (
              <Mic size={15} />
            )}
          </button>
        ) : null}
      </span>
    </label>
  )
})
