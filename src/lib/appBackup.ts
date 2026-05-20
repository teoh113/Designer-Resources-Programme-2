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

export type AppBackup = {
  version: 1
  exportedAt: string
  localStorage: Record<string, string>
}

function shouldIncludeKey(key: string) {
  if (key === "theme") return true
  if (key === "designer_resources_programme_v1") return true
  if (key.startsWith("drp_")) return true
  return false
}

export function createAppBackup(): AppBackup {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (!shouldIncludeKey(key)) continue
    const value = localStorage.getItem(key)
    if (value === null) continue
    out[key] = value
  }
  return { version: 1, exportedAt: new Date().toISOString(), localStorage: out }
}

export function downloadAppBackup(fileName: string) {
  const backup = createAppBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
  downloadBlob(blob, fileName)
}

export function restoreAppBackup(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid backup file." } as const
  const b = raw as Partial<AppBackup>
  if (b.version !== 1) return { ok: false, error: "Unsupported backup version." } as const
  if (!b.localStorage || typeof b.localStorage !== "object") return { ok: false, error: "Invalid backup payload." } as const

  const remove: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (shouldIncludeKey(key)) remove.push(key)
  }
  for (const k of remove) localStorage.removeItem(k)

  for (const [k, v] of Object.entries(b.localStorage as Record<string, unknown>)) {
    if (typeof v !== "string") continue
    if (!shouldIncludeKey(k)) continue
    localStorage.setItem(k, v)
  }

  return { ok: true } as const
}

