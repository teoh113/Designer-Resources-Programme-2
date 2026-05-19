import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { BarType, ProgrammeItem, ProgrammeItemInput, ScheduleSegment, StatusType } from "@/types/programme"

type ProgrammeState = {
  items: ProgrammeItem[]
  barTypes: BarType[]
  statuses: StatusType[]
  srpOptions: string[]
  worksManagerOptions: string[]
  designerOptions: string[]
  selectedId: string | null
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
}

function nowIso() {
  return new Date().toISOString()
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

export const useProgrammeStore = create<ProgrammeState>()(
  persist(
    (set, get) => ({
      items: [],
      barTypes: [{ id: "design", name: "Design", color: "#00E5A8" }],
      statuses: [
        { id: "active", name: "Active", color: "#0EA5E9" },
        { id: "complete", name: "Complete", color: "#22C55E" },
      ],
      srpOptions: [],
      worksManagerOptions: [],
      designerOptions: [],
      selectedId: null,
      select: id => set({ selectedId: id }),
      addItem: input => {
        const items = get().items
        if (hasT1NoCollision(items, input.t1No)) return { error: "T1 no. must be unique." }
        const segError = validateSegments(input.segments)
        if (segError) return { error: segError }
        const statusId = input.statusId || get().statuses[0]?.id || "active"
        const item: ProgrammeItem = {
          id: makeId(),
          ...input,
          statusId,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        const nextItems = [item, ...items]
        const derived = derivePeopleOptions(nextItems)
        set({ items: nextItems, ...derived })
        return item
      },
      updateItem: (id, input) => {
        const items = get().items
        if (hasT1NoCollision(items, input.t1No, id)) return { error: "T1 no. must be unique." }
        const segError = validateSegments(input.segments)
        if (segError) return { error: segError }
        const index = items.findIndex(i => i.id === id)
        if (index < 0) return { error: "Item not found." }
        const current = items[index]
        const statusId = input.statusId || get().statuses[0]?.id || "active"
        const next: ProgrammeItem = {
          ...current,
          ...input,
          statusId,
          updatedAt: nowIso(),
        }
        const copy = items.slice()
        copy[index] = next
        const derived = derivePeopleOptions(copy)
        set({ items: copy, ...derived })
        return next
      },
      setStatus: (id, statusId) => {
        set(state => ({
          items: state.items.map(item => (item.id === id ? { ...item, statusId, updatedAt: nowIso() } : item)),
        }))
      },
      moveItem: (sourceId, targetId) => {
        set(state => {
          const items = state.items.slice()
          const from = items.findIndex(i => i.id === sourceId)
          const to = items.findIndex(i => i.id === targetId)
          if (from < 0 || to < 0 || from === to) return state
          const [moved] = items.splice(from, 1)
          const nextIndex = from < to ? to - 1 : to
          items.splice(nextIndex, 0, moved)
          return { items }
        })
      },
      removeItem: id => {
        set(state => {
          const nextItems = state.items.filter(i => i.id !== id)
          const derived = derivePeopleOptions(nextItems)
          return { items: nextItems, selectedId: state.selectedId === id ? null : state.selectedId, ...derived }
        })
      },
      upsertBarType: barType => {
        set(state => {
          const next = state.barTypes.slice()
          const idx = next.findIndex(b => b.id === barType.id)
          if (idx >= 0) next[idx] = barType
          else next.push(barType)
          return { barTypes: next }
        })
      },
      removeBarType: id => {
        set(state => {
          const remaining = state.barTypes.filter(b => b.id !== id)
          const fallback = remaining[0]?.id ?? "design"
          return {
            barTypes: remaining.length ? remaining : [{ id: "design", name: "Design", color: "#00E5A8" }],
            items: state.items.map(item => ({
              ...item,
              segments: item.segments.map(seg => ({
                ...seg,
                barTypeId: seg.barTypeId === id ? fallback : seg.barTypeId,
              })),
            })),
          }
        })
      },
      upsertStatus: status => {
        set(state => {
          const next = state.statuses.slice()
          const idx = next.findIndex(s => s.id === status.id)
          if (idx >= 0) next[idx] = status
          else next.push(status)
          return { statuses: next }
        })
      },
      removeStatus: id => {
        set(state => {
          const remaining = state.statuses.filter(s => s.id !== id)
          const fallback = remaining[0]?.id ?? "active"
          const ensured = remaining.length
            ? remaining
            : [
                { id: "active", name: "Active", color: "#0EA5E9" },
                { id: "complete", name: "Complete", color: "#22C55E" },
              ]
          return {
            statuses: ensured,
            items: state.items.map(item => ({ ...item, statusId: item.statusId === id ? fallback : item.statusId })),
          }
        })
      },
    }),
    {
      name: "designer_resources_programme_v1",
      version: 6,
      partialize: state => ({
        items: state.items,
        barTypes: state.barTypes,
        statuses: state.statuses,
        srpOptions: state.srpOptions,
        worksManagerOptions: state.worksManagerOptions,
        designerOptions: state.designerOptions,
      }),
      migrate: persistedState => {
        const state =
          persistedState as
            | {
                items?: Array<Record<string, unknown>>
                barTypes?: Array<Record<string, unknown>>
                statuses?: Array<Record<string, unknown>>
                srpOptions?: string[]
                worksManagerOptions?: string[]
                designerOptions?: string[]
              }
            | undefined

        const rawBarTypes = (state?.barTypes ?? []) as Array<Partial<BarType>>
        const baseBarTypes: BarType[] = rawBarTypes
          .filter(b => typeof b.id === "string" && typeof b.name === "string" && typeof b.color === "string")
          .map(b => ({ id: b.id as string, name: b.name as string, color: b.color as string }))

        const colorToTypeId = new Map<string, string>()
        const ensuredBarTypes = baseBarTypes.length ? baseBarTypes.slice() : [{ id: "design", name: "Design", color: "#00E5A8" }]
        for (const bt of ensuredBarTypes) colorToTypeId.set(bt.color.toLowerCase(), bt.id)

        const items = ((state?.items ?? []) as Array<Record<string, unknown>>).map(raw => {
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
                barTypeId: typeof seg.barTypeId === "string" ? seg.barTypeId : "design",
                startDate: typeof seg.startDate === "string" ? seg.startDate : new Date().toISOString().slice(0, 10),
                endDate: typeof seg.endDate === "string" ? seg.endDate : new Date().toISOString().slice(0, 10),
              }))
          } else {
            const startDate = typeof raw.startDate === "string" ? raw.startDate : new Date().toISOString().slice(0, 10)
            const endDate = typeof raw.targetDate === "string" ? raw.targetDate : startDate
            const barColor = typeof raw.barColor === "string" ? raw.barColor : "#00E5A8"
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
            barTypeId: ensuredBarTypes.some(b => b.id === seg.barTypeId) ? seg.barTypeId : ensuredBarTypes[0].id,
          }))

          const statusesRaw = (state?.statuses ?? []) as Array<Partial<StatusType>>
          const baseStatuses: StatusType[] = statusesRaw
            .filter(s => typeof s.id === "string" && typeof s.name === "string" && typeof s.color === "string")
            .map(s => ({
              id: s.id as string,
              name: s.name as string,
              color: s.color as string,
              iconDataUrl: typeof s.iconDataUrl === "string" ? s.iconDataUrl : undefined,
            }))
          const ensuredStatuses =
            baseStatuses.length
              ? baseStatuses
              : [
                  { id: "active", name: "Active", color: "#0EA5E9" },
                  { id: "complete", name: "Complete", color: "#22C55E" },
                ]

          let statusId =
            typeof statusIdRaw === "string"
              ? statusIdRaw
              : completed
                ? "complete"
                : "active"
          if (!ensuredStatuses.some(s => s.id === statusId)) statusId = ensuredStatuses[0].id

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

        const srpOptions = Array.isArray(state?.srpOptions) ? state?.srpOptions : []
        const worksManagerOptions = Array.isArray(state?.worksManagerOptions) ? state?.worksManagerOptions : []
        const designerOptions = Array.isArray(state?.designerOptions) ? state?.designerOptions : []

        const derived = items.reduce(
          (acc, item) => {
            acc.srpOptions = addUnique(acc.srpOptions, item.srp)
            acc.worksManagerOptions = addUnique(acc.worksManagerOptions, item.worksManager)
            acc.designerOptions = addUnique(acc.designerOptions, item.designer)
            return acc
          },
          { srpOptions: srpOptions.slice(), worksManagerOptions: worksManagerOptions.slice(), designerOptions: designerOptions.slice() }
        )

        const statusesRaw = (state?.statuses ?? []) as Array<Partial<StatusType>>
        const baseStatuses: StatusType[] = statusesRaw
          .filter(s => typeof s.id === "string" && typeof s.name === "string" && typeof s.color === "string")
          .map(s => ({
            id: s.id as string,
            name: s.name as string,
            color: s.color as string,
            iconDataUrl: typeof s.iconDataUrl === "string" ? s.iconDataUrl : undefined,
          }))
        const statuses =
          baseStatuses.length
            ? baseStatuses
            : [
                { id: "active", name: "Active", color: "#0EA5E9" },
                { id: "complete", name: "Complete", color: "#22C55E" },
              ]

        return { items, barTypes: ensuredBarTypes, statuses, ...derived }
      },
    }
  )
)
