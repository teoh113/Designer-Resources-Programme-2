export function parseIsoDate(value: string): number {
  const date = new Date(value)
  const time = date.getTime()
  return Number.isFinite(time) ? time : NaN
}

export function formatIsoDate(value: string): string {
  const time = parseIsoDate(value)
  if (!Number.isFinite(time)) return ""
  const date = new Date(time)
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })
}

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
