import { useCallback, useEffect, useState } from 'react'
import { Network, RefreshCw, Search, X } from 'lucide-react'
import { fetchContactGraph, type ContactGraph } from '../lib/api'
import { Button } from '../components/ui/button'
import { SigmaContactGraph } from '../components/graph/sigma-contact-graph'

export function GraphPage() {
  const [graph, setGraph] = useState<ContactGraph | null>(null)
  const [selectedGroup, setSelectedGroup] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGraph = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchContactGraph()
      setGraph(data)
      setSelectedGroup((current) =>
        current !== 'All' && !data.groups.includes(current) ? 'All' : current,
      )
      setFocusedNodeId((current) =>
        current && data.nodes.some((node) => node.id === current) ? current : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  const handleFocusNode = useCallback(
    (nodeId: string | null) => {
      setFocusedNodeId(nodeId)
      const node = graph?.nodes.find((candidate) => candidate.id === nodeId)
      setSearchTerm(node ? node.displayName || node.fullName : '')
    },
    [graph],
  )

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Relationship graph</h2>
          <p className="mt-1 text-sm text-slate-500">
            Obsidian-style contact map linked by relationships and grouped by relationship cluster.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-700 sm:w-64"
              list="graph-contact-search"
              placeholder="Search contact"
              value={searchTerm}
              onChange={(event) => {
                const nextValue = event.target.value
                setSearchTerm(nextValue)
                const match = graph?.nodes.find(
                  (node) =>
                    normalize(node.fullName) === normalize(nextValue) ||
                    normalize(node.displayName) === normalize(nextValue),
                )
                if (match) setFocusedNodeId(match.id)
              }}
            />
            {searchTerm ? (
              <button
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setFocusedNodeId(null)
                }}
              >
                <X size={14} />
              </button>
            ) : null}
            <datalist id="graph-contact-search">
              {graph?.nodes.map((node) => (
                <option key={node.id} value={node.displayName || node.fullName} />
              ))}
            </datalist>
          </div>
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            value={selectedGroup}
            onChange={(event) => {
              setSelectedGroup(event.target.value)
              setFocusedNodeId(null)
            }}
          >
            <option value="All">All groups</option>
            {graph?.groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <Button variant="secondary" disabled={isLoading} onClick={loadGraph}>
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {isLoading ? (
          <div className="grid min-h-[420px] place-items-center text-sm text-slate-500">
            Loading relationship graph...
          </div>
        ) : !graph || graph.nodes.length === 0 ? (
          <div className="grid min-h-[420px] place-items-center p-6 text-center">
            <div>
              <Network className="mx-auto text-slate-500" size={36} />
              <h3 className="mt-3 font-semibold text-slate-950">No graph links yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Add contacts and link relationships to see clusters here.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <SigmaContactGraph
              graph={graph}
              selectedGroup={selectedGroup}
              focusedNodeId={focusedNodeId}
              onFocusNode={handleFocusNode}
            />

            <div className="border-t border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-2">
                {graph.groups.map((group) => (
                  <button
                    key={group}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      selectedGroup === group
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                    }`}
                    type="button"
                    onClick={() => {
                      setSelectedGroup(group)
                      setFocusedNodeId(null)
                    }}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}
