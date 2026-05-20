export type BarType = {
  id: string
  name: string
  color: string
}

export type StatusType = {
  id: string
  name: string
  color: string
  iconDataUrl?: string
}

export type ScheduleSegment = {
  id: string
  barTypeId: string
  startDate: string
  endDate: string
}

export type ProgressPoint = {
  itemId: string
  date: string
  yRatio: number
}

export type ProgressLine = {
  id: string
  name: string
  color: string
  weightPx: number
  points: ProgressPoint[]
}

export type ProgrammeItem = {
  id: string
  t1No: string
  items: string
  srp: string
  worksManager: string
  designer: string
  segments: ScheduleSegment[]
  statusId: string
  createdAt: string
  updatedAt: string
}

export type ProgrammeItemInput = Omit<ProgrammeItem, "id" | "createdAt" | "updatedAt">

export type SortKey = "t1No" | "items" | "srp" | "worksManager" | "designer"

export type SortDirection = "asc" | "desc"

export type ProgrammeTab = {
  id: string
  name: string
  items: ProgrammeItem[]
  barTypes: BarType[]
  statuses: StatusType[]
  srpOptions: string[]
  worksManagerOptions: string[]
  designerOptions: string[]
  progressLines: ProgressLine[]
}
