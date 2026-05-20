import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { BarType, ProgrammeItem, ProgrammeItemInput, ProgressLine, ProgressPoint, ScheduleSegment, SortDirection, SortKey, StatusType } from "@/types/programme"
import ScheduleLane, { computeScheduleWidthPx } from "@/components/ScheduleLane"
import TimelineAxis from "@/components/TimelineAxis"
import { clamp01, parseIsoDate } from "@/utils/date"

export type SortState = { key: SortKey; direction: SortDirection } | null

export type FilterState = {
  global: string
  t1No: string[]
  items: string[]
  srp: string[]
  worksManager: string[]
  designer: string[]
  statusIds: string[]
  scheduleStart: string
  scheduleEnd: string
}

type Props = {
  tableName: string
  storageNamespace: string
  items: ProgrammeItem[]
  barTypes: BarType[]
  statuses: StatusType[]
  progressLines: ProgressLine[]
  selectedId: string | null
  rangeStart: number
  rangeEnd: number
  sort: SortState
  filters: FilterState
  resetToken: number
  onSortChange: (next: SortState) => void
  onFiltersChange: (next: FilterState) => void
  onSelect: (id: string) => void
  onUpdateItem: (id: string, patch: Partial<Omit<ProgrammeItemInput, "segments">> & { segments?: ScheduleSegment[] }) => { ok: true } | { ok: false; error: string }
  onSetStatus: (id: string, statusId: string) => void
  onDelete: (id: string) => void
  onMoveRow: (sourceId: string, targetId: string) => void
  onAddProgressLine: () => void
  onUpdateProgressLine: (id: string, patch: Partial<Pick<ProgressLine, "name" | "color" | "weightPx">>) => void
  onRemoveProgressLine: (id: string) => void
  onSetProgressPoint: (lineId: string, itemId: string, patch: Partial<Pick<ProgressPoint, "date" | "yRatio">>) => void
}

type ColKey = "t1No" | "items" | "srp" | "worksManager" | "designer" | "schedule" | "status" | "actions"

const columns: Array<{ key: ColKey; label: string; sortable?: boolean; sortKey?: SortKey }> = [
  { key: "t1No", label: "T1 no.", sortable: true, sortKey: "t1No" },
  { key: "items", label: "Items", sortable: true, sortKey: "items" },
  { key: "srp", label: "SRP", sortable: true, sortKey: "srp" },
  { key: "worksManager", label: "Works Manager", sortable: true, sortKey: "worksManager" },
  { key: "designer", label: "Designer", sortable: true, sortKey: "designer" },
  { key: "schedule", label: "Programme", sortable: false },
  { key: "status", label: "Status", sortable: false },
  { key: "actions", label: "Action", sortable: false },
]

function nextSort(current: SortState, key: SortKey): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" }
  if (current.direction === "asc") return { key, direction: "desc" }
  return null
}

function getHeaderArrow(sort: SortState, key: SortKey) {
  if (!sort || sort.key !== key) return null
  return sort.direction === "asc" ? (
    <ChevronUp className="h-4 w-4" />
  ) : (
    <ChevronDown className="h-4 w-4" />
  )
}

export default function ProgrammeTable({
  tableName,
  storageNamespace,
  items,
  barTypes,
  statuses,
  progressLines,
  selectedId,
  rangeStart,
  rangeEnd,
  sort,
  filters,
  resetToken,
  onSortChange,
  onFiltersChange,
  onSelect,
  onUpdateItem,
  onSetStatus,
  onDelete,
  onMoveRow,
  onAddProgressLine,
  onUpdateProgressLine,
  onRemoveProgressLine,
  onSetProgressPoint,
}: Props) {
  const pxPerDay = 4
  const ns = `drp_${storageNamespace}_`
  const storageKey = `${ns}column_widths_v1`
  const visibilityStorageKey = `${ns}column_visibility_v1`
  const columnOrderStorageKey = `${ns}column_order_v1`
  const lineWeightStorageKey = `${ns}table_line_weight_v1`
  const lineColorStorageKey = `${ns}table_line_color_v1`
  const textSizeStorageKey = `${ns}table_text_size_v1`
  const rowHeightStorageKey = `${ns}table_row_height_v1`
  const legacy = storageNamespace === "default"
  const [widths, setWidths] = useState<Record<ColKey, number>>(() => {
    const defaults: Record<ColKey, number> = {
      t1No: 150,
      items: 260,
      srp: 170,
      worksManager: 210,
      designer: 190,
      schedule: 980,
      status: 160,
      actions: 140,
    }
    const raw = localStorage.getItem(storageKey) ?? (legacy ? localStorage.getItem("drp_column_widths_v1") : null)
    if (!raw) return defaults
    try {
      const parsed = JSON.parse(raw) as Partial<Record<ColKey, number>>
      return { ...defaults, ...parsed }
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths))
  }, [widths])

  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => {
    const defaults: Record<ColKey, boolean> = {
      t1No: true,
      items: true,
      srp: true,
      worksManager: true,
      designer: true,
      schedule: true,
      status: true,
      actions: true,
    }
    const raw = localStorage.getItem(visibilityStorageKey) ?? (legacy ? localStorage.getItem("drp_column_visibility_v1") : null)
    if (!raw) return defaults
    try {
      const parsed = JSON.parse(raw) as Partial<Record<ColKey, boolean>>
      return { ...defaults, ...parsed }
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    localStorage.setItem(visibilityStorageKey, JSON.stringify(visibleCols))
  }, [visibleCols])

  const [columnOrder, setColumnOrder] = useState<ColKey[]>(() => {
    const defaults = columns.map(c => c.key)
    const raw = localStorage.getItem(columnOrderStorageKey) ?? (legacy ? localStorage.getItem("drp_column_order_v1") : null)
    if (!raw) return defaults
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return defaults
      const next = parsed.filter((k): k is ColKey => typeof k === "string" && defaults.includes(k as ColKey)) as ColKey[]
      for (const k of defaults) if (!next.includes(k)) next.push(k)
      return next
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder))
  }, [columnOrder])

  const [textSizePx, setTextSizePx] = useState<number>(() => {
    const raw = localStorage.getItem(textSizeStorageKey) ?? (legacy ? localStorage.getItem("drp_table_text_size_v1") : null)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : 14
  })

  useEffect(() => {
    localStorage.setItem(textSizeStorageKey, String(textSizePx))
  }, [textSizePx])

  const [rowHeightPx, setRowHeightPx] = useState<number>(() => {
    const raw = localStorage.getItem(rowHeightStorageKey) ?? (legacy ? localStorage.getItem("drp_table_row_height_v1") : null)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : 62
  })

  useEffect(() => {
    localStorage.setItem(rowHeightStorageKey, String(rowHeightPx))
  }, [rowHeightPx])

  const [lineWeightPx, setLineWeightPx] = useState<number>(() => {
    const raw = localStorage.getItem(lineWeightStorageKey) ?? (legacy ? localStorage.getItem("drp_table_line_weight_v1") : null)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : 1
  })

  useEffect(() => {
    localStorage.setItem(lineWeightStorageKey, String(lineWeightPx))
  }, [lineWeightPx])

  const [lineColor, setLineColor] = useState<string>(() => {
    const raw = localStorage.getItem(lineColorStorageKey) ?? (legacy ? localStorage.getItem("drp_table_line_color_v1") : null)
    if (raw && /^#([0-9a-f]{6})$/i.test(raw.trim())) return raw.trim()
    return "#D4D4D8"
  })

  useEffect(() => {
    localStorage.setItem(lineColorStorageKey, lineColor)
  }, [lineColor])

  const visibleColumns = useMemo(() => {
    const byKey = new Map(columns.map(c => [c.key, c]))
    return columnOrder.map(k => byKey.get(k)).filter((c): c is (typeof columns)[number] => Boolean(c) && visibleCols[c!.key] !== false)
  }, [columnOrder, visibleCols])

  const draggedColRef = useRef<ColKey | null>(null)
  const draggedRowRef = useRef<string | null>(null)
  const suppressRowClickUntilRef = useRef(0)

  const filterableKeys = useMemo(() => ["t1No", "items", "srp", "worksManager", "designer", "status"] as const, [])
  type FilterKey = (typeof filterableKeys)[number]
  const [filterOpenKey, setFilterOpenKey] = useState<FilterKey | null>(null)
  const [filterPopupStyle, setFilterPopupStyle] = useState<React.CSSProperties>({})
  const filterButtonRefs = useRef<Partial<Record<FilterKey, HTMLButtonElement | null>>>({})
  const [filterSearch, setFilterSearch] = useState("")
  const filterPopoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setFilterSearch("")
  }, [filterOpenKey])

  useEffect(() => {
    if (!filterOpenKey) return
    function onDown(e: PointerEvent) {
      const pop = filterPopoverRef.current
      const btn = filterButtonRefs.current[filterOpenKey]
      if (btn && e.target instanceof Node && btn.contains(e.target)) return
      if (pop && e.target instanceof Node && pop.contains(e.target)) return
      setFilterOpenKey(null)
    }
    window.addEventListener("pointerdown", onDown)
    return () => window.removeEventListener("pointerdown", onDown)
  }, [filterOpenKey])

  useEffect(() => {
    if (!filterOpenKey) return
    function update() {
      const btn = filterButtonRefs.current[filterOpenKey]
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const right = Math.max(8, Math.round(window.innerWidth - rect.right))
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      if (spaceBelow < 360 && spaceAbove > spaceBelow) {
        setFilterPopupStyle({ position: "fixed", right, bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 10)) })
      } else {
        setFilterPopupStyle({ position: "fixed", right, top: Math.max(8, Math.round(rect.bottom + 10)) })
      }
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [filterOpenKey])

  const axisScrollRef = useRef<HTMLDivElement | null>(null)
  const headerScrollRef = useRef<HTMLDivElement | null>(null)
  const bodyScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollingRef = useRef(false)
  const scrollingRef = useRef(false)
  const [scheduleScrollLeft, setScheduleScrollLeft] = useState(0)
  const [scheduleAxisMinWidthPx, setScheduleAxisMinWidthPx] = useState(0)
  const [containerWidthPx, setContainerWidthPx] = useState(0)

  const overlayRootRef = useRef<HTMLDivElement | null>(null)
  const scheduleCellRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [scheduleRects, setScheduleRects] = useState<Record<string, { left: number; top: number; width: number; height: number }>>({})
  const progressDragRef = useRef<{
    lineId: string
    itemId: string
    startX: number
    startDayIndex: number
  } | null>(null)

  function syncScroll(left: number) {
    setScheduleScrollLeft(left)
  }

  function handleAxisScroll() {
    if (scrollingRef.current) return
    const left = axisScrollRef.current?.scrollLeft ?? 0
    syncScroll(left)
  }

  useEffect(() => {
    scrollingRef.current = true
    if (axisScrollRef.current) axisScrollRef.current.scrollLeft = scheduleScrollLeft
    scrollingRef.current = false
  }, [scheduleScrollLeft])

  useLayoutEffect(() => {
    const el = axisScrollRef.current
    if (!el) return
    function update() {
      setScheduleAxisMinWidthPx(el.clientWidth)
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [visibleColumns.length, widths.schedule])

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    function update() {
      setContainerWidthPx(el.clientWidth)
    }
    update()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null
    if (ro) ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      if (ro) ro.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!containerWidthPx) return
    const visibleKeys = visibleColumns.map(c => c.key)
    if (!visibleKeys.length) return
    const sum = visibleKeys.reduce((acc, k) => acc + (widths[k] ?? 0), 0)
    const delta = Math.floor(containerWidthPx - sum)
    if (delta <= 0) return
    const targetKey: ColKey = visibleKeys.includes("schedule") ? "schedule" : visibleKeys[visibleKeys.length - 1]
    setWidths(prev => {
      const sumPrev = visibleKeys.reduce((acc, k) => acc + (prev[k] ?? 0), 0)
      const deltaPrev = Math.floor(containerWidthPx - sumPrev)
      if (deltaPrev <= 0) return prev
      const nextW = Math.max(90, Math.round((prev[targetKey] ?? 90) + deltaPrev))
      if (nextW === prev[targetKey]) return prev
      return { ...prev, [targetKey]: nextW }
    })
  }, [containerWidthPx, visibleColumns, widths])

  const resizeRef = useRef<{ key: ColKey; startX: number; startW: number } | null>(null)
  const [tableError, setTableError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; key: "t1No" | "items" | "srp" | "worksManager" | "designer"; value: string } | null>(null)
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const state = resizeRef.current
      if (!state) return
      const delta = e.clientX - state.startX
      setWidths(prev => ({
        ...prev,
        [state.key]: Math.max(90, Math.round(state.startW + delta)),
      }))
    }
    function onUp() {
      resizeRef.current = null
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  function startResize(key: ColKey, e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { key, startX: e.clientX, startW: widths[key] }
  }

  function measureText(text: string) {
    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement("canvas")
    const ctx = measureCanvasRef.current.getContext("2d")
    if (!ctx) return text.length * 8
    ctx.font = `${textSizePx}px IBM Plex Sans`
    return ctx.measureText(text).width
  }

  function autoFit(key: ColKey) {
    if (key === "schedule") return
    const header = columns.find(c => c.key === key)?.label ?? ""
    const values =
      key === "t1No"
        ? items.map(i => i.t1No)
        : key === "items"
          ? items.map(i => i.items)
          : key === "srp"
            ? items.map(i => i.srp)
            : key === "worksManager"
              ? items.map(i => i.worksManager)
              : key === "designer"
                ? items.map(i => i.designer)
                : key === "status"
                    ? statuses.map(s => s.name)
                  : key === "actions"
                    ? ["Delete"]
                    : []
    const max = Math.max(measureText(header), ...values.map(v => measureText(String(v ?? ""))))
    const next = Math.max(90, Math.min(680, Math.ceil(max + 56)))
    setWidths(prev => ({ ...prev, [key]: next }))
  }

  function beginEdit(id: string, key: "t1No" | "items" | "srp" | "worksManager" | "designer", value: string) {
    setTableError(null)
    setEditing({ id, key, value })
  }

  function commitEdit() {
    if (!editing) return
    const { id, key, value } = editing
    const result = onUpdateItem(id, { [key]: value } as Partial<ProgrammeItemInput>)
    if (result.ok === false) {
      setTableError(result.error)
      return
    }
    setEditing(null)
  }

  function cancelEdit() {
    setEditing(null)
  }

  const [columnsOpen, setColumnsOpen] = useState(false)
  const columnsPopoverRef = useRef<HTMLDivElement | null>(null)
  const columnsButtonRef = useRef<HTMLButtonElement | null>(null)
  const [columnsPopupStyle, setColumnsPopupStyle] = useState<React.CSSProperties>({})
  const outerRef = useRef<HTMLDivElement | null>(null)

  const [progressOpen, setProgressOpen] = useState(false)
  const progressPopoverRef = useRef<HTMLDivElement | null>(null)
  const progressButtonRef = useRef<HTMLButtonElement | null>(null)
  const [progressPopupStyle, setProgressPopupStyle] = useState<React.CSSProperties>({})

  const layoutsStorageKey = `${ns}table_layouts_v1`
  type Layout = {
    id: string
    name: string
    createdAt: string
    updatedAt: string
    settings: {
      widths: Record<ColKey, number>
      visibleCols: Record<ColKey, boolean>
      columnOrder: ColKey[]
      textSizePx: number
      rowHeightPx: number
      lineWeightPx: number
      lineColor: string
    }
  }

  function makeLayoutId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const [layoutsOpen, setLayoutsOpen] = useState(false)
  const layoutsPopoverRef = useRef<HTMLDivElement | null>(null)
  const layoutsButtonRef = useRef<HTMLButtonElement | null>(null)
  const [layoutsPopupStyle, setLayoutsPopupStyle] = useState<React.CSSProperties>({})
  const [layoutName, setLayoutName] = useState("")
  const [layouts, setLayouts] = useState<Layout[]>(() => {
    const raw = localStorage.getItem(layoutsStorageKey) ?? (legacy ? localStorage.getItem("drp_table_layouts_v1") : null)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed as Layout[]
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(layoutsStorageKey, JSON.stringify(layouts))
  }, [layouts])

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!layoutsOpen) return
      const el = layoutsPopoverRef.current
      const btn = layoutsButtonRef.current
      if (btn && e.target instanceof Node && btn.contains(e.target)) return
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setLayoutsOpen(false)
    }
    window.addEventListener("pointerdown", onDown)
    return () => window.removeEventListener("pointerdown", onDown)
  }, [layoutsOpen])

  useEffect(() => {
    if (!layoutsOpen) return
    function update() {
      const btn = layoutsButtonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const right = Math.max(8, Math.round(window.innerWidth - rect.right))
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      if (spaceBelow < 420 && spaceAbove > spaceBelow) {
        setLayoutsPopupStyle({ position: "fixed", right, bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 10)) })
      } else {
        setLayoutsPopupStyle({ position: "fixed", right, top: Math.max(8, Math.round(rect.bottom + 10)) })
      }
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [layoutsOpen])

  function saveCurrentLayout() {
    const name = layoutName.trim()
    if (!name) return
    const now = new Date().toISOString()
    const layout: Layout = {
      id: makeLayoutId(),
      name,
      createdAt: now,
      updatedAt: now,
      settings: {
        widths,
        visibleCols,
        columnOrder,
        textSizePx,
        rowHeightPx,
        lineWeightPx,
        lineColor,
      },
    }
    setLayouts(prev => [layout, ...prev].slice(0, 50))
    setLayoutName("")
  }

  function applyLayout(layout: Layout) {
    const defaults = columns.map(c => c.key)
    const nextOrder = layout.settings.columnOrder.filter(k => defaults.includes(k))
    for (const k of defaults) if (!nextOrder.includes(k)) nextOrder.push(k)

    setWidths(prev => ({ ...prev, ...layout.settings.widths }))
    setVisibleCols(prev => ({ ...prev, ...layout.settings.visibleCols }))
    setColumnOrder(nextOrder)
    setTextSizePx(layout.settings.textSizePx)
    setRowHeightPx(layout.settings.rowHeightPx)
    setLineWeightPx(layout.settings.lineWeightPx)
    setLineColor(layout.settings.lineColor)
    setLayoutsOpen(false)
  }

  function removeLayout(id: string) {
    setLayouts(prev => prev.filter(l => l.id !== id))
  }

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!columnsOpen) return
      const el = columnsPopoverRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setColumnsOpen(false)
    }
    window.addEventListener("pointerdown", onDown)
    return () => window.removeEventListener("pointerdown", onDown)
  }, [columnsOpen])

  useEffect(() => {
    if (!columnsOpen) return
    function update() {
      const btn = columnsButtonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const right = Math.max(8, Math.round(window.innerWidth - rect.right))
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      if (spaceBelow < 340 && spaceAbove > spaceBelow) {
        setColumnsPopupStyle({ position: "fixed", right, bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 10)) })
      } else {
        setColumnsPopupStyle({ position: "fixed", right, top: Math.max(8, Math.round(rect.bottom + 10)) })
      }
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [columnsOpen])

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!progressOpen) return
      const el = progressPopoverRef.current
      const btn = progressButtonRef.current
      if (btn && e.target instanceof Node && btn.contains(e.target)) return
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setProgressOpen(false)
    }
    window.addEventListener("pointerdown", onDown)
    return () => window.removeEventListener("pointerdown", onDown)
  }, [progressOpen])

  useEffect(() => {
    if (!progressOpen) return
    function update() {
      const btn = progressButtonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const right = Math.max(8, Math.round(window.innerWidth - rect.right))
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      if (spaceBelow < 420 && spaceAbove > spaceBelow) {
        setProgressPopupStyle({ position: "fixed", right, bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 10)) })
      } else {
        setProgressPopupStyle({ position: "fixed", right, top: Math.max(8, Math.round(rect.bottom + 10)) })
      }
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [progressOpen])

  function computeAutoFitWidth(key: ColKey) {
    const header = columns.find(c => c.key === key)?.label ?? ""
    const values =
      key === "t1No"
        ? items.map(i => i.t1No)
        : key === "items"
          ? items.map(i => i.items)
          : key === "srp"
            ? items.map(i => i.srp)
            : key === "worksManager"
              ? items.map(i => i.worksManager)
              : key === "designer"
                ? items.map(i => i.designer)
                : key === "status"
                    ? statuses.map(s => s.name)
                  : key === "actions"
                    ? ["Delete"]
                    : []
    const max = Math.max(measureText(header), ...values.map(v => measureText(String(v ?? ""))))
    return Math.max(90, Math.min(680, Math.ceil(max + 56)))
  }

  useEffect(() => {
    const available = Math.max(640, (outerRef.current?.clientWidth ?? window.innerWidth) - 2)
    const nextVisible: Record<ColKey, boolean> = {
      t1No: true,
      items: true,
      srp: true,
      worksManager: true,
      designer: true,
      schedule: true,
      status: true,
      actions: true,
    }
    setVisibleCols(nextVisible)

    const maxByKey: Partial<Record<ColKey, number>> = {
      t1No: 140,
      items: 260,
      srp: 180,
      worksManager: 220,
      designer: 200,
      status: 220,
      actions: 140,
    }
    const otherKeys: ColKey[] = ["t1No", "items", "srp", "worksManager", "designer", "status", "actions"]
    const base: Record<ColKey, number> = { ...widths }
    for (const k of otherKeys) {
      const w = computeAutoFitWidth(k)
      const maxW = maxByKey[k] ?? 260
      base[k] = Math.max(90, Math.min(maxW, w))
    }
    const sumOthers = otherKeys.reduce((acc, k) => acc + base[k], 0)
    base.schedule = Math.max(360, Math.min(980, available - sumOthers))

    let total = sumOthers + base.schedule
    if (total > available) {
      base.schedule = Math.max(360, Math.min(base.schedule, base.schedule - (total - available)))
      total = sumOthers + base.schedule
    }
    if (total > available) {
      const overflow = total - available
      const shrinkable = otherKeys.map(k => ({ k, room: base[k] - 90 })).filter(x => x.room > 0)
      const totalRoom = shrinkable.reduce((acc, x) => acc + x.room, 0)
      if (totalRoom > 0) {
        for (const x of shrinkable) {
          const delta = Math.round((overflow * x.room) / totalRoom)
          base[x.k] = Math.max(90, base[x.k] - delta)
        }
      }
    }
    setWidths(base)
  }, [resetToken])

  const textSizeOptions = Array.from({ length: 21 }, (_, i) => 10 + i)
  const rowHeightOptions = Array.from({ length: 26 }, (_, i) => 40 + i * 4)
  const lineWeightOptions = [1, 2, 3, 4]
  const cellPadY = Math.max(6, Math.min(22, Math.floor((rowHeightPx - 34) / 2)))
  const schedulePadY = Math.max(6, Math.min(14, Math.floor((rowHeightPx - 46) / 2)))
  const scheduleLaneHeightPx = Math.max(44, rowHeightPx - schedulePadY * 2 - 2)
  const scheduleWidthPx = useMemo(() => computeScheduleWidthPx(rangeStart, rangeEnd, pxPerDay), [pxPerDay, rangeEnd, rangeStart])
  const maxDayIndex = useMemo(() => Math.round((rangeEnd - rangeStart) / 86400000), [rangeEnd, rangeStart])

  function dayIndexFromIso(iso: string) {
    const t = parseIsoDate(iso)
    if (!Number.isFinite(t)) return 0
    return Math.round((t - rangeStart) / 86400000)
  }

  function isoFromDayIndex(dayIndex: number) {
    return new Date(rangeStart + dayIndex * 86400000).toISOString().slice(0, 10)
  }

  function mixWithWhite(hex: string, whiteRatio: number) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
    if (!m) return ""
    const r = parseInt(m[1], 16)
    const g = parseInt(m[2], 16)
    const b = parseInt(m[3], 16)
    const rr = Math.round(r * (1 - whiteRatio) + 255 * whiteRatio)
    const gg = Math.round(g * (1 - whiteRatio) + 255 * whiteRatio)
    const bb = Math.round(b * (1 - whiteRatio) + 255 * whiteRatio)
    return `rgb(${rr} ${gg} ${bb})`
  }

  const thBase =
    "relative border-b border-r px-4 py-2 align-top text-left font-medium text-zinc-700"
  const tdBase = "border-b border-r px-4 align-middle"
  const stickyHeader = "sticky left-0 z-30 bg-white"
  const stickyFilter = "sticky left-0 z-30 bg-white"

  const headerRowRef = useRef<HTMLTableRowElement | null>(null)
  const [headerRowHeight, setHeaderRowHeight] = useState(44)
  useLayoutEffect(() => {
    function measure() {
      const h = headerRowRef.current?.getBoundingClientRect().height ?? 44
      setHeaderRowHeight(Math.max(36, Math.round(h)))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [visibleColumns.length, widths, textSizePx, lineWeightPx])

  useLayoutEffect(() => {
    const root = overlayRootRef.current
    if (!root) return
    function measure() {
      const rootRect = root.getBoundingClientRect()
      const next: Record<string, { left: number; top: number; width: number; height: number }> = {}
      for (const item of items) {
        const el = scheduleCellRefs.current[item.id]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        next[item.id] = {
          left: rect.left - rootRect.left,
          top: rect.top - rootRect.top,
          width: rect.width,
          height: rect.height,
        }
      }
      setScheduleRects(next)
    }
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null
    if (ro) ro.observe(root)
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
      if (ro) ro.disconnect()
    }
  }, [items, scheduleLaneHeightPx, visibleColumns.length, widths])

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = progressDragRef.current
      if (!drag) return
      const deltaDays = Math.round((e.clientX - drag.startX) / pxPerDay)
      const nextDayIndex = Math.max(0, Math.min(maxDayIndex, drag.startDayIndex + deltaDays))
      const date = isoFromDayIndex(nextDayIndex)

      const cell = scheduleCellRefs.current[drag.itemId]
      if (!cell) return
      const rect = cell.getBoundingClientRect()
      const yRatio = clamp01((e.clientY - rect.top) / Math.max(1, rect.height))
      onSetProgressPoint(drag.lineId, drag.itemId, { date, yRatio })
    }

    function onUp() {
      progressDragRef.current = null
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [isoFromDayIndex, maxDayIndex, onSetProgressPoint, pxPerDay])

  function normalizeKey(value: string) {
    return value.trim().toLowerCase()
  }

  function uniqueOptions(values: string[]) {
    const map = new Map<string, string>()
    for (const raw of values) {
      const v = String(raw ?? "")
      const k = normalizeKey(v)
      if (!map.has(k)) map.set(k, v)
    }
    return Array.from(map.values())
  }

  const optionsByKey = useMemo(() => {
    const cap = 250
    const t1No = uniqueOptions(items.map(i => i.t1No)).slice(0, cap).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)))
    const itemsOpt = uniqueOptions(items.map(i => i.items)).slice(0, cap).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)))
    const srp = uniqueOptions(items.map(i => i.srp)).slice(0, cap).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)))
    const worksManager = uniqueOptions(items.map(i => i.worksManager)).slice(0, cap).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)))
    const designer = uniqueOptions(items.map(i => i.designer)).slice(0, cap).sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)))
    return { t1No, items: itemsOpt, srp, worksManager, designer }
  }, [items])

  const filteredList = useMemo(() => {
    if (!filterOpenKey) return []
    const q = filterSearch.trim().toLowerCase()
    if (filterOpenKey === "status") {
      const list = statuses.map(s => ({ id: s.id, name: s.name, color: s.color, iconDataUrl: s.iconDataUrl }))
      return q ? list.filter(s => s.name.toLowerCase().includes(q)) : list
    }
    const list =
      filterOpenKey === "t1No"
        ? optionsByKey.t1No
        : filterOpenKey === "items"
          ? optionsByKey.items
          : filterOpenKey === "srp"
            ? optionsByKey.srp
            : filterOpenKey === "worksManager"
              ? optionsByKey.worksManager
              : optionsByKey.designer
    return q ? list.filter(v => v.toLowerCase().includes(q)) : list
  }, [filterOpenKey, filterSearch, optionsByKey, statuses])

  function toggleFilterValue(key: FilterKey, value: string) {
    if (key === "status") {
      const id = value
      const next = filters.statusIds.includes(id) ? filters.statusIds.filter(x => x !== id) : [...filters.statusIds, id]
      onFiltersChange({ ...filters, statusIds: next })
      return
    }
    const nextFor = (current: string[]) => (current.includes(value) ? current.filter(x => x !== value) : [...current, value])
    if (key === "t1No") onFiltersChange({ ...filters, t1No: nextFor(filters.t1No) })
    else if (key === "items") onFiltersChange({ ...filters, items: nextFor(filters.items) })
    else if (key === "srp") onFiltersChange({ ...filters, srp: nextFor(filters.srp) })
    else if (key === "worksManager") onFiltersChange({ ...filters, worksManager: nextFor(filters.worksManager) })
    else onFiltersChange({ ...filters, designer: nextFor(filters.designer) })
  }

  function clearFilterKey(key: FilterKey) {
    if (key === "status") onFiltersChange({ ...filters, statusIds: [] })
    else if (key === "t1No") onFiltersChange({ ...filters, t1No: [] })
    else if (key === "items") onFiltersChange({ ...filters, items: [] })
    else if (key === "srp") onFiltersChange({ ...filters, srp: [] })
    else if (key === "worksManager") onFiltersChange({ ...filters, worksManager: [] })
    else onFiltersChange({ ...filters, designer: [] })
  }

  function renderColGroup() {
    return (
      <colgroup>
        {visibleColumns.map(c => (
          <col key={c.key} style={{ width: widths[c.key] }} />
        ))}
      </colgroup>
    )
  }

  return (
    <div ref={outerRef} className="w-full rounded-xl border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(0,0,0,.08)]" style={{ borderColor: lineColor }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Table</div>
          <div className="truncate font-[var(--font-display)] text-lg text-zinc-950">{tableName}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-zinc-600">{items.length} rows</div>
          <div className="relative">
            <button
              type="button"
              ref={layoutsButtonRef}
              onClick={() => setLayoutsOpen(v => !v)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
            >
              Layouts
            </button>
            {layoutsOpen ? (
              <div
                ref={layoutsPopoverRef}
                className="z-[200] w-[360px] max-w-[92vw] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.16)]"
                style={layoutsPopupStyle}
              >
                <div className="border-b border-zinc-200 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Save / Load</div>
                  <div className="text-sm font-medium text-zinc-900">Layouts</div>
                </div>
                <div className="grid gap-2 border-b border-zinc-200 p-3">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={layoutName}
                      onChange={e => setLayoutName(e.target.value)}
                      className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                      placeholder="Layout name"
                    />
                    <button
                      type="button"
                      onClick={saveCurrentLayout}
                      className="h-9 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800"
                    >
                      Save
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-zinc-500">{layouts.length} saved</div>
                    <button
                      type="button"
                      onClick={() => setLayoutsOpen(false)}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="grid max-h-[55vh] gap-2 overflow-auto p-3">
                  {layouts.map(l => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{l.name}</div>
                        <div className="text-xs text-zinc-500">{new Date(l.updatedAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyLayout(l)}
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm("Delete this layout?")
                            if (ok) removeLayout(l.id)
                          }}
                          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {layouts.length === 0 ? <div className="text-sm text-zinc-600">No saved layouts yet.</div> : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              ref={progressButtonRef}
              onClick={() => setProgressOpen(v => !v)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
            >
              Progress
            </button>
            {progressOpen ? (
              <div
                ref={progressPopoverRef}
                className="z-[200] w-[420px] max-w-[92vw] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.16)]"
                style={progressPopupStyle}
              >
                <div className="border-b border-zinc-200 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Schedule</div>
                  <div className="text-sm font-medium text-zinc-900">Progress lines</div>
                </div>
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
                  <div className="text-xs text-zinc-500">{progressLines.length} lines</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onAddProgressLine()}
                      className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
                    >
                      Add line
                    </button>
                    <button
                      type="button"
                      onClick={() => setProgressOpen(false)}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="grid max-h-[55vh] gap-2 overflow-auto p-3">
                  {progressLines.map(line => (
                    <div key={line.id} className="grid gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-3">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                        <input
                          value={line.name}
                          onChange={e => onUpdateProgressLine(line.id, { name: e.target.value })}
                          className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                        />
                        <input
                          type="color"
                          value={line.color}
                          onChange={e => onUpdateProgressLine(line.id, { color: e.target.value })}
                          className="h-9 w-12 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
                          aria-label="Progress line colour"
                        />
                        <select
                          value={line.weightPx}
                          onChange={e => onUpdateProgressLine(line.id, { weightPx: Number(e.target.value) })}
                          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
                        >
                          {[1, 2, 3, 4, 5, 6].map(v => (
                            <option key={v} value={v}>
                              {v}px
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm("Delete this progress line?")
                            if (ok) onRemoveProgressLine(line.id)
                          }}
                          className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-700 transition hover:bg-zinc-50"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="text-xs text-zinc-500">Drag the dot(s) on the schedule to set date + vertical position.</div>
                    </div>
                  ))}
                  {progressLines.length === 0 ? <div className="text-sm text-zinc-600">No progress lines yet.</div> : null}
                </div>
              </div>
            ) : null}
          </div>
          <div ref={columnsPopoverRef} className="relative">
            <button
              type="button"
              ref={columnsButtonRef}
              onClick={() => setColumnsOpen(v => !v)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
            >
              Columns
            </button>
            {columnsOpen ? (
              <div
                className="z-[200] w-[260px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.16)]"
                style={columnsPopupStyle}
              >
                <div className="border-b border-zinc-200 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Show / Hide</div>
                  <div className="text-sm font-medium text-zinc-900">Columns</div>
                </div>
                <div className="grid max-h-[48vh] gap-2 overflow-auto p-3">
                  {columns.map(c => {
                    const checked = visibleCols[c.key] !== false
                    const disableUncheck = checked && visibleColumns.length <= 1
                    return (
                      <label key={c.key} className={cn("flex items-center gap-2 text-sm text-zinc-700", disableUncheck ? "opacity-50" : "")}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disableUncheck}
                          onChange={() =>
                            setVisibleCols(prev => ({
                              ...prev,
                              [c.key]: prev[c.key] === false,
                            }))
                          }
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        <span>{c.label}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-3 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCols({
                        t1No: true,
                        items: true,
                        srp: true,
                        worksManager: true,
                        designer: true,
                        schedule: true,
                        status: true,
                        actions: true,
                      })
                    }
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Show all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCols({
                        t1No: true,
                        items: false,
                        srp: false,
                        worksManager: false,
                        designer: false,
                        schedule: false,
                        status: false,
                        actions: false,
                      })
                    }
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Hide all
                  </button>
                  <button
                    type="button"
                    onClick={() => setColumnsOpen(false)}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <select
            value={textSizePx}
            onChange={e => setTextSizePx(Number(e.target.value))}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
          >
            {textSizeOptions.map(v => (
              <option key={v} value={v}>
                Text {v}px
              </option>
            ))}
          </select>
          <select
            value={rowHeightPx}
            onChange={e => setRowHeightPx(Number(e.target.value))}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
          >
            {rowHeightOptions.map(v => (
              <option key={v} value={v}>
                Row {v}px
              </option>
            ))}
          </select>
          <select
            value={lineWeightPx}
            onChange={e => setLineWeightPx(Number(e.target.value))}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-zinc-400"
          >
            {lineWeightOptions.map(v => (
              <option key={v} value={v}>
                Lines {v}px
              </option>
            ))}
          </select>
          <input
            type="color"
            value={lineColor}
            onChange={e => setLineColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
            aria-label="Line colour"
          />
          <input
            value={filters.global}
            onChange={e => onFiltersChange({ ...filters, global: e.target.value })}
            className="h-9 w-[220px] rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
            placeholder="Search"
          />
          <button
            type="button"
            onClick={() =>
              onFiltersChange({
                global: "",
                t1No: [],
                items: [],
                srp: [],
                worksManager: [],
                designer: [],
                statusIds: [],
                scheduleStart: "",
                scheduleEnd: "",
              })
            }
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
          >
            Clear filters
          </button>
        </div>
      </div>

      {tableError ? (
        <div className="border-b border-zinc-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{tableError}</div>
      ) : null}

      <div className="sticky top-0 z-30 bg-white">
        <div
          ref={headerScrollRef}
          className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          onScroll={e => {
            if (tableScrollingRef.current) return
            const left = (e.currentTarget as HTMLDivElement).scrollLeft
            tableScrollingRef.current = true
            if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = left
            tableScrollingRef.current = false
          }}
        >
          <table
            className="border-separate border-spacing-0 table-fixed"
            style={{ width: Math.max(containerWidthPx || 0, visibleColumns.reduce((acc, c) => acc + widths[c.key], 0)) }}
          >
            {renderColGroup()}
            <thead className="z-40">
              <tr ref={headerRowRef} className="bg-white">
                {visibleColumns.map((col, idx) => {
                  const isSticky = idx === 0
                  const isLast = idx === visibleColumns.length - 1
                  return (
                    <th
                      key={col.key}
                    className={cn(thBase, isLast ? "border-r-0" : "", isSticky ? stickyHeader : "", col.key === "schedule" ? "px-0" : "")}
                      style={{
                        width: widths[col.key],
                        minWidth: widths[col.key],
                        borderRightWidth: isLast ? 0 : lineWeightPx,
                        borderBottomWidth: lineWeightPx,
                        borderRightStyle: "solid",
                        borderBottomStyle: "solid",
                        borderColor: lineColor,
                      fontSize: textSizePx,
                      }}
                      draggable
                      onDragStart={e => {
                        draggedColRef.current = col.key
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData("text/plain", col.key)
                      }}
                      onDragOver={e => {
                        if (!draggedColRef.current) return
                        e.preventDefault()
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        const source = draggedColRef.current
                        draggedColRef.current = null
                        if (!source || source === col.key) return
                        setColumnOrder(prev => {
                          const next = prev.slice()
                          const from = next.indexOf(source)
                          const to = next.indexOf(col.key)
                          if (from < 0 || to < 0) return prev
                          next.splice(from, 1)
                          next.splice(to, 0, source)
                          return next
                        })
                      }}
                    >
                      {col.key === "schedule" ? (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <span className="px-3">{col.label}</span>
                          </div>
                          <div ref={axisScrollRef} onScroll={handleAxisScroll} className="overflow-x-auto" style={{ width: "100%" }}>
                            <TimelineAxis
                              rangeStart={rangeStart}
                              rangeEnd={rangeEnd}
                              pxPerDay={pxPerDay}
                              fontSizePx={Math.max(10, Math.round(textSizePx * 0.75))}
                              minWidthPx={scheduleAxisMinWidthPx}
                            />
                          </div>
                        </div>
                      ) : col.sortable && col.sortKey ? (
                        <button
                          type="button"
                          onClick={() => onSortChange(nextSort(sort, col.sortKey!))}
                          className="inline-flex items-center gap-2 transition hover:text-zinc-900"
                        >
                          {col.label}
                          <span className="text-zinc-400">{getHeaderArrow(sort, col.sortKey!)}</span>
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-2">{col.label}</div>
                      )}

                      <div
                        onPointerDown={e => startResize(col.key, e)}
                        onDoubleClick={() => autoFit(col.key)}
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                      />
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-white">
                {visibleColumns.map((col, idx) => {
                  const isSticky = idx === 0
                  const isLast = idx === visibleColumns.length - 1
                  const baseClass = cn("border-b border-r bg-white px-3 py-2", isLast ? "border-r-0" : "", isSticky ? stickyFilter : "")
                  const style: React.CSSProperties = {
                    width: widths[col.key],
                    minWidth: widths[col.key],
                    borderRightWidth: isLast ? 0 : lineWeightPx,
                    borderBottomWidth: lineWeightPx,
                    borderRightStyle: "solid",
                    borderBottomStyle: "solid",
                    borderColor: lineColor,
                    fontSize: textSizePx,
                  }

                  function openFor(key: FilterKey) {
                    setFilterOpenKey(curr => (curr === key ? null : key))
                  }

                  if (col.key === "schedule") {
                    return (
                      <th key={col.key} className={baseClass} style={style}>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={filters.scheduleStart}
                            onChange={e => onFiltersChange({ ...filters, scheduleStart: e.target.value })}
                            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-zinc-900 outline-none focus:border-zinc-400"
                          />
                          <input
                            type="date"
                            value={filters.scheduleEnd}
                            onChange={e => onFiltersChange({ ...filters, scheduleEnd: e.target.value })}
                            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-zinc-900 outline-none focus:border-zinc-400"
                          />
                        </div>
                      </th>
                    )
                  }

                  if (col.key === "t1No" || col.key === "items" || col.key === "srp" || col.key === "worksManager" || col.key === "designer" || col.key === "status") {
                    const key = col.key as FilterKey
                    const count =
                      key === "status"
                        ? filters.statusIds.length
                        : key === "t1No"
                          ? filters.t1No.length
                          : key === "items"
                            ? filters.items.length
                            : key === "srp"
                              ? filters.srp.length
                              : key === "worksManager"
                                ? filters.worksManager.length
                                : filters.designer.length
                    return (
                      <th key={col.key} className={baseClass} style={style}>
                        <button
                          type="button"
                          ref={el => {
                            filterButtonRefs.current[key] = el
                          }}
                          onClick={() => openFor(key)}
                          className="inline-flex h-9 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-zinc-700 transition hover:bg-zinc-50"
                        >
                          <span className="truncate">{count ? `Selected (${count})` : "Filter"}</span>
                          <span className="ml-2 text-zinc-400">▾</span>
                        </button>
                      </th>
                    )
                  }

                  return <th key={col.key} className={baseClass} style={style} />
                })}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div
        className="overflow-x-auto"
        ref={bodyScrollRef}
        onScroll={e => {
          if (tableScrollingRef.current) return
          const left = (e.currentTarget as HTMLDivElement).scrollLeft
          tableScrollingRef.current = true
          if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left
          tableScrollingRef.current = false
        }}
      >
        <div ref={overlayRootRef} className="relative">
          <table
            className="border-separate border-spacing-0 table-fixed"
            style={{ width: Math.max(containerWidthPx || 0, visibleColumns.reduce((acc, c) => acc + widths[c.key], 0)) }}
          >
            {renderColGroup()}
            <tbody>
              {items.map(item => {
              const isSelected = item.id === selectedId
              const editKey = editing?.id === item.id ? editing.key : null
              const isComplete = item.statusId === "complete" || (statuses.find(s => s.id === item.statusId)?.name ?? "").toLowerCase() === "complete"
              const rowBaseStyle = { height: rowHeightPx }
              const statusMeta = statuses.find(s => s.id === item.statusId)
              const rowTint = statusMeta?.color ? mixWithWhite(statusMeta.color, 0.86) : ""
              return (
                <tr
                  key={item.id}
                  className={cn(
                    "group cursor-pointer",
                    isSelected ? "bg-zinc-50" : "odd:bg-white even:bg-zinc-50/40"
                  )}
                  draggable={sort === null}
                  onDragStart={e => {
                    if (sort !== null) return
                    draggedRowRef.current = item.id
                    suppressRowClickUntilRef.current = performance.now() + 800
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", item.id)
                  }}
                  onDragOver={e => {
                    if (sort !== null) return
                    if (!draggedRowRef.current) return
                    e.preventDefault()
                  }}
                  onDrop={e => {
                    if (sort !== null) return
                    e.preventDefault()
                    const source = draggedRowRef.current
                    draggedRowRef.current = null
                    if (!source || source === item.id) return
                    suppressRowClickUntilRef.current = performance.now() + 800
                    onMoveRow(source, item.id)
                  }}
                  onDragEnd={() => {
                    draggedRowRef.current = null
                    suppressRowClickUntilRef.current = performance.now() + 800
                  }}
                  onClick={() => {
                    if (performance.now() < suppressRowClickUntilRef.current) return
                    onSelect(item.id)
                  }}
                  style={rowBaseStyle}
                >
                  {visibleColumns.map((col, idx) => {
                    const isFirst = idx === 0
                    const isLast = idx === visibleColumns.length - 1
                    const stickyBg = isSelected ? "bg-zinc-50" : "bg-white group-even:bg-zinc-50/40"
                    const baseClass = cn(tdBase, isLast ? "border-r-0" : "", isFirst ? `sticky left-0 z-[2] ${stickyBg}` : "")
                    const styleBase: React.CSSProperties = {
                      width: widths[col.key],
                      minWidth: widths[col.key],
                      paddingTop: cellPadY,
                      paddingBottom: cellPadY,
                      fontSize: textSizePx,
                      backgroundColor: rowTint ? rowTint : undefined,
                      borderRightWidth: isLast ? 0 : lineWeightPx,
                      borderBottomWidth: lineWeightPx,
                      borderRightStyle: "solid",
                      borderBottomStyle: "solid",
                      borderColor: lineColor,
                    }

                    if (col.key === "t1No") {
                      return (
                        <td
                          key={col.key}
                          className={cn(baseClass, "text-zinc-900")}
                          style={styleBase}
                          onDoubleClick={e => {
                            e.stopPropagation()
                            beginEdit(item.id, "t1No", item.t1No)
                          }}
                        >
                          {editKey === "t1No" ? (
                            <input
                              autoFocus
                              value={editing?.value ?? ""}
                              onChange={e => setEditing(v => (v ? { ...v, value: e.target.value } : v))}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitEdit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                            />
                          ) : (
                            <div className="font-medium">{item.t1No}</div>
                          )}
                        </td>
                      )
                    }

                    if (col.key === "items") {
                      return (
                        <td
                          key={col.key}
                          className={cn(baseClass, "text-zinc-900")}
                          style={styleBase}
                          onDoubleClick={e => {
                            e.stopPropagation()
                            beginEdit(item.id, "items", item.items)
                          }}
                        >
                          {editKey === "items" ? (
                            <input
                              autoFocus
                              value={editing?.value ?? ""}
                              onChange={e => setEditing(v => (v ? { ...v, value: e.target.value } : v))}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitEdit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                            />
                          ) : (
                            <div className={cn("truncate", isComplete ? "text-zinc-400 line-through" : "")}>{item.items}</div>
                          )}
                        </td>
                      )
                    }

                    if (col.key === "srp") {
                      return (
                        <td
                          key={col.key}
                          className={cn(baseClass, "text-zinc-700")}
                          style={styleBase}
                          onDoubleClick={e => {
                            e.stopPropagation()
                            beginEdit(item.id, "srp", item.srp)
                          }}
                        >
                          {editKey === "srp" ? (
                            <input
                              autoFocus
                              value={editing?.value ?? ""}
                              onChange={e => setEditing(v => (v ? { ...v, value: e.target.value } : v))}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitEdit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                            />
                          ) : (
                            <div className="truncate">{item.srp}</div>
                          )}
                        </td>
                      )
                    }

                    if (col.key === "worksManager") {
                      return (
                        <td
                          key={col.key}
                          className={cn(baseClass, "text-zinc-700")}
                          style={styleBase}
                          onDoubleClick={e => {
                            e.stopPropagation()
                            beginEdit(item.id, "worksManager", item.worksManager)
                          }}
                        >
                          {editKey === "worksManager" ? (
                            <input
                              autoFocus
                              value={editing?.value ?? ""}
                              onChange={e => setEditing(v => (v ? { ...v, value: e.target.value } : v))}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitEdit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                            />
                          ) : (
                            <div className="truncate">{item.worksManager}</div>
                          )}
                        </td>
                      )
                    }

                    if (col.key === "designer") {
                      return (
                        <td
                          key={col.key}
                          className={cn(baseClass, "text-zinc-700")}
                          style={styleBase}
                          onDoubleClick={e => {
                            e.stopPropagation()
                            beginEdit(item.id, "designer", item.designer)
                          }}
                        >
                          {editKey === "designer" ? (
                            <input
                              autoFocus
                              value={editing?.value ?? ""}
                              onChange={e => setEditing(v => (v ? { ...v, value: e.target.value } : v))}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitEdit()
                                if (e.key === "Escape") cancelEdit()
                              }}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                            />
                          ) : (
                            <div className="truncate">{item.designer}</div>
                          )}
                        </td>
                      )
                    }

                    if (col.key === "schedule") {
                      const scheduleStyle: React.CSSProperties = {
                        ...styleBase,
                        paddingTop: schedulePadY,
                        paddingBottom: schedulePadY,
                      }
                      return (
                        <td key={col.key} className={baseClass} style={scheduleStyle}>
                          <div
                            className="relative overflow-hidden rounded-md border bg-white"
                            ref={el => {
                              scheduleCellRefs.current[item.id] = el
                            }}
                            style={{
                              height: scheduleLaneHeightPx,
                              borderWidth: lineWeightPx,
                              borderColor: lineColor,
                            }}
                          >
                            <div style={{ transform: `translateX(-${scheduleScrollLeft}px)` }}>
                              <ScheduleLane
                                segments={item.segments}
                                barTypes={barTypes}
                                rangeStart={rangeStart}
                                rangeEnd={rangeEnd}
                                pxPerDay={pxPerDay}
                                heightPx={scheduleLaneHeightPx}
                                onCommit={next => {
                                  const result = onUpdateItem(item.id, { segments: next })
                                  if (result.ok === false) setTableError(result.error)
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      )
                    }

                    if (col.key === "status") {
                      const meta = statuses.find(s => s.id === item.statusId)
                      return (
                        <td key={col.key} className={baseClass} style={styleBase}>
                          <div
                            className="flex items-center gap-2"
                            onPointerDown={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                          >
                            {meta?.iconDataUrl ? (
                              <img src={meta.iconDataUrl} alt="" className="h-10 w-10 rounded-lg border border-zinc-200 bg-white object-contain" />
                            ) : (
                              <span
                                className="h-4 w-4 rounded-full border border-zinc-200"
                                style={{ background: meta?.color ?? "#E4E4E7" }}
                              />
                            )}
                            <select
                              value={item.statusId}
                              onChange={e => {
                                e.stopPropagation()
                                onSetStatus(item.id, e.target.value)
                              }}
                              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
                            >
                              {statuses.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      )
                    }

                    return (
                      <td key={col.key} className={baseClass} style={styleBase}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            const ok = window.confirm("Remove this item?")
                            if (ok) onDelete(item.id)
                          }}
                          className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50"
                          aria-label="Delete item"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
              })}
            </tbody>
          </table>
          {progressLines.length ? (
            <svg className="absolute left-0 top-0 z-20 h-full w-full" preserveAspectRatio="none">
              {(() => {
                const rects = Object.values(scheduleRects)
                if (!rects.length) return null
                const left = Math.min(...rects.map(r => r.left))
                const right = Math.max(...rects.map(r => r.left + r.width))
                const top = Math.min(...rects.map(r => r.top))
                const bottom = Math.max(...rects.map(r => r.top + r.height))
                const clipId = `schedule-clip-${storageNamespace}`
                return (
                  <>
                    <defs>
                      <clipPath id={clipId}>
                        <rect x={left} y={top} width={Math.max(0, right - left)} height={Math.max(0, bottom - top)} />
                      </clipPath>
                    </defs>
                    <g clipPath={`url(#${clipId})`}>
                      {progressLines.map(line => {
                        const byItem = new Map(line.points.map(p => [p.itemId, p]))
                        const placed = items
                          .map(item => {
                            const rect = scheduleRects[item.id]
                            const point = byItem.get(item.id)
                            if (!rect || !point) return null
                            const t = parseIsoDate(point.date)
                            const dayX = Number.isFinite(t) ? ((t - rangeStart) / 86400000) * pxPerDay : 0
                            const x = rect.left + Math.max(0, Math.min(scheduleWidthPx, dayX)) - scheduleScrollLeft
                            const y = rect.top + clamp01(point.yRatio) * rect.height
                            return { itemId: item.id, rect, x, y, date: point.date }
                          })
                          .filter((x): x is { itemId: string; rect: { left: number; top: number; width: number; height: number }; x: number; y: number; date: string } => Boolean(x))

                        return (
                          <g key={line.id}>
                            {placed.map((p, idx) => {
                              const next = placed[idx + 1]
                              if (!next) return null
                              const yMid = (p.y + next.y) / 2
                              const d = `M ${p.x} ${p.y} L ${p.x} ${yMid} L ${next.x} ${yMid} L ${next.x} ${next.y}`
                              return (
                                <path
                                  key={`${p.itemId}-${next.itemId}`}
                                  d={d}
                                  fill="none"
                                  stroke={line.color}
                                  strokeWidth={line.weightPx}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ pointerEvents: "none" }}
                                />
                              )
                            })}
                            {placed.map(p => (
                              <g key={p.itemId}>
                                <line
                                  x1={p.x}
                                  y1={p.rect.top}
                                  x2={p.x}
                                  y2={p.rect.top + p.rect.height}
                                  stroke={line.color}
                                  strokeWidth={line.weightPx}
                                  strokeLinecap="round"
                                  style={{ pointerEvents: "none" }}
                                />
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={6}
                                  fill={line.color}
                                  stroke="#FFFFFF"
                                  strokeWidth={2}
                                  style={{ pointerEvents: "all" }}
                                  onPointerDown={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
                                    progressDragRef.current = { lineId: line.id, itemId: p.itemId, startX: e.clientX, startDayIndex: dayIndexFromIso(p.date) }
                                  }}
                                />
                              </g>
                            ))}
                          </g>
                        )
                      })}
                    </g>
                  </>
                )
              })()}
            </svg>
          ) : null}
        </div>
      </div>

      {filterOpenKey ? (
        <div
          ref={filterPopoverRef}
          className="z-[200] w-[340px] max-w-[92vw] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(0,0,0,.16)]"
          style={filterPopupStyle}
        >
          <div className="border-b border-zinc-200 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Filter</div>
            <div className="text-sm font-medium text-zinc-900">
              {filterOpenKey === "t1No"
                ? "T1 no."
                : filterOpenKey === "worksManager"
                  ? "Works Manager"
                  : filterOpenKey === "status"
                    ? "Status"
                    : filterOpenKey.charAt(0).toUpperCase() + filterOpenKey.slice(1)}
            </div>
          </div>
          <div className="border-b border-zinc-200 p-3">
            <input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              placeholder="Search"
            />
          </div>
          <div className="grid max-h-[52vh] gap-1 overflow-auto p-3">
            {filterOpenKey === "status"
              ? (filteredList as Array<{ id: string; name: string; color: string; iconDataUrl?: string }>).map(s => {
                  const checked = filters.statusIds.includes(s.id)
                  return (
                    <label key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFilterValue("status", s.id)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      {s.iconDataUrl ? (
                        <img src={s.iconDataUrl} alt="" className="h-6 w-6 rounded-md border border-zinc-200 bg-white object-contain" />
                      ) : (
                        <span className="h-3 w-3 rounded-full border border-zinc-200" style={{ background: s.color }} />
                      )}
                      <span className="truncate">{s.name || "(blank)"}</span>
                    </label>
                  )
                })
              : (filteredList as string[]).map(v => {
                  const checked =
                    filterOpenKey === "t1No"
                      ? filters.t1No.includes(v)
                      : filterOpenKey === "items"
                        ? filters.items.includes(v)
                        : filterOpenKey === "srp"
                          ? filters.srp.includes(v)
                          : filterOpenKey === "worksManager"
                            ? filters.worksManager.includes(v)
                            : filters.designer.includes(v)
                  return (
                    <label key={`${filterOpenKey}-${v}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFilterValue(filterOpenKey, v)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span className="truncate">{v || "(blank)"}</span>
                    </label>
                  )
                })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-3 py-3">
            <button
              type="button"
              onClick={() => clearFilterKey(filterOpenKey)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 transition hover:bg-zinc-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setFilterOpenKey(null)}
              className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
