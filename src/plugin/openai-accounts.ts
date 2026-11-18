import fs from "node:fs"
import path from "node:path"

export interface OpenAIAccountInfo {
  readonly id: string
  readonly label: string
  readonly email: string
  readonly plan: string
  readonly active: boolean
  readonly expiresAt: Date | null
}

export async function getOpenAIAccounts(): Promise<readonly OpenAIAccountInfo[]> {
  try {
    const userDir = process.env.USERPROFILE || process.env.HOME || ""
    const dbPath = path.join(userDir, ".local", "share", "opencode", "opencode.db")
    if (!fs.existsSync(dbPath)) return []
    const { DatabaseSync } = await import("node:sqlite")
    const db = new DatabaseSync(dbPath, { open: true, readOnly: true })
    const rows = db.prepare("SELECT id, label, active, value FROM credential WHERE integration_id='openai'").all() as Array<{
      id: string
      label: string | null
      active: number | null
      value: string
    }>
    return rows.map((r, idx) => {
      let email = "Desconocido"
      let plan = "PLUS"
      let expiresAt: Date | null = null
      try {
        const val = JSON.parse(r.value)
        if (val.expires) expiresAt = new Date(val.expires)
        if (typeof val.access === "string") {
          const parts = val.access.split(".")
          const payloadPart = parts[1]
          if (payloadPart) {
            const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8"))
            email = payload["https://api.openai.com/profile"]?.email || email
            plan = String(payload["https://api.openai.com/auth"]?.chatgpt_plan_type || plan).toUpperCase()
          }
        }
      } catch {}
      return {
        id: r.id,
        label: r.label || `Cuenta ${idx + 1}`,
        email,
        plan,
        active: Boolean(r.active),
        expiresAt,
      }
    })
  } catch {
    return []
  }
}
