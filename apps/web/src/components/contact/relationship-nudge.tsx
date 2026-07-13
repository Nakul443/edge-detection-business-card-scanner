import { GitFork } from 'lucide-react'
import { Button } from '../ui/button'

export function RelationshipNudge() {
  return (
    <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <GitFork className="mt-0.5 text-amber-700" size={18} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-900">
            Possible relationship nudge
          </p>
          <p className="mt-1 text-sm text-amber-800">
            John Doe may be related to Sarah Doe because they share a family
            name.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-8" variant="secondary">
              Link
            </Button>
            <Button className="h-8" variant="ghost">
              Skip
            </Button>
            <Button className="h-8" variant="ghost">
              Unrelated
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
