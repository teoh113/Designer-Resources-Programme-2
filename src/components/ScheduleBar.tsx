import { clamp01, formatIsoDate, parseIsoDate } from "@/utils/date"

type Props = {
  startDate: string
  targetDate: string
  barColor: string
  rangeStart: number
  rangeEnd: number
}

export default function ScheduleBar({ startDate, targetDate, barColor, rangeStart, rangeEnd }: Props) {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(targetDate)
  const safeRange = Math.max(1, rangeEnd - rangeStart)
  const left = clamp01((start - rangeStart) / safeRange)
  const right = clamp01((end - rangeStart) / safeRange)
  const width = Math.max(0.02, right - left)

  const label = `${formatIsoDate(startDate)} → ${formatIsoDate(targetDate)}`
  const dayPct = (86400000 / safeRange) * 100
  const monthPct = (86400000 * 30 / safeRange) * 100

  return (
    <div
      className="group relative h-9 w-full rounded-md border border-zinc-200 bg-white"
      style={{
        backgroundImage: [
          `repeating-linear-gradient(to right, rgba(24,24,27,0.09) 0, rgba(24,24,27,0.09) 1px, transparent 1px, transparent ${dayPct}%)`,
          `repeating-linear-gradient(to right, rgba(24,24,27,0.16) 0, rgba(24,24,27,0.16) 1px, transparent 1px, transparent ${monthPct}%)`,
        ].join(", "),
      }}
    >
      <div
        className="absolute inset-y-1 rounded-[6px] shadow-[0_10px_24px_rgba(0,0,0,.14)] transition-[filter] duration-200 group-hover:brightness-105"
        style={{
          left: `${left * 100}%`,
          width: `${width * 100}%`,
          background: barColor,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-2 text-[11px] tracking-wide text-zinc-700">
        <span className="truncate">{label}</span>
      </div>
    </div>
  )
}
