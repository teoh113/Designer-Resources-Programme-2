import { Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { BarType } from "@/types/programme"
import { cn } from "@/lib/utils"

type Props = {
  barTypes: BarType[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpsert: (barType: BarType) => void
  onRemove: (id: string) => void
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function BarTypesLegend({ barTypes, open, onOpenChange, onUpsert, onRemove }: Props) {
  const [manageOpen, setManageOpen] = useState(false)
  const palette = useMemo(
    () => ["#00E5A8", "#3B82F6", "#F97316", "#A855F7", "#EF4444", "#22C55E", "#06B6D4", "#111827"],
    []
  )

  useEffect(() => {
    if (!open) setManageOpen(false)
  }, [open])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-[0_12px_36px_rgba(0,0,0,.08)] transition hover:bg-zinc-50"
      >
        <span className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Bars</span>
        <span className="text-zinc-300">•</span>
        <span className="text-xs text-zinc-600">{barTypes.length}</span>
        <span className="ml-1 flex items-center gap-1">
          {barTypes.slice(0, 6).map(bt => (
            <span key={bt.id} className="h-2.5 w-2.5 rounded-full" style={{ background: bt.color }} />
          ))}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[360px] max-w-[90vw] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.16)]">
          <div className="grid gap-2 border-b border-zinc-200 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Schedule Bars</div>
              <div className="truncate text-sm font-medium text-zinc-900">Legend</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {barTypes.map(bt => (
                <div
                  key={bt.id}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-700"
                  title={bt.name}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: bt.color }} />
                  <span className="max-w-[160px] truncate">{bt.name}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextColor = palette[barTypes.length % palette.length]
                  onUpsert({ id: `bar-${makeId()}`, name: `Bar ${barTypes.length + 1}`, color: nextColor })
                }}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManageOpen(v => !v)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
                >
                  {manageOpen ? "Hide" : "Manage"}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          {manageOpen ? (
            <div className="grid max-h-[55vh] gap-2 overflow-auto p-3">
              {barTypes.map(bt => (
                <div
                  key={bt.id}
                  className="grid grid-cols-[124px_1fr_auto] items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bt.color}
                      onChange={e => onUpsert({ ...bt, color: e.target.value })}
                      className="h-10 w-14 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
                    />
                    <div className="h-10 w-10 rounded-md border border-zinc-200" style={{ background: bt.color }} />
                  </div>
                  <input
                    value={bt.name}
                    onChange={e => onUpsert({ ...bt, name: e.target.value })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                    placeholder="Bar name"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm("Remove this bar type? Items using it will be switched to a fallback bar.")
                      if (ok) onRemove(bt.id)
                    }}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50",
                      barTypes.length <= 1 ? "pointer-events-none opacity-40" : ""
                    )}
                    aria-label="Remove bar type"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
