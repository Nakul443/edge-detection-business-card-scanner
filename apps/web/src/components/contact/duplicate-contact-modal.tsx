import { GitMerge, UserCheck, UserPlus, X } from 'lucide-react'
import type { ContactDraft } from '../../types'
import type { DuplicateCheckResult } from '../../lib/api'
import { Button } from '../ui/button'

type DuplicateContactModalProps = {
  draft: ContactDraft
  duplicateResult: DuplicateCheckResult
  isMerging: boolean
  onClose: () => void
  onUseExisting: (contactId: string) => void
  onMerge: (contactId: string) => void
  onCreateNew: () => void
}

export function DuplicateContactModal({
  draft,
  duplicateResult,
  isMerging,
  onClose,
  onUseExisting,
  onMerge,
  onCreateNew,
}: DuplicateContactModalProps) {
  const primaryMatch = duplicateResult.matches[0]

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Possible duplicate found
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This contact looks similar to someone already saved.
            </p>
          </div>
          <button
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {primaryMatch ? (
          <div
            className={`mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] ${
              isMerging ? 'animate-[merge-pulse_900ms_ease-in-out_infinite]' : ''
            }`}
          >
            <CompactContactCard
              label="Existing"
              name={primaryMatch.fullName}
              company={primaryMatch.company ?? 'No company'}
              meta={`Matched on ${primaryMatch.matchedOn.join(', ')}`}
            />
            <div className="hidden items-center justify-center text-slate-400 sm:flex">
              <GitMerge size={22} />
            </div>
            <CompactContactCard
              label="New details"
              name={draft.fullName || 'Unnamed contact'}
              company={draft.company || 'No company'}
              meta={draft.email || draft.phone || 'Manual details'}
            />
          </div>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button
            variant="secondary"
            disabled={!primaryMatch || isMerging}
            onClick={() => primaryMatch && onUseExisting(primaryMatch.contactId)}
          >
            <UserCheck size={16} />
            Use Existing
          </Button>
          <Button
            disabled={!primaryMatch || isMerging}
            onClick={() => primaryMatch && onMerge(primaryMatch.contactId)}
          >
            <GitMerge size={16} />
            {isMerging ? 'Merging...' : 'Merge'}
          </Button>
          <Button variant="ghost" disabled={isMerging} onClick={onCreateNew}>
            <UserPlus size={16} />
            Create New
          </Button>
        </div>
      </div>
    </div>
  )
}

function CompactContactCard({
  label,
  name,
  company,
  meta,
}: {
  label: string
  name: string
  company: string
  meta: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{name}</p>
      <p className="mt-1 text-sm text-slate-600">{company}</p>
      <p className="mt-2 truncate text-xs text-slate-500">{meta}</p>
    </div>
  )
}
