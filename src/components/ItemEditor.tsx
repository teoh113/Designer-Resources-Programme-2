import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useProgrammeStore } from "@/store/programmeStore"
import type { ProgrammeItem, ProgrammeItemInput, ScheduleSegment } from "@/types/programme"
import { cn } from "@/lib/utils"

type Mode = "add" | "edit"

type Props = {
  mode: Mode
  initial?: ProgrammeItem
  onCancel: () => void
  onSubmit: (input: ProgrammeItemInput) => { ok: true } | { ok: false; error: string }
  onDelete?: () => void
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number) {
  const time = new Date(isoDate).getTime()
  if (!Number.isFinite(time)) return getTodayIsoDate()
  return new Date(time + 86400000 * days).toISOString().slice(0, 10)
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function ItemEditor({ mode, initial, onCancel, onSubmit, onDelete }: Props) {
  const barTypes = useProgrammeStore(s => s.barTypes)
  const statuses = useProgrammeStore(s => s.statuses)
  const srpOptions = useProgrammeStore(s => s.srpOptions)
  const worksManagerOptions = useProgrammeStore(s => s.worksManagerOptions)
  const designerOptions = useProgrammeStore(s => s.designerOptions)

  const defaultBarTypeId = barTypes[0]?.id ?? "design"
  const defaultStatusId = statuses[0]?.id ?? "active"

  const [t1No, setT1No] = useState(() => (initial ? initial.t1No : ""))
  const [items, setItems] = useState(() => initial?.items ?? "")
  const [srp, setSrp] = useState(() => initial?.srp ?? "")
  const [worksManager, setWorksManager] = useState(() => initial?.worksManager ?? "")
  const [designer, setDesigner] = useState(() => initial?.designer ?? "")
  const [segments, setSegments] = useState<ScheduleSegment[]>(() => {
    if (initial?.segments?.length) return initial.segments
    const today = getTodayIsoDate()
    return [{ id: makeId(), barTypeId: defaultBarTypeId, startDate: today, endDate: today }]
  })
  const [statusId, setStatusId] = useState(() => initial?.statusId ?? defaultStatusId)
  const [error, setError] = useState<string | null>(null)

  const title = mode === "add" ? "Add Item" : "Edit Item"

  const canDelete = mode === "edit" && typeof onDelete === "function"

  const isValid = useMemo(() => {
    return true
  }, [])

  function handleSubmit() {
    setError(null)

    const result = onSubmit({
      t1No,
      items,
      srp,
      worksManager,
      designer,
      segments,
      statusId,
    })

    if (result.ok === false) setError(result.error)
  }

  return (
    <div className="flex h-full flex-col border-l border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Programme Entry</div>
          <div className="truncate font-[var(--font-display)] text-xl text-zinc-950">{title}</div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-6">
        <div className="grid gap-4">
          <Field label="T1 no.">
            <input
              value={t1No}
              onChange={e => setT1No(e.target.value)}
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400"
              placeholder="e.g. A01.01"
            />
          </Field>

          <Field label="Items">
            <input
              value={items}
              onChange={e => setItems(e.target.value)}
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              placeholder="Describe the item"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="SRP">
              <input
                value={srp}
                onChange={e => setSrp(e.target.value)}
                list="srp-options"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                placeholder="SRP"
              />
            </Field>
            <Field label="Works Manager">
              <input
                value={worksManager}
                onChange={e => setWorksManager(e.target.value)}
                list="works-manager-options"
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                placeholder="Name"
              />
            </Field>
          </div>

          <Field label="Designer">
            <input
              value={designer}
              onChange={e => setDesigner(e.target.value)}
              list="designer-options"
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              placeholder="Name"
            />
          </Field>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Schedule</div>
              <button
                type="button"
                onClick={() => {
                  const last = segments[segments.length - 1]
                  const startDate = last?.endDate ?? getTodayIsoDate()
                  const endDate = addDays(startDate, 7)
                  setSegments([...segments, { id: makeId(), barTypeId: defaultBarTypeId, startDate, endDate }])
                }}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
              >
                <Plus className="h-4 w-4" />
                Add segment
              </button>
            </div>

            <div className="grid gap-2">
              {segments.map((seg, idx) => (
                <div key={seg.id} className="rounded-md border border-zinc-200 bg-white p-3">
                  <div className="grid gap-3">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <select
                        value={seg.barTypeId}
                        onChange={e => {
                          const next = segments.slice()
                          next[idx] = { ...seg, barTypeId: e.target.value }
                          setSegments(next)
                        }}
                        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                      >
                        {barTypes.map(bt => (
                          <option key={bt.id} value={bt.id}>
                            {bt.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setSegments(segments.filter(s => s.id !== seg.id))
                        }}
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-md border text-zinc-700 transition",
                          "border-zinc-200 bg-white hover:bg-zinc-50"
                        )}
                        aria-label="Remove segment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Start date">
                        <input
                          type="date"
                          value={seg.startDate}
                          onChange={e => {
                            const next = segments.slice()
                            next[idx] = { ...seg, startDate: e.target.value }
                            setSegments(next)
                          }}
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                        />
                      </Field>
                      <Field label="End date">
                        <input
                          type="date"
                          value={seg.endDate}
                          onChange={e => {
                            const next = segments.slice()
                            next[idx] = { ...seg, endDate: e.target.value }
                            setSegments(next)
                          }}
                          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Status</span>
            <select
              value={statusId}
              onChange={e => setStatusId(e.target.value)}
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
            >
              {statuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
        </div>

        <datalist id="srp-options">
          {srpOptions.map(v => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="works-manager-options">
          {worksManagerOptions.map(v => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="designer-options">
          {designerOptions.map(v => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {canDelete ? (
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm("Remove this item?")
                if (ok) onDelete?.()
              }}
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 transition hover:bg-rose-100"
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            aria-disabled={!isValid}
            className={cn(
              "rounded-md px-4 py-2 text-sm text-white transition",
              isValid ? "bg-zinc-900 hover:bg-zinc-800" : "cursor-not-allowed bg-zinc-900/30"
            )}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      {children}
    </label>
  )
}
