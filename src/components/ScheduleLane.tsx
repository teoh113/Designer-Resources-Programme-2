import type { BarType, ScheduleSegment } from "@/types/programme"
import { parseIsoDate } from "@/utils/date"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"

type Props = {
  segments: ScheduleSegment[]
  barTypes: BarType[]
  rangeStart: number
  rangeEnd: number
  pxPerDay: number
  heightPx?: number
  onCommit?: (segments: ScheduleSegment[]) => void
  onRequestRangeStart?: (nextRangeStart: number) => void
}

type Placed = {
  id: string
  left: number
  width: number
  top: number
  color: string
  label: string
  text: string
  textX: number
  labelPlacement: "bottom" | "top"
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function computeScheduleWidthPx(rangeStart: number, rangeEnd: number, pxPerDay: number) {
  const days = Math.max(1, (rangeEnd - rangeStart) / 86400000)
  return Math.ceil(days * pxPerDay)
}

function placeSegments(
  segments: ScheduleSegment[],
  barTypes: BarType[],
  rangeStart: number,
  rangeEnd: number,
  pxPerDay: number
): { placed: Placed[]; tracks: number } {
  const typeMap = new Map(barTypes.map(bt => [bt.id, bt]))
  const sorted = segments
    .map(seg => ({
      seg,
      start: parseIsoDate(seg.startDate),
      end: parseIsoDate(seg.endDate),
    }))
    .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end))
    .sort((a, b) => a.start - b.start)

  const trackEnds: number[] = []
  const placed: Placed[] = []
  const maxTracks = 3
  const trackStep = 14
  const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })

  let labelIndex = 0
  for (const item of sorted) {
    const start = clamp(item.start, rangeStart, rangeEnd)
    const end = clamp(item.end, rangeStart, rangeEnd)
    const left = ((start - rangeStart) / 86400000) * pxPerDay
    const width = Math.max(10, ((Math.max(end, start) - start) / 86400000) * pxPerDay)

    let track = trackEnds.findIndex(te => start >= te)
    if (track < 0) track = Math.min(trackEnds.length, maxTracks - 1)
    trackEnds[track] = Math.max(trackEnds[track] ?? 0, end)

    const bt = typeMap.get(item.seg.barTypeId)
    const color = bt?.color ?? "#111827"
    const label = bt?.name ?? "Bar"
    const startTime = parseIsoDate(item.seg.startDate)
    const endTime = parseIsoDate(item.seg.endDate)
    const dayCount =
      Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.max(0, Math.round((endTime - startTime) / 86400000)) : 0
    const startLabel = item.seg.startDate ? fmt.format(new Date(item.seg.startDate)) : ""
    const endLabel = item.seg.endDate ? fmt.format(new Date(item.seg.endDate)) : ""
    const text = startLabel && endLabel ? `${startLabel} - ${endLabel} (${dayCount}days)` : `${item.seg.startDate} - ${item.seg.endDate}`

    const textX = left + width / 2

    placed.push({
      id: item.seg.id,
      left,
      width,
      top: track * trackStep,
      color,
      label,
      text,
      textX,
      labelPlacement: labelIndex % 2 === 0 ? "bottom" : "top",
    })
    labelIndex += 1
  }

  return { placed, tracks: Math.max(1, trackEnds.length) }
}

function dayIndexFromIso(rangeStart: number, iso: string) {
  const t = parseIsoDate(iso)
  if (!Number.isFinite(t)) return 0
  return Math.round((t - rangeStart) / 86400000)
}

function isoFromDayIndex(rangeStart: number, dayIndex: number) {
  return new Date(rangeStart + dayIndex * 86400000).toISOString().slice(0, 10)
}

type DragMode = "move" | "start" | "end"

type DragState = {
  id: string
  mode: DragMode
  startX: number
  startDayStart: number
  startDayEnd: number
}

export default function ScheduleLane({ segments, barTypes, rangeStart, rangeEnd, pxPerDay, heightPx, onCommit, onRequestRangeStart }: Props) {
  const widthPx = computeScheduleWidthPx(rangeStart, rangeEnd, pxPerDay)
  const [draft, setDraft] = useState<ScheduleSegment[]>(segments)
  const draftRef = useRef<ScheduleSegment[]>(segments)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const suppressClickUntilRef = useRef(0)
  const dragRef = useRef<DragState | null>(null)
  const prevRangeStartRef = useRef(rangeStart)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (draggingRef.current) return
    setDraft(segments)
  }, [segments])

  useEffect(() => {
    const prev = prevRangeStartRef.current
    if (prev === rangeStart) return
    const shiftDays = Math.round((prev - rangeStart) / 86400000)
    if (shiftDays !== 0 && draggingRef.current && dragRef.current) {
      dragRef.current.startDayStart += shiftDays
      dragRef.current.startDayEnd += shiftDays
    }
    prevRangeStartRef.current = rangeStart
  }, [rangeStart])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const { placed, tracks } = useMemo(() => placeSegments(draft, barTypes, rangeStart, rangeEnd, pxPerDay), [barTypes, draft, pxPerDay, rangeEnd, rangeStart])

  const height = Math.max(52, Math.round(heightPx ?? 62))
  const trackStep = 14
  const totalTracksHeight = Math.max(1, tracks) * trackStep
  const labelPad = Math.min(18, Math.floor(height / 3))
  const barAreaHeight = Math.max(12, height - labelPad * 2)
  const topOffset = labelPad + Math.max(0, Math.round((barAreaHeight - totalTracksHeight) / 2))
  const maxDay = Math.round((rangeEnd - rangeStart) / 86400000)

  function measureLabelWidth(text: string) {
    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement("canvas")
    const ctx = measureCanvasRef.current.getContext("2d")
    if (!ctx) return Math.min(320, Math.max(64, text.length * 6 + 16))
    ctx.font = "10px IBM Plex Sans"
    const w = ctx.measureText(text).width
    return Math.min(320, Math.max(64, Math.ceil(w + 16)))
  }

  const labelLayout = useMemo(() => {
    const labelH = 14
    const placedRects: Array<{ x: number; y: number; w: number; h: number }> = []
    const out = new Map<string, number>()
    const barRects = placed.map(seg => ({
      x: seg.left,
      y: topOffset + seg.top,
      w: seg.width,
      h: 12,
    }))

    const list = placed
      .slice()
      .sort((a, b) => (a.textX === b.textX ? a.top - b.top : a.textX - b.textX))

    function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    }

    for (const seg of list) {
      const w = measureLabelWidth(seg.text)
      const x = seg.textX - w / 2
      const barTop = topOffset + seg.top
      const barBottom = barTop + 12
      const minY = 2
      const maxY = Math.max(2, height - labelH - 2)

      const candidates: number[] = []
      const step = labelH + 4

      const topNear = barTop - labelH - 2
      const bottomNear = barBottom + 2

      function addTopCandidates() {
        candidates.push(clamp(topNear, minY, maxY))
        for (let i = 1; i <= 10; i += 1) candidates.push(clamp(topNear - step * i, minY, maxY))
      }

      function addBottomCandidates() {
        candidates.push(clamp(bottomNear, minY, maxY))
        for (let i = 1; i <= 10; i += 1) candidates.push(clamp(bottomNear + step * i, minY, maxY))
      }

      if (seg.labelPlacement === "bottom") {
        addBottomCandidates()
        addTopCandidates()
      } else {
        addTopCandidates()
        addBottomCandidates()
      }

      let y = candidates[0] ?? 2
      for (const cy of candidates) {
        const rect = { x, y: cy, w, h: labelH }
        if (placedRects.some(r => intersects(rect, r))) continue
        if (barRects.some(r => intersects(rect, r))) continue
        y = cy
        placedRects.push(rect)
        break
      }

      if (!out.has(seg.id)) out.set(seg.id, y)
    }

    return out
  }, [height, placed, topOffset])

  function updateDuringDrag(clientX: number) {
    const state = dragRef.current
    if (!state) return
    const deltaDays = Math.round((clientX - state.startX) / pxPerDay)
    if (deltaDays !== 0) movedRef.current = true
    const padDays = 7
    const next = draftRef.current.map(seg => {
      if (seg.id !== state.id) return seg
      const baseStart = state.startDayStart
      const baseEnd = state.startDayEnd

      if (state.mode === "move") {
        const len = Math.max(0, baseEnd - baseStart)
        const nextStartUnclamped = baseStart + deltaDays
        const nextEndUnclamped = nextStartUnclamped + len
        const nextEnd = nextEndUnclamped > maxDay ? maxDay : nextEndUnclamped
        const nextStart = nextEndUnclamped > maxDay ? nextEnd - len : nextStartUnclamped
        if (nextStart < padDays) onRequestRangeStart?.(rangeStart - (padDays - nextStart) * 86400000)
        return { ...seg, startDate: isoFromDayIndex(rangeStart, nextStart), endDate: isoFromDayIndex(rangeStart, nextEnd) }
      }

      if (state.mode === "start") {
        const nextStart = Math.min(baseStart + deltaDays, baseEnd)
        if (nextStart < padDays) onRequestRangeStart?.(rangeStart - (padDays - nextStart) * 86400000)
        return { ...seg, startDate: isoFromDayIndex(rangeStart, nextStart) }
      }

      const nextEnd = clamp(baseEnd + deltaDays, baseStart, maxDay)
      return { ...seg, endDate: isoFromDayIndex(rangeStart, nextEnd) }
    })

    setDraft(next)
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragRef.current) return
    updateDuringDrag(e.clientX)
  }

  function endDrag() {
    if (!dragRef.current) return
    draggingRef.current = false
    dragRef.current = null
    if (movedRef.current) suppressClickUntilRef.current = performance.now() + 600
    onCommit?.(draftRef.current)
  }

  useEffect(() => {
    function up() {
      endDrag()
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", up)
    }
  }, [])

  function startDrag(id: string, mode: DragMode, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    const seg = draftRef.current.find(s => s.id === id)
    if (!seg) return
    draggingRef.current = true
    movedRef.current = false
    dragRef.current = {
      id,
      mode,
      startX: e.clientX,
      startDayStart: dayIndexFromIso(rangeStart, seg.startDate),
      startDayEnd: dayIndexFromIso(rangeStart, seg.endDate),
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      style={{
        width: widthPx,
        height,
        backgroundImage: `repeating-linear-gradient(to right, rgba(24,24,27,0.08) 0, rgba(24,24,27,0.08) 1px, transparent 1px, transparent ${pxPerDay}px)`,
      }}
      onClickCapture={e => {
        if (performance.now() < suppressClickUntilRef.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {placed.map(seg => (
        <div key={seg.id} className="absolute" style={{ left: 0, top: 0 }}>
          <div
            className="group absolute z-10 rounded-[7px] shadow-[0_10px_20px_rgba(0,0,0,.12)]"
            style={{
              left: seg.left,
              width: seg.width,
              top: topOffset + seg.top,
              background: seg.color,
              height: 12,
            }}
            title={seg.label}
            onPointerDown={e => startDrag(seg.id, "move", e)}
          >
            <div
              className="absolute left-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition group-hover:opacity-100"
              onPointerDown={e => startDrag(seg.id, "start", e)}
            />
            <div
              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition group-hover:opacity-100"
              onPointerDown={e => startDrag(seg.id, "end", e)}
            />
          </div>

          <div
            className="pointer-events-none absolute z-20 w-max max-w-[320px] -translate-x-1/2 rounded-md border border-zinc-200 bg-white/90 px-2 py-0.5 text-[10px] text-zinc-700 backdrop-blur-[2px]"
            style={{
              left: seg.textX,
              top: labelLayout.get(seg.id) ?? 2,
            }}
          >
            <div className="truncate">{seg.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
