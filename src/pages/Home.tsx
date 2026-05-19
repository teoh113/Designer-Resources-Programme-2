import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import ItemEditor from "@/components/ItemEditor"
import BarTypesLegend from "@/components/BarTypesLegend"
import StatusesLegend from "@/components/StatusesLegend"
import ProgrammeTable, { type FilterState, type SortState } from "@/components/ProgrammeTable"
import { useProgrammeStore } from "@/store/programmeStore"
import type { ProgrammeItem, ProgrammeItemInput, ScheduleSegment, SortKey } from "@/types/programme"
import { parseIsoDate } from "@/utils/date"

const emptyFilters: FilterState = {
  global: "",
  t1No: [],
  items: [],
  srp: [],
  worksManager: [],
  designer: [],
  statusIds: [],
  scheduleStart: "",
  scheduleEnd: "",
}

function includesCI(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function sortValue(item: ProgrammeItem, key: SortKey) {
  if (key === "t1No") return item.t1No.toLowerCase()
  return item[key].toLowerCase()
}

export default function Home() {
  const items = useProgrammeStore(s => s.items)
  const barTypes = useProgrammeStore(s => s.barTypes)
  const statuses = useProgrammeStore(s => s.statuses)
  const selectedId = useProgrammeStore(s => s.selectedId)
  const select = useProgrammeStore(s => s.select)
  const addItem = useProgrammeStore(s => s.addItem)
  const updateItem = useProgrammeStore(s => s.updateItem)
  const setStatus = useProgrammeStore(s => s.setStatus)
  const moveItem = useProgrammeStore(s => s.moveItem)
  const removeItem = useProgrammeStore(s => s.removeItem)
  const upsertBarType = useProgrammeStore(s => s.upsertBarType)
  const removeBarType = useProgrammeStore(s => s.removeBarType)
  const upsertStatus = useProgrammeStore(s => s.upsertStatus)
  const removeStatus = useProgrammeStore(s => s.removeStatus)

  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [isAdding, setIsAdding] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [barsOpen, setBarsOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const rangeStorageKey = "drp_schedule_range_override_v1"
  const [rangeOverride, setRangeOverride] = useState<{ start: string; end: string }>(() => {
    const raw = localStorage.getItem(rangeStorageKey)
    if (!raw) return { start: "", end: "2029-05-29" }
    try {
      const parsed = JSON.parse(raw) as Partial<{ start: string; end: string }>
      return { start: parsed.start ?? "", end: parsed.end ?? "2029-05-29" }
    } catch {
      return { start: "", end: "2029-05-29" }
    }
  })

  const selectedItem = useMemo(() => items.find(i => i.id === selectedId) ?? null, [items, selectedId])

  const filteredItems = useMemo(() => {
    const global = filters.global.trim()
    const t1No = filters.t1No
    const itemsFilter = filters.items
    const srp = filters.srp
    const worksManager = filters.worksManager
    const designer = filters.designer
    const statusIds = filters.statusIds
    const scheduleStart = filters.scheduleStart ? parseIsoDate(filters.scheduleStart) : NaN
    const scheduleEnd = filters.scheduleEnd ? parseIsoDate(filters.scheduleEnd) : NaN

    function matchesList(value: string, selected: string[]) {
      if (!selected.length) return true
      const v = value.trim().toLowerCase()
      return selected.some(s => s.trim().toLowerCase() === v)
    }

    return items.filter(row => {
      if (statusIds.length && !statusIds.includes(row.statusId)) return false
      if (!matchesList(row.t1No, t1No)) return false
      if (!matchesList(row.items, itemsFilter)) return false
      if (!matchesList(row.srp, srp)) return false
      if (!matchesList(row.worksManager, worksManager)) return false
      if (!matchesList(row.designer, designer)) return false

      if (Number.isFinite(scheduleStart) || Number.isFinite(scheduleEnd)) {
        const start = Number.isFinite(scheduleStart) ? (scheduleStart as number) : -Infinity
        const end = Number.isFinite(scheduleEnd) ? (scheduleEnd as number) : Infinity
        const overlaps = row.segments.some(seg => {
          const a = parseIsoDate(seg.startDate)
          const b = parseIsoDate(seg.endDate)
          if (!Number.isFinite(a) || !Number.isFinite(b)) return false
          return b >= start && a <= end
        })
        if (!overlaps) return false
      }

      if (global) {
        const statusName = statuses.find(s => s.id === row.statusId)?.name ?? row.statusId
        const blob = `${row.t1No} ${row.items} ${row.srp} ${row.worksManager} ${row.designer} ${statusName}`
        if (!includesCI(blob, global)) return false
      }

      return true
    })
  }, [filters, items, statuses])

  const visibleItems = useMemo(() => {
    if (!sort) return filteredItems
    const direction = sort.direction === "asc" ? 1 : -1
    return filteredItems
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const av = sortValue(a.item, sort.key)
        const bv = sortValue(b.item, sort.key)
        if (av < bv) return -1 * direction
        if (av > bv) return 1 * direction
        return a.index - b.index
      })
      .map(x => x.item)
  }, [filteredItems, sort])

  const { rangeStart, rangeEnd } = useMemo(() => {
    const times = visibleItems
      .flatMap(i => i.segments.flatMap(s => [parseIsoDate(s.startDate), parseIsoDate(s.endDate)]))
      .filter(t => Number.isFinite(t))
    const fallback = Date.now()
    const minCandidate = times.length ? Math.min(...times) : fallback
    const forcedEnd = new Date(2029, 4, 29).getTime()
    const maxCandidate = times.length ? Math.max(...times) : fallback + 86400000
    const overrideStart = rangeOverride.start ? parseIsoDate(rangeOverride.start) : NaN
    const overrideEnd = rangeOverride.end ? parseIsoDate(rangeOverride.end) : NaN
    const min = Number.isFinite(overrideStart) ? overrideStart : minCandidate
    const maxBase = Number.isFinite(overrideEnd) ? overrideEnd : Math.max(maxCandidate, forcedEnd)
    const max = Math.max(maxBase, min + 86400000)
    if (max <= min) return { rangeStart: min, rangeEnd: min + 86400000 }
    return { rangeStart: min, rangeEnd: max }
  }, [rangeOverride.end, rangeOverride.start, visibleItems])

  const updatePartial = useMemo(() => {
    return (id: string, patch: Partial<Omit<ProgrammeItemInput, "segments">> & { segments?: ScheduleSegment[] }) => {
      const current = items.find(i => i.id === id)
      if (!current) return { ok: false, error: "Item not found." } as const
      const input: ProgrammeItemInput = {
        t1No: patch.t1No ?? current.t1No,
        items: patch.items ?? current.items,
        srp: patch.srp ?? current.srp,
        worksManager: patch.worksManager ?? current.worksManager,
        designer: patch.designer ?? current.designer,
        segments: patch.segments ?? current.segments,
        statusId: patch.statusId ?? current.statusId,
      }
      const result = updateItem(id, input)
      if ("error" in result) return { ok: false, error: result.error } as const
      return { ok: true } as const
    }
  }, [items, updateItem])

  const editorMode = isAdding ? "add" : selectedItem ? "edit" : null

  function closeEditor() {
    setIsAdding(false)
    select(null)
  }

  function addMonths(dateIso: string, months: number) {
    const base = dateIso ? new Date(dateIso) : new Date()
    const next = new Date(base.getFullYear(), base.getMonth() + months, base.getDate())
    return next.toISOString().slice(0, 10)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_650px_at_22%_12%,rgba(0,229,168,.12),transparent_65%),radial-gradient(900px_650px_at_88%_18%,rgba(8,145,178,.10),transparent_62%),linear-gradient(180deg,#FFFFFF,#F7F7FA)] text-zinc-950">
      <div className="fixed right-6 top-6 z-50 flex flex-col items-end gap-2">
        <BarTypesLegend
          barTypes={barTypes}
          open={barsOpen}
          onOpenChange={open => {
            setBarsOpen(open)
            if (open) {
              setStatusesOpen(false)
              setRangeOpen(false)
              closeEditor()
            }
          }}
          onUpsert={upsertBarType}
          onRemove={removeBarType}
        />
        <StatusesLegend
          statuses={statuses}
          open={statusesOpen}
          onOpenChange={open => {
            setStatusesOpen(open)
            if (open) {
              setBarsOpen(false)
              setRangeOpen(false)
              closeEditor()
            }
          }}
          onUpsert={upsertStatus}
          onRemove={removeStatus}
        />
      </div>
      <div className="mx-auto w-full max-w-none px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Programme Dashboard</div>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl leading-tight text-zinc-950">
              Designer Resources Programme
            </h1>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-zinc-600">
              Add items, assign SRP / Works Manager / Designer, and visualize the schedule as a bar from start date to
              target delivery date. Use the header to sort and the filter row to narrow the list.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(true)
                select(null)
                setRangeOpen(false)
                setStatusesOpen(false)
                setBarsOpen(false)
              }}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !rangeOpen
                  setRangeOpen(next)
                  if (next) {
                    setStatusesOpen(false)
                    setBarsOpen(false)
                    closeEditor()
                  }
                }}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
              >
                Date range
              </button>
              {rangeOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[360px] rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_24px_80px_rgba(0,0,0,.16)]">
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1.5">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Start</span>
                        <input
                          type="date"
                          value={rangeOverride.start}
                          onChange={e => setRangeOverride(v => ({ ...v, start: e.target.value }))}
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">End</span>
                        <input
                          type="date"
                          value={rangeOverride.end}
                          onChange={e => setRangeOverride(v => ({ ...v, end: e.target.value }))}
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const start = rangeOverride.start || new Date().toISOString().slice(0, 10)
                          setRangeOverride(v => ({ ...v, start, end: addMonths(start, 3) }))
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        +3 months
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const start = rangeOverride.start || new Date().toISOString().slice(0, 10)
                          setRangeOverride(v => ({ ...v, start, end: addMonths(start, 6) }))
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        +6 months
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const start = rangeOverride.start || new Date().toISOString().slice(0, 10)
                          setRangeOverride(v => ({ ...v, start, end: addMonths(start, 9) }))
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        +9 months
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const start = rangeOverride.start || new Date().toISOString().slice(0, 10)
                          setRangeOverride(v => ({ ...v, start, end: addMonths(start, 12) }))
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        +1 year
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRangeOverride({ start: "", end: "2029-05-29" })
                          localStorage.setItem(rangeStorageKey, JSON.stringify({ start: "", end: "2029-05-29" }))
                        }}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Reset
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.setItem(rangeStorageKey, JSON.stringify(rangeOverride))
                            setRangeOpen(false)
                          }}
                          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => setRangeOpen(false)}
                          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setSort(null)
                setFilters(emptyFilters)
                setResetToken(v => v + 1)
              }}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
            >
              Reset view
            </button>
          </div>
        </div>

        <div className="mt-8">
          <ProgrammeTable
            items={visibleItems}
            barTypes={barTypes}
            statuses={statuses}
            selectedId={selectedId}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            sort={sort}
            filters={filters}
            resetToken={resetToken}
            onSortChange={setSort}
            onFiltersChange={setFilters}
            onSelect={id => {
              setIsAdding(false)
              select(id)
              setRangeOpen(false)
              setStatusesOpen(false)
              setBarsOpen(false)
            }}
            onUpdateItem={updatePartial}
            onSetStatus={setStatus}
            onMoveRow={(sourceId, targetId) => {
              setSort(null)
              moveItem(sourceId, targetId)
            }}
            onDelete={removeItem}
          />
          {items.length === 0 ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600">
              No items yet. Click “Add item” to create the first programme entry.
            </div>
          ) : null}
        </div>
      </div>

      {editorMode ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            onClick={closeEditor}
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
            aria-label="Close editor"
          />
          <div className="absolute right-0 top-0 h-full w-[440px] max-w-[92vw] border-l border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.18)]">
            {editorMode === "add" ? (
              <ItemEditor
                mode="add"
                onCancel={closeEditor}
                onSubmit={input => {
                  const result = addItem(input)
                  if ("error" in result) return { ok: false, error: result.error }
                  return { ok: true }
                }}
              />
            ) : selectedItem ? (
              <ItemEditor
                mode="edit"
                initial={selectedItem}
                onCancel={closeEditor}
                onDelete={() => {
                  removeItem(selectedItem.id)
                }}
                onSubmit={input => {
                  const result = updateItem(selectedItem.id, input)
                  if ("error" in result) return { ok: false, error: result.error }
                  return { ok: true }
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
