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

export async function exportProgrammeViewToPdf(params: { fileName: string; element: HTMLElement }) {
  if (document.fonts?.ready) await document.fonts.ready

  const [{ PDFDocument }, html2canvasModule] = await Promise.all([import("pdf-lib"), import("html2canvas")])
  const html2canvas = html2canvasModule.default

  const pageWidth = 841.89
  const pageHeight = 595.28
  const margin = 24
  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2

  const targetDpi = 300
  const pdfDpi = 72
  const rect = params.element.getBoundingClientRect()
  const elementWidth = Math.max(1, Math.round(rect.width))
  const elementHeight = Math.max(1, Math.round(Math.max(rect.height, params.element.scrollHeight)))
  const desiredScale = (contentWidth * targetDpi) / (pdfDpi * elementWidth)
  const maxCanvasWidth = 8192
  const maxCanvasHeight = 16384
  const scale = Math.max(
    1,
    Math.min(desiredScale, maxCanvasWidth / elementWidth, maxCanvasHeight / elementHeight),
  )

  const canvas = await html2canvas(params.element, {
    backgroundColor: "#ffffff",
    scale,
    useCORS: true,
  })

  const pngDataUrl = canvas.toDataURL("image/png")
  const pdfDoc = await PDFDocument.create()
  const image = await pdfDoc.embedPng(pngDataUrl)

  const fitScale = Math.min(contentWidth / image.width, 1)
  const scaledWidth = image.width * fitScale
  const scaledHeight = image.height * fitScale
  const pageCount = Math.max(1, Math.ceil(scaledHeight / contentHeight))

  for (let i = 0; i < pageCount; i += 1) {
    const page = pdfDoc.addPage([pageWidth, pageHeight])
    const x = margin + (contentWidth - scaledWidth) / 2
    const y = pageHeight - margin - scaledHeight + i * contentHeight
    page.drawImage(image, { x, y, width: scaledWidth, height: scaledHeight })
  }

  const bytes = await pdfDoc.save()
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), params.fileName)
}
