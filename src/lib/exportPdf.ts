import type { BarType, ProgrammeItem, StatusType } from "@/types/programme"

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

export function exportProgrammeViewToPdf(params: {
  fileName: string
  title: string
  items: ProgrammeItem[]
  barTypes: BarType[]
  statuses: StatusType[]
}) {
  return import("pdf-lib").then(async ({ PDFDocument, StandardFonts, rgb }) => {
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const pageSize = { width: 841.89, height: 595.28 }
    const margin = 36
    const cellPad = 4

    const titleSize = 16
    const headerSize = 10
    const bodySize = 9
    const lineHeight = bodySize + 3

    const tableColumns: { label: string; width: number }[] = [
      { label: "T1 no.", width: 62 },
      { label: "Items", width: 170 },
      { label: "SRP", width: 70 },
      { label: "Works Manager", width: 112 },
      { label: "Designer", width: 96 },
      { label: "Status", width: 90 },
      { label: "Programme", width: pageSize.width - margin * 2 - (62 + 170 + 70 + 112 + 96 + 90) },
    ]
    const tableWidth = tableColumns.reduce((sum, c) => sum + c.width, 0)
    const xStarts = tableColumns.reduce<number[]>((xs, col, idx) => {
      const prev = idx === 0 ? margin : xs[idx - 1] + tableColumns[idx - 1].width
      xs.push(prev)
      return xs
    }, [])

    const statusMap = new Map(params.statuses.map(s => [s.id, s.name]))
    const barTypeMap = new Map(params.barTypes.map(b => [b.id, b.name]))

    const rows: string[][] = params.items.map(item => {
      const statusName = statusMap.get(item.statusId) ?? item.statusId
      const schedule = item.segments
        .map(seg => `${barTypeMap.get(seg.barTypeId) ?? seg.barTypeId} ${seg.startDate} - ${seg.endDate}`)
        .join("; ")
      return [
        item.t1No,
        item.items,
        item.srp,
        item.worksManager,
        item.designer,
        statusName,
        schedule,
      ].map(v => `${v ?? ""}`)
    })

    const wrapText = (text: string, maxWidth: number) => {
      const cleaned = text.replace(/\s+/g, " ").trim()
      if (!cleaned) return [""]

      const words = cleaned.split(" ")
      const lines: string[] = []
      let current = ""

      const pushCurrent = () => {
        if (current) lines.push(current)
        current = ""
      }

      const splitLongWord = (word: string) => {
        let part = ""
        for (const ch of word) {
          const next = part + ch
          if (font.widthOfTextAtSize(next, bodySize) <= maxWidth) {
            part = next
            continue
          }
          if (part) lines.push(part)
          part = ch
        }
        if (part) lines.push(part)
      }

      for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (font.widthOfTextAtSize(next, bodySize) <= maxWidth) {
          current = next
          continue
        }

        pushCurrent()

        if (font.widthOfTextAtSize(word, bodySize) <= maxWidth) {
          current = word
          continue
        }

        splitLongWord(word)
      }

      pushCurrent()
      return lines.length ? lines : [""]
    }

    const addPage = () => {
      const page = pdfDoc.addPage([pageSize.width, pageSize.height])
      let y = page.getHeight() - margin

      page.drawText(params.title, {
        x: margin,
        y: y - titleSize,
        size: titleSize,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      })
      y -= titleSize + 14

      const headerHeight = headerSize + 10
      page.drawRectangle({
        x: margin,
        y: y - headerHeight,
        width: tableWidth,
        height: headerHeight,
        color: rgb(0.96, 0.96, 0.96),
        borderColor: rgb(0.86, 0.86, 0.86),
        borderWidth: 0.5,
      })

      for (let i = 0; i < tableColumns.length; i += 1) {
        const x = xStarts[i]
        const w = tableColumns[i].width

        page.drawText(tableColumns[i].label, {
          x: x + cellPad,
          y: y - headerSize - 6,
          size: headerSize,
          font: fontBold,
          color: rgb(0.15, 0.15, 0.15),
        })

        page.drawLine({
          start: { x, y },
          end: { x, y: y - headerHeight },
          thickness: 0.5,
          color: rgb(0.86, 0.86, 0.86),
        })
        page.drawLine({
          start: { x: x + w, y },
          end: { x: x + w, y: y - headerHeight },
          thickness: 0.5,
          color: rgb(0.86, 0.86, 0.86),
        })
      }

      y -= headerHeight
      page.drawLine({
        start: { x: margin, y },
        end: { x: margin + tableWidth, y },
        thickness: 0.5,
        color: rgb(0.86, 0.86, 0.86),
      })

      return { page, y }
    }

    let { page, y } = addPage()

    for (const row of rows) {
      const cellLines = row.map((text, idx) => wrapText(text, tableColumns[idx].width - cellPad * 2))
      const maxLines = Math.max(...cellLines.map(ls => ls.length), 1)
      const rowHeight = maxLines * lineHeight + cellPad * 2

      if (y - rowHeight < margin) {
        ;({ page, y } = addPage())
      }

      const yTop = y
      page.drawLine({
        start: { x: margin, y: yTop },
        end: { x: margin + tableWidth, y: yTop },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9),
      })

      for (let i = 0; i < tableColumns.length; i += 1) {
        const x = xStarts[i]
        const w = tableColumns[i].width

        page.drawLine({
          start: { x, y: yTop },
          end: { x, y: yTop - rowHeight },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.9),
        })
        page.drawLine({
          start: { x: x + w, y: yTop },
          end: { x: x + w, y: yTop - rowHeight },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.9),
        })

        const lines = cellLines[i]
        for (let li = 0; li < lines.length; li += 1) {
          page.drawText(lines[li], {
            x: x + cellPad,
            y: yTop - cellPad - bodySize - li * lineHeight,
            size: bodySize,
            font,
            color: rgb(0.1, 0.1, 0.1),
          })
        }
      }

      y -= rowHeight
      page.drawLine({
        start: { x: margin, y },
        end: { x: margin + tableWidth, y },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9),
      })
    }

    const bytes = await pdfDoc.save()
    const blob = new Blob([bytes], { type: "application/pdf" })
    downloadBlob(blob, params.fileName)
  })
}

