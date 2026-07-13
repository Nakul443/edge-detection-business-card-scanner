import { cn } from '../../lib/utils'

type ModeButtonProps = {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}

export function ModeButton({ active, icon, label, onClick }: ModeButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-white text-slate-950 shadow-sm'
          : 'text-slate-600 hover:text-slate-950',
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}
