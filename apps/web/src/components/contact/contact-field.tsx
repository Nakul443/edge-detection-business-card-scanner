type ContactFieldProps = {
  label: string
  value: string
  icon?: React.ReactNode
}

export function ContactField({ label, value, icon }: ContactFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="mt-1 flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900">
        {icon}
        {value}
      </span>
    </label>
  )
}
