import { useMemo, useState } from 'react'
import { AppShell } from './components/layout/app-shell'
import { AddContactPage } from './pages/add-contact-page'
import { ContactsPage } from './pages/contacts-page'
import { GraphPage } from './pages/graph-page'
import type { InputMode, Page } from './types'

function App() {
  const [page, setPage] = useState<Page>('add')
  const [mode, setMode] = useState<InputMode>('image')
  const [selected, setSelected] = useState<string[]>([])

  const selectedCount = selected.length

  const pageTitle = useMemo(() => {
    if (page === 'add') return 'Add Contact'
    if (page === 'contacts') return 'Contacts'
    return 'Contact Graph'
  }, [page])

  return (
    <AppShell page={page} pageTitle={pageTitle} setPage={setPage}>
      {page === 'add' && <AddContactPage mode={mode} setMode={setMode} />}
      {page === 'contacts' && (
        <ContactsPage
          selected={selected}
          setSelected={setSelected}
          selectedCount={selectedCount}
        />
      )}
      {page === 'graph' && <GraphPage />}
    </AppShell>
  )
}

export default App
