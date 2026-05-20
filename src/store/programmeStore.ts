import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { BarType, ProgrammeItem, ProgrammeItemInput, ProgrammeTab, ProgressLine, ProgressPoint, ScheduleSegment, StatusType } from "@/types/programme"

type ProgrammeState = {
  tabs: ProgrammeTab[]
  activeTabId: string
  selectedId: string | null
  selectTab: (id: string) => void
  addTab: (name: string) => void
  renameTab: (id: string, name: string) => void
  removeTab: (id: string) => void
  select: (id: string | null) => void
  addItem: (input: ProgrammeItemInput) => ProgrammeItem | { error: string }
  updateItem: (id: string, input: ProgrammeItemInput) => ProgrammeItem | { error: string }
  setStatus: (id: string, statusId: string) => void
  moveItem: (sourceId: string, targetId: string) => void
  removeItem: (id: string) => void
  upsertBarType: (barType: BarType) => void
  removeBarType: (id: string) => void
  upsertStatus: (status: StatusType) => void
  removeStatus: (id: string) => void
  addProgressLine: (input?: Partial<Pick<ProgressLine, "name" | "color" | "weightPx">>) => void
  updateProgressLine: (id: string, patch: Partial<Pick<ProgressLine, "name" | "color" | "weightPx">>) => void
  removeProgressLine: (id: string) => void
  setProgressPoint: (lineId: string, itemId: string, patch: Partial<Pick<ProgressPoint, "date" | "yRatio">>) => void
}

function nowIso() {
  return new Date().toISOString()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const defaultBarTypes: BarType[] = [{ id: "design", name: "Design", color: "#00E5A8" }]
const defaultStatuses: StatusType[] = [
  { id: "active", name: "Active", color: "#0EA5E9" },
  { id: "complete", name: "Complete", color: "#22C55E" },
]

function makeDefaultTab(id: string, name: string): ProgrammeTab {
  return {
    id,
    name,
    items: [],
    barTypes: defaultBarTypes.slice(),
    statuses: defaultStatuses.slice(),
    srpOptions: [],
    worksManagerOptions: [],
    designerOptions: [],
    progressLines: [],
  }
}

function normalizeT1No(value: string) {
  return value.trim().toLowerCase()
}

function hasT1NoCollision(items: ProgrammeItem[], t1No: string, exceptId?: string) {
  const normalized = normalizeT1No(t1No)
  if (!normalized) return false
  return items.some(item => normalizeT1No(item.t1No) === normalized && item.id !== exceptId)
}

function validateSegments(segments: ScheduleSegment[]) {
  if (!segments.length) return null
  for (const seg of segments) {
    if (!seg.startDate || !seg.endDate) return "Each schedule segment must have start and end dates."
    if (seg.endDate < seg.startDate) return "A schedule segment end date must be on/after its start date."
    if (!seg.barTypeId) return "Each schedule segment must have a bar type."
  }
  return null
}

function addUnique(list: string[], value: string) {
  const v = value.trim()
  if (!v) return list
  if (list.some(x => x.toLowerCase() === v.toLowerCase())) return list
  return [v, ...list].slice(0, 30)
}

function derivePeopleOptions(items: ProgrammeItem[]) {
  let srpOptions: string[] = []
  let worksManagerOptions: string[] = []
  let designerOptions: string[] = []

  for (const item of items) {
    srpOptions = addUnique(srpOptions, item.srp)
    worksManagerOptions = addUnique(worksManagerOptions, item.worksManager)
    designerOptions = addUnique(designerOptions, item.designer)
  }

  return { srpOptions, worksManagerOptions, designerOptions }
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function normalizeProgressLines(lines: ProgressLine[], items: ProgrammeItem[]) {
  const itemIds = new Set(items.map(i => i.id))
  return lines
    .filter(l => typeof l.id === "string" && l.id.trim().length > 0)
    .map(line => {
      const points = Array.isArray(line.points) ? line.points : []
      const cleaned = points
        .filter(p => p && typeof p.itemId === "string" && itemIds.has(p.itemId))
        .map(p => ({
          itemId: p.itemId,
          date: typeof p.date === "string" ? p.date : todayIso(),
          yRatio: clamp(typeof p.yRatio === "number" ? p.yRatio : 0.5, 0, 1),
        }))
      return {
        id: line.id,
        name: typeof line.name === "string" && line.name.trim() ? line.name : "Progress",
        color: typeof line.color === "string" && line.color.trim() ? line.color : "#EF4444",
        weightPx: clamp(typeof line.weightPx === "number" ? line.weightPx : 2, 1, 12),
        points: cleaned,
      } satisfies ProgressLine
    })
}

export const useProgrammeStore = create<ProgrammeState>()(
  persist(
    (set, get) => ({
      tabs: [makeDefaultTab("default", "Table 1")],
      activeTabId: "default",
      selectedId: null,
      selectTab: id =>
        set(state => {
          if (!state.tabs.some(t => t.id === id)) return state
          return { activeTabId: id, selectedId: null }
        }),
      addTab: name =>
        set(state => {
          const trimmed = name.trim()
          const tabName = trimmed || `Table ${state.tabs.length + 1}`
          const id = `tab-${makeId()}`
          const tab = makeDefaultTab(id, tabName)
          return { tabs: [...state.tabs, tab], activeTabId: id, selectedId: null }
        }),
      renameTab: (id, name) =>
        set(state => {
          const trimmed = name.trim()
          if (!trimmed) return state
          const idx = state.tabs.findIndex(t => t.id === id)
          if (idx < 0) return state
          const nextTabs = state.tabs.slice()
          nextTabs[idx] = { ...nextTabs[idx], name: trimmed }
          return { tabs: nextTabs }
        }),
      removeTab: id =>
        set(state => {
          if (state.tabs.length <= 1) return state
          const nextTabs = state.tabs.filter(t => t.id !== id)
          if (!nextTabs.length) return state
          const nextActive = state.activeTabId === id ? nextTabs[0]!.id : state.activeTabId
          return { tabs: nextTabs, activeTabId: nextActive, selectedId: null }
        }),
      select: id => set({ selectedId: id }),
      addItem: input => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (!tab) return { error: "Tab not found." }
        const items = tab.items
        if (hasT1NoCollision(items, input.t1No)) return { error: "T1 no. must be unique." }
        const segError = validateSegments(input.segments)
        if (segError) return { error: segError }
        const statusId = input.statusId || tab.statuses[0]?.id || "active"
        const item: ProgrammeItem = {
          id: makeId(),
          ...input,
          statusId,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        const nextItems = [item, ...items]
        const derived = derivePeopleOptions(nextItems)
        const point: ProgressPoint = { itemId: item.id, date: todayIso(), yRatio: 0.5 }

        set(s => {
          const tabIdx = s.tabs.findIndex(t => t.id === s.activeTabId)
          if (tabIdx < 0) return s
          const currentTab = s.tabs[tabIdx]!
          const nextLines = currentTab.progressLines.map(l =>
            l.points.some(p => p.itemId === item.id) ? l : { ...l, points: [...l.points, point] }
          )
          const nextTab: ProgrammeTab = { ...currentTab, items: nextItems, ...derived, progressLines: nextLines }
          const nextTabs = s.tabs.slice()
          nextTabs[tabIdx] = nextTab
          return { tabs: nextTabs }
        })
        return item
      },
      updateItem: (id, input) => {
        const state = get()
        const tab = state.tabs.find(t => t.id === state.activeTabId)
        if (!tab) return { error: "Tab not found." }
        const items = tab.items
        if (hasT1NoCollision(items, input.t1No, id)) return { error: "T1 no. must be unique." }
        const segError = validateSegments(input.segments)
        if (segError) return { error: segError }
        const index = items.findIndex(i => i.id === id)
        if (index < 0) return { error: "Item not found." }
        const current = items[index]
        const statusId = input.statusId || tab.statuses[0]?.id || "active"
        const next: ProgrammeItem = {
          ...current,
          ...input,
          statusId,
          updatedAt: nowIso(),
        }
        const copy = items.slice()
        copy[index] = next
        const derived = derivePeopleOptions(copy)
        set(s => {
          const tabIdx = s.tabs.findIndex(t => t.id === s.activeTabId)
          if (tabIdx < 0) return s
          const nextTabs = s.tabs.slice()
          nextTabs[tabIdx] = { ...nextTabs[tabIdx]!, items: copy, ...derived }
          return { tabs: nextTabs }
        })
        return next
      },
      setStatus: (id, statusId) => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const nextItems = tab.items.map(item => (item.id === id ? { ...item, statusId, updatedAt: nowIso() } : item))
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, items: nextItems }
          return { tabs: nextTabs }
        })
      },
      moveItem: (sourceId, targetId) => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const items = tab.items.slice()
          const from = items.findIndex(i => i.id === sourceId)
          const to = items.findIndex(i => i.id === targetId)
          if (from < 0 || to < 0 || from === to) return state
          const [moved] = items.splice(from, 1)
          const nextIndex = from < to ? to - 1 : to
          items.splice(nextIndex, 0, moved)
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, items }
          return { tabs: nextTabs }
        })
      },
      removeItem: id => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const nextItems = tab.items.filter(i => i.id !== id)
          const derived = derivePeopleOptions(nextItems)
          const nextLines = tab.progressLines.map(l => ({ ...l, points: l.points.filter(p => p.itemId !== id) }))
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, items: nextItems, ...derived, progressLines: nextLines }
          return { tabs: nextTabs, selectedId: state.selectedId === id ? null : state.selectedId }
        })
      },
      upsertBarType: barType => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const next = tab.barTypes.slice()
          const idx = next.findIndex(b => b.id === barType.id)
          if (idx >= 0) next[idx] = barType
          else next.push(barType)
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, barTypes: next }
          return { tabs: nextTabs }
        })
      },
      removeBarType: id => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const remaining = tab.barTypes.filter(b => b.id !== id)
          const fallback = remaining[0]?.id ?? "design"
          const nextBarTypes = remaining.length ? remaining : defaultBarTypes.slice()
          const nextItems = tab.items.map(item => ({
            ...item,
            segments: item.segments.map(seg => ({
              ...seg,
              barTypeId: seg.barTypeId === id ? fallback : seg.barTypeId,
            })),
          }))
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, barTypes: nextBarTypes, items: nextItems }
          return { tabs: nextTabs }
        })
      },
      upsertStatus: status => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const next = tab.statuses.slice()
          const idx = next.findIndex(s => s.id === status.id)
          if (idx >= 0) next[idx] = status
          else next.push(status)
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, statuses: next }
          return { tabs: nextTabs }
        })
      },
      removeStatus: id => {
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const remaining = tab.statuses.filter(s => s.id !== id)
          const fallback = remaining[0]?.id ?? "active"
          const ensured = remaining.length
            ? remaining
            : defaultStatuses.slice()
          const nextItems = tab.items.map(item => ({ ...item, statusId: item.statusId === id ? fallback : item.statusId }))
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, statuses: ensured, items: nextItems }
          return { tabs: nextTabs }
        })
      },
      addProgressLine: input =>
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const baseName = input?.name?.trim() || `Progress ${tab.progressLines.length + 1}`
          const color = input?.color?.trim() || "#EF4444"
          const weightPx = clamp(input?.weightPx ?? 2, 1, 12)
          const id = `pl-${makeId()}`
          const points: ProgressPoint[] = tab.items.map(item => ({ itemId: item.id, date: todayIso(), yRatio: 0.5 }))
          const line: ProgressLine = { id, name: baseName, color, weightPx, points }
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, progressLines: [...tab.progressLines, line] }
          return { tabs: nextTabs }
        }),
      updateProgressLine: (id, patch) =>
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const idx = tab.progressLines.findIndex(l => l.id === id)
          if (idx < 0) return state
          const nextLines = tab.progressLines.slice()
          const current = nextLines[idx]!
          nextLines[idx] = {
            ...current,
            name: typeof patch.name === "string" ? patch.name : current.name,
            color: typeof patch.color === "string" ? patch.color : current.color,
            weightPx: typeof patch.weightPx === "number" ? clamp(patch.weightPx, 1, 12) : current.weightPx,
          }
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, progressLines: nextLines }
          return { tabs: nextTabs }
        }),
      removeProgressLine: id =>
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const nextLines = tab.progressLines.filter(l => l.id !== id)
          if (nextLines.length === tab.progressLines.length) return state
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, progressLines: nextLines }
          return { tabs: nextTabs }
        }),
      setProgressPoint: (lineId, itemId, patch) =>
        set(state => {
          const tabIdx = state.tabs.findIndex(t => t.id === state.activeTabId)
          if (tabIdx < 0) return state
          const tab = state.tabs[tabIdx]!
          const lineIdx = tab.progressLines.findIndex(l => l.id === lineId)
          if (lineIdx < 0) return state
          const line = tab.progressLines[lineIdx]!
          const pointIdx = line.points.findIndex(p => p.itemId === itemId)
          const nextPoint: ProgressPoint = {
            itemId,
            date: typeof patch.date === "string" ? patch.date : line.points[pointIdx]?.date ?? todayIso(),
            yRatio: clamp(typeof patch.yRatio === "number" ? patch.yRatio : line.points[pointIdx]?.yRatio ?? 0.5, 0, 1),
          }
          const nextPoints =
            pointIdx >= 0 ? line.points.map(p => (p.itemId === itemId ? nextPoint : p)) : [...line.points, nextPoint]
          const nextLines = tab.progressLines.slice()
          nextLines[lineIdx] = { ...line, points: nextPoints }
          const nextTabs = state.tabs.slice()
          nextTabs[tabIdx] = { ...tab, progressLines: nextLines }
          return { tabs: nextTabs }
        }),
    }),
    {
      name: "designer_resources_programme_v1",
      version: 7,
      partialize: state => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
      migrate: persistedState => {
        const state =
          persistedState && typeof persistedState === "object" ? (persistedState as Record<string, unknown>) : ({} as Record<string, unknown>)

        function normalizeTab(rawTab: unknown): ProgrammeTab | null {
          if (!rawTab || typeof rawTab !== "object") return null
          const tab = rawTab as Record<string, unknown>
          const id = typeof tab.id === "string" && tab.id.trim() ? tab.id : `tab-${makeId()}`
          const name = typeof tab.name === "string" && tab.name.trim() ? tab.name : "Table"

          const rawBarTypes = (Array.isArray(tab.barTypes) ? tab.barTypes : []) as Array<Partial<BarType>>
          const baseBarTypes: BarType[] = rawBarTypes
            .filter(b => typeof b.id === "string" && typeof b.name === "string" && typeof b.color === "string")
            .map(b => ({ id: b.id as string, name: b.name as string, color: b.color as string }))

          const colorToTypeId = new Map<string, string>()
          const ensuredBarTypes = baseBarTypes.length ? baseBarTypes.slice() : defaultBarTypes.slice()
          for (const bt of ensuredBarTypes) colorToTypeId.set(bt.color.toLowerCase(), bt.id)

          const statusesRaw = (Array.isArray(tab.statuses) ? tab.statuses : []) as Array<Partial<StatusType>>
          const baseStatuses: StatusType[] = statusesRaw
            .filter(s => typeof s.id === "string" && typeof s.name === "string" && typeof s.color === "string")
            .map(s => ({
              id: s.id as string,
              name: s.name as string,
              color: s.color as string,
              iconDataUrl: typeof s.iconDataUrl === "string" ? s.iconDataUrl : undefined,
            }))
          const ensuredStatuses = baseStatuses.length ? baseStatuses : defaultStatuses.slice()

          const rawItems = (Array.isArray(tab.items) ? tab.items : []) as Array<Record<string, unknown>>
          const items = rawItems.map(raw => {
            const t1Raw = raw.t1No
            const t1No = typeof t1Raw === "string" ? t1Raw : typeof t1Raw === "number" ? String(t1Raw) : ""

            const completed = typeof raw.completed === "boolean" ? raw.completed : false
            const statusIdRaw = raw.statusId
            const id = typeof raw.id === "string" ? raw.id : makeId()
            const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso()
            const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso()

            const segmentsRaw = raw.segments as unknown
            let segments: ScheduleSegment[] = []
            if (Array.isArray(segmentsRaw)) {
              segments = segmentsRaw
                .map(seg => seg as Partial<ScheduleSegment>)
                .filter(seg => typeof seg.id === "string")
                .map(seg => ({
                  id: seg.id as string,
                  barTypeId: typeof seg.barTypeId === "string" ? seg.barTypeId : ensuredBarTypes[0]!.id,
                  startDate: typeof seg.startDate === "string" ? seg.startDate : todayIso(),
                  endDate: typeof seg.endDate === "string" ? seg.endDate : todayIso(),
                }))
            } else {
              const startDate = typeof raw.startDate === "string" ? raw.startDate : todayIso()
              const endDate = typeof raw.targetDate === "string" ? raw.targetDate : startDate
              const barColor = typeof raw.barColor === "string" ? raw.barColor : ensuredBarTypes[0]!.color
              const key = barColor.toLowerCase()
              let barTypeId = colorToTypeId.get(key)
              if (!barTypeId) {
                barTypeId = `bar-${makeId()}`
                ensuredBarTypes.push({ id: barTypeId, name: `Bar ${ensuredBarTypes.length + 1}`, color: barColor })
                colorToTypeId.set(key, barTypeId)
              }
              segments = [{ id: makeId(), barTypeId, startDate, endDate }]
            }

            const fixedSegments = segments.map(seg => ({
              ...seg,
              barTypeId: ensuredBarTypes.some(b => b.id === seg.barTypeId) ? seg.barTypeId : ensuredBarTypes[0]!.id,
            }))

            let statusId = typeof statusIdRaw === "string" ? statusIdRaw : completed ? "complete" : "active"
            if (!ensuredStatuses.some(s => s.id === statusId)) statusId = ensuredStatuses[0]!.id

            return {
              id,
              t1No,
              items: typeof raw.items === "string" ? raw.items : "",
              srp: typeof raw.srp === "string" ? raw.srp : "",
              worksManager: typeof raw.worksManager === "string" ? raw.worksManager : "",
              designer: typeof raw.designer === "string" ? raw.designer : "",
              segments: fixedSegments,
              statusId,
              createdAt,
              updatedAt,
            } satisfies ProgrammeItem
          })

          const derived = derivePeopleOptions(items)
          const rawLines = (Array.isArray(tab.progressLines) ? tab.progressLines : []) as unknown as ProgressLine[]
          const lines = normalizeProgressLines(rawLines, items)

          return {
            id,
            name,
            items,
            barTypes: ensuredBarTypes,
            statuses: ensuredStatuses,
            srpOptions: derived.srpOptions,
            worksManagerOptions: derived.worksManagerOptions,
            designerOptions: derived.designerOptions,
            progressLines: lines,
          }
        }

        const tabsRaw = state.tabs
        if (Array.isArray(tabsRaw)) {
          const tabs = tabsRaw.map(normalizeTab).filter((t): t is ProgrammeTab => Boolean(t))
          const ensured = tabs.length ? tabs : [makeDefaultTab("default", "Table 1")]
          const activeTabId =
            typeof state.activeTabId === "string" && ensured.some(t => t.id === state.activeTabId) ? state.activeTabId : ensured[0]!.id
          return { tabs: ensured, activeTabId }
        }

        const legacyTab = normalizeTab({
          id: "default",
          name: "Table 1",
          items: state?.items,
          barTypes: state?.barTypes,
          statuses: state?.statuses,
        })

        return { tabs: [legacyTab ?? makeDefaultTab("default", "Table 1")], activeTabId: "default" }
      },
    }
  )
)
