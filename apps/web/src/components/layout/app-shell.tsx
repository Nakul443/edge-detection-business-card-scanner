import { Network, UserRoundPlus, Users } from 'lucide-react'
import type { Page } from '../../types'
import { NavButton } from './nav-button'

type AppShellProps = {
  page: Page
  pageTitle: string
  setPage: (page: Page) => void
  children: React.ReactNode
}

export function AppShell({
  page,
  pageTitle,
  setPage,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm font-medium text-slate-500">
              Business Card Scanner
            </p>
            <h1 className="text-2xl font-semibold text-slate-950">
              {pageTitle}
            </h1>
          </div>
          <nav className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
            <NavButton
              active={page === 'add'}
              icon={<UserRoundPlus size={16} />}
              label="Add"
              onClick={() => setPage('add')}
            />
            <NavButton
              active={page === 'contacts'}
              icon={<Users size={16} />}
              label="Contacts"
              onClick={() => setPage('contacts')}
            />
            <NavButton
              active={page === 'graph'}
              icon={<Network size={16} />}
              label="Graph"
              onClick={() => setPage('graph')}
            />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </section>
    </main>
  )
}
