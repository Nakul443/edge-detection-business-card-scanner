import { cn } from '../../lib/utils'

type NavButtonProps = {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}

export function NavButton({ active, icon, label, onClick }: NavButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
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
