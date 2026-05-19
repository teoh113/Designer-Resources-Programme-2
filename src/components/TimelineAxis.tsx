import { cn } from "@/lib/utils"
import { computeScheduleWidthPx } from "@/components/ScheduleLane"

type Segment = {
  key: string
  label: string
  widthPx: number
}

type Props = {
  rangeStart: number
  rangeEnd: number
  pxPerDay: number
  fontSizePx?: number
  minWidthPx?: number
}

function startOfYear(year: number) {
  return new Date(year, 0, 1).getTime()
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getTime()
}

function intersectPx(rangeStart: number, rangeEnd: number, segStart: number, segEnd: number, pxPerDay: number) {
  const a = Math.max(rangeStart, segStart)
  const b = Math.min(rangeEnd, segEnd)
  if (b <= a) return 0
  return Math.ceil(((b - a) / 86400000) * pxPerDay)
}

function buildMonthSegments(rangeStart: number, rangeEnd: number, pxPerDay: number): Segment[] {
  const start = new Date(rangeStart)
  const end = new Date(rangeEnd)
  const segments: Segment[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)

  while (cursor.getTime() <= endCursor.getTime()) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const segStart = startOfMonth(year, month)
    const segEnd = startOfMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1)
    const widthPx = intersectPx(rangeStart, rangeEnd, segStart, segEnd, pxPerDay)
    if (widthPx > 0) {
      const short = cursor.toLocaleDateString(undefined, { month: "short" })
      const label = month === 0 ? `${short} ${year}` : short
      segments.push({ key: `${year}-${month}`, label, widthPx })
    }
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return segments
}

function buildYearSegments(rangeStart: number, rangeEnd: number, pxPerDay: number): Segment[] {
  const startYear = new Date(rangeStart).getFullYear()
  const endYear = new Date(rangeEnd).getFullYear()
  const segments: Segment[] = []

  for (let year = startYear; year <= endYear; year++) {
    const segStart = startOfYear(year)
    const segEnd = startOfYear(year + 1)
    const widthPx = intersectPx(rangeStart, rangeEnd, segStart, segEnd, pxPerDay)
    if (widthPx > 0) segments.push({ key: String(year), label: String(year), widthPx })
  }

  return segments
}

export default function TimelineAxis({ rangeStart, rangeEnd, pxPerDay, fontSizePx, minWidthPx }: Props) {
  const computedWidthPx = computeScheduleWidthPx(rangeStart, rangeEnd, pxPerDay)
  const widthPx = Math.max(computedWidthPx, Math.round(minWidthPx ?? 0))
  const yearsBase = buildYearSegments(rangeStart, rangeEnd, pxPerDay)
  const monthsBase = buildMonthSegments(rangeStart, rangeEnd, pxPerDay)
  const size = Math.max(9, Math.round(fontSizePx ?? 10))
  const yearsSum = yearsBase.reduce((acc, s) => acc + s.widthPx, 0)
  const monthsSum = monthsBase.reduce((acc, s) => acc + s.widthPx, 0)

  const years = yearsBase.slice()
  const months = monthsBase.slice()
  if (years.length && yearsSum < widthPx) years[years.length - 1] = { ...years[years.length - 1], widthPx: years[years.length - 1].widthPx + (widthPx - yearsSum) }
  if (months.length && monthsSum < widthPx) months[months.length - 1] = { ...months[months.length - 1], widthPx: months[months.length - 1].widthPx + (widthPx - monthsSum) }

  return (
    <div className="grid gap-1">
      <div className="flex h-6 overflow-hidden rounded-md border border-zinc-200 bg-white" style={{ width: widthPx }}>
        {years.map((seg, idx) => (
          <div
            key={seg.key}
            className={cn(
              "flex items-center justify-center whitespace-nowrap px-2 font-medium text-zinc-800",
              idx === 0 ? "" : "border-l border-zinc-200"
            )}
            style={{ width: seg.widthPx, fontSize: size }}
          >
            {seg.label}
          </div>
        ))}
      </div>
      <div className="flex h-6 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50" style={{ width: widthPx }}>
        {months.map((seg, idx) => (
          <div
            key={seg.key}
            className={cn(
              "flex items-center justify-center whitespace-nowrap px-2 text-zinc-600",
              idx === 0 ? "" : "border-l border-zinc-200"
            )}
            style={{ width: seg.widthPx, fontSize: size }}
          >
            {seg.label}
          </div>
        ))}
      </div>
    </div>
  )
}
