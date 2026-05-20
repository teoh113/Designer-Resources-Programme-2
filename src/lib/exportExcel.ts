import type { BarType, ProgrammeItem, StatusType } from "@/types/programme"

function sanitizeSheetName(name: string) {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim()
  return cleaned.length ? cleaned.slice(0, 31) : "Sheet1"
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportProgrammeViewToExcel(params: {
  fileName: string
  sheetName: string
  items: ProgrammeItem[]
  barTypes: BarType[]
  statuses: StatusType[]
}) {
  return import("xlsx").then(XLSX => {
  const statusMap = new Map(params.statuses.map(s => [s.id, s.name]))
  const barTypeMap = new Map(params.barTypes.map(b => [b.id, b.name]))

  const rows = params.items.map(item => {
    const statusName = statusMap.get(item.statusId) ?? item.statusId
    const schedule = item.segments
      .map(seg => `${barTypeMap.get(seg.barTypeId) ?? seg.barTypeId} ${seg.startDate} - ${seg.endDate}`)
      .join("; ")
    return {
      "T1 no.": item.t1No,
      Items: item.items,
      SRP: item.srp,
      "Works Manager": item.worksManager,
      Designer: item.designer,
      Status: statusName,
      Programme: schedule,
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(params.sheetName))

  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  downloadBlob(blob, params.fileName)
  })
}
