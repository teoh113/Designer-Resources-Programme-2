import { Plus, Trash2 } from "lucide-react"
import { useMemo } from "react"
import type { StatusType } from "@/types/programme"
import { cn } from "@/lib/utils"

type Props = {
  statuses: StatusType[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpsert: (status: StatusType) => void
  onRemove: (id: string) => void
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function StatusesLegend({ statuses, open, onOpenChange, onUpsert, onRemove }: Props) {
  const palette = useMemo(
    () => ["#0EA5E9", "#22C55E", "#F97316", "#A855F7", "#EF4444", "#64748B", "#06B6D4", "#111827"],
    []
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-[0_12px_36px_rgba(0,0,0,.08)] transition hover:bg-zinc-50"
      >
        <span className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Statuses</span>
        <span className="text-zinc-300">•</span>
        <span className="text-xs text-zinc-600">{statuses.length}</span>
        <span className="ml-1 flex items-center gap-1">
          {statuses.slice(0, 5).map(s =>
            s.iconDataUrl ? (
              <img key={s.id} src={s.iconDataUrl} alt="" className="h-4 w-4 rounded-sm object-contain" />
            ) : (
              <span key={s.id} className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            )
          )}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[420px] max-w-[90vw] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.16)]">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Global Statuses</div>
              <div className="truncate text-sm font-medium text-zinc-900">Define status names & colours</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextColor = palette[statuses.length % palette.length]
                  onUpsert({ id: `status-${makeId()}`, name: `Status ${statuses.length + 1}`, color: nextColor })
                }}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
                Add
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

          <div className="grid max-h-[60vh] gap-2 overflow-auto p-3">
            {statuses.map(s => (
              <div
                key={s.id}
                className="grid grid-cols-[188px_1fr_auto] items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={s.color}
                    onChange={e => onUpsert({ ...s, color: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
                  />
                  <div className="relative h-10 w-10 overflow-hidden rounded-md border border-zinc-200 bg-white">
                    {s.iconDataUrl ? <img src={s.iconDataUrl} alt="" className="h-full w-full object-contain" /> : null}
                    <div className={cn("absolute inset-0", s.iconDataUrl ? "opacity-20" : "")} style={{ background: s.color }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex h-10 items-center rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 transition hover:bg-zinc-50">
                      Icon
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => {
                            onUpsert({ ...s, iconDataUrl: typeof reader.result === "string" ? reader.result : undefined })
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {s.iconDataUrl ? (
                      <button
                        type="button"
                        onClick={() => onUpsert({ ...s, iconDataUrl: undefined })}
                        className="inline-flex h-10 items-center rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
                <input
                  value={s.name}
                  onChange={e => onUpsert({ ...s, name: e.target.value })}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                  placeholder="Status name"
                />
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm("Remove this status? Items using it will be switched to a fallback status.")
                    if (ok) onRemove(s.id)
                  }}
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50",
                    statuses.length <= 1 ? "pointer-events-none opacity-40" : ""
                  )}
                  aria-label="Remove status"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
