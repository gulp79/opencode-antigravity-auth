import type { Plugin } from "@opencode/plugin"
import type { AccountManager } from "./account-management.ts"
import { formatQuotaDescription } from "./ui/quota.ts"
import { getOpenAIAccounts } from "./openai-accounts.ts"
import { createLogger } from "./logger.ts"

const log = createLogger("commands")

type CommandEditor = Parameters<Parameters<Plugin.Context["command"]["transform"]>[0]>[0]
type CommandInvocation = Parameters<Parameters<CommandEditor["add"]>[0]["execute"]>[0]

/** Register OpenCode server commands for Web, Desktop and non-TUI environments. */
export async function registerServerCommands(
  ctx: Plugin.Context,
  manager: AccountManager,
): Promise<{ dispose(): Promise<void> }> {
  async function executeQuota(input: CommandInvocation): Promise<void> {
    if (!input.sessionID) return
    try {
      const raw = input.prompt.text.trim()
      const query = raw.replace(/^\/quota\s*/i, "").trim().toLowerCase()
      const accounts = await manager.list()
      const target = query
        ? accounts.find(a => a.email.toLowerCase().includes(query) || a.id.toLowerCase() === query)
        : undefined

      const quotaResult = await manager.quotas(target ? { id: target.id } : undefined)
      const reportText = quotaResult.report || "No quota information available."

      await ctx.session.synthetic({
        sessionID: input.sessionID,
        text: `### 🌌 Antigravity Quota\n\n\`\`\`text\n${reportText}\n\`\`\``,
      })
    } catch (error) {
      log.error("Failed to check quota", { error: String(error) })
      await ctx.session.synthetic({
        sessionID: input.sessionID,
        text: `⚠️ **Error checking quota**: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async function executeLimits(input: CommandInvocation): Promise<void> {
    if (!input.sessionID) return
    try {
      const [agAccounts, quotaResult, openaiAccounts] = await Promise.all([
        manager.list(),
        manager.quotas(),
        getOpenAIAccounts(),
      ])

      const sections: string[] = ["### 📊 Límites y Cuotas de Cuentas\n"]

      // Google Antigravity section
      sections.push("#### 🌌 Google Antigravity\n")
      if (agAccounts.length === 0) {
        sections.push("*(No hay cuentas de Antigravity configuradas)*\n")
      } else {
        for (const acc of agAccounts) {
          const status = acc.current ? " `[ACTIVA]`" : acc.enabled ? "" : " `[DESHABILITADA]`"
          const needsVerif = acc.verificationRequired ? " `[REQUIERE VERIFICACIÓN]`" : ""
          const rep = quotaResult.accounts.find(r => r.id === acc.id)?.report
          sections.push(`**${acc.email}**${status}${needsVerif}`)
          if (rep) {
            sections.push(`\`\`\`text\n${rep}\n\`\`\`\n`)
          } else {
            sections.push(`Quota: ${formatQuotaDescription(acc.quota)}\n`)
          }
        }
      }

      // OpenAI / ChatGPT section
      sections.push("#### 🟢 OpenAI (ChatGPT)\n")
      if (openaiAccounts.length === 0) {
        sections.push("*(No hay cuentas de OpenAI configuradas en la base de datos local)*\n")
      } else {
        for (const acc of openaiAccounts) {
          const status = acc.active ? " `[ACTIVA]`" : " `[ALTERNATIVA]`"
          const expires = acc.expiresAt ? acc.expiresAt.toLocaleDateString() : "Válida"
          sections.push(`- **${acc.label}** (${acc.email})${status}`)
          sections.push(`  - Plan: **ChatGPT ${acc.plan}** | Límite: 80 msgs / 3h | Sesión: ${expires}`)
        }
      }

      await ctx.session.synthetic({
        sessionID: input.sessionID,
        text: sections.join("\n"),
      })
    } catch (error) {
      log.error("Failed to check limits", { error: String(error) })
      await ctx.session.synthetic({
        sessionID: input.sessionID,
        text: `⚠️ **Error checking limits**: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async function executeAntigravity(input: CommandInvocation): Promise<void> {
    if (!input.sessionID) return
    try {
      const raw = input.prompt.text.trim()
      const text = raw.replace(/^\/(?:antigravity|ag)\s*/i, "").trim()
      const [subcommand, ...rest] = text.split(/\s+/).filter(Boolean)
      const arg = rest.join(" ").trim()
      const sub = (subcommand ?? "").toLowerCase()

      if (sub === "help") {
        await ctx.session.synthetic({
          sessionID: input.sessionID,
          text: [
            "### 🌌 Comandi Antigravity",
            "",
            "- `/ag` o `/ag list`: Mostra tutti gli account Google collegati e il loro stato.",
            "- `/ag select <email o ID>`: Imposta l'account specificato come attivo.",
            "- `/ag enable <email o ID>`: Abilita l'account specificato nel pool.",
            "- `/ag disable <email o ID>`: Disabilita l'account specificato.",
            "- `/ag refresh` o `/ag models`: Ricarica e aggiorna il catalogo dei modelli disponibili.",
            "- `/quota`: Mostra il dettaglio delle quote e dei limiti residui.",
            "- `/limits`: Mostra i limiti combinati di tutti gli account (Antigravity e ChatGPT).",
          ].join("\n"),
        })
        return
      }

      if (sub === "refresh" || sub === "models") {
        const { count } = await manager.models()
        await ctx.session.synthetic({
          sessionID: input.sessionID,
          text: `✅ **Catalogo modelli aggiornato**: caricati **${count}** modelli disponibili.`,
        })
        return
      }

      if (sub === "quota") {
        const accounts = await manager.list()
        const target = arg
          ? accounts.find(a => a.email.toLowerCase().includes(arg.toLowerCase()) || a.id.toLowerCase() === arg.toLowerCase())
          : undefined
        const quotaResult = await manager.quotas(target ? { id: target.id } : undefined)
        await ctx.session.synthetic({
          sessionID: input.sessionID,
          text: `### 🌌 Antigravity Quota\n\n\`\`\`text\n${quotaResult.report}\n\`\`\``,
        })
        return
      }

      if (sub === "select") {
        if (!arg) {
          await ctx.session.synthetic({
            sessionID: input.sessionID,
            text: "⚠️ Specifica l'email o l'ID dell'account da selezionare: `/ag select <email o ID>`",
          })
          return
        }
        const accounts = await manager.list()
        const target = accounts.find(a => a.email.toLowerCase().includes(arg.toLowerCase()) || a.id.toLowerCase() === arg.toLowerCase())
        if (!target) {
          await ctx.session.synthetic({
            sessionID: input.sessionID,
            text: `❌ Nessun account trovato corrispondente a "${arg}". Usa \`/ag\` per vedere gli account disponibili.`,
          })
          return
        }
        const res = await manager.update({ id: target.id, action: "select" })
        await ctx.session.synthetic({
          sessionID: input.sessionID,
          text: `✅ **Account selezionato**: ${target.email}\n${res.message}`,
        })
        return
      }

      if (sub === "enable" || sub === "disable") {
        if (!arg) {
          await ctx.session.synthetic({
            sessionID: input.sessionID,
            text: `⚠️ Specifica l'email o l'ID dell'account: \`/ag ${sub} <email o ID>\``,
          })
          return
        }
        const accounts = await manager.list()
        const target = accounts.find(a => a.email.toLowerCase().includes(arg.toLowerCase()) || a.id.toLowerCase() === arg.toLowerCase())
        if (!target) {
          await ctx.session.synthetic({
            sessionID: input.sessionID,
            text: `❌ Nessun account trovato corrispondente a "${arg}". Usa \`/ag\` per vedere gli account disponibili.`,
          })
          return
        }
        const res = await manager.update({ id: target.id, action: sub })
        await ctx.session.synthetic({
          sessionID: input.sessionID,
          text: `✅ **Account ${sub === "enable" ? "abilitato" : "disabilitato"}**: ${target.email}\n${res.message}`,
        })
        return
      }

      // Default: list accounts
      const accounts = await manager.list()
      if (accounts.length === 0) {
        await ctx.session.synthetic({
          sessionID: input.sessionID,
          text: "🌌 **Nessun account Google Antigravity salvato.** Collega un account tramite l'interfaccia provider o il comando TUI.",
        })
        return
      }

      const rows = accounts.map(a => {
        const status = a.current ? "🟢 **Attiva**" : a.enabled ? "⚪ Abilitata" : "🔴 Disabilitata"
        const verif = a.verificationRequired ? " *(Richiede verifica)*" : ""
        const quotaDesc = formatQuotaDescription(a.quota)
        return `| **${a.email}** | ${status}${verif} | ${quotaDesc} | \`${a.id.slice(0, 8)}...\` |`
      })

      const markdown = [
        "### 🌌 Google Accounts (Antigravity)",
        "",
        "| Account | Stato | Quota Residua | ID |",
        "| :--- | :--- | :--- | :--- |",
        ...rows,
        "",
        "💡 **Comandi rapidi**:",
        "- `/ag select <email>` per cambiare account attivo",
        "- `/ag enable <email>` o `/ag disable <email>` per abilitare/disabilitare",
        "- `/ag refresh` per sincronizzare i modelli",
        "- `/quota` per visualizzare i dettagli completi delle quote",
      ].join("\n")

      await ctx.session.synthetic({
        sessionID: input.sessionID,
        text: markdown,
      })
    } catch (error) {
      log.error("Failed to execute antigravity command", { error: String(error) })
      await ctx.session.synthetic({
        sessionID: input.sessionID,
        text: `⚠️ **Error**: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  if (!ctx.command?.transform) {
    return { dispose: async () => undefined }
  }

  return ctx.command.transform((editor) => {
    // /quota
    editor.add({
      name: "quota",
      description: "Check Antigravity model quotas and rate limits",
      execute: executeQuota,
    })

    // /limits (with aliases /cuentas, /quotas)
    editor.add({
      name: "limits",
      description: "Show limits and quotas of all accounts (Antigravity & ChatGPT)",
      execute: executeLimits,
    })
    editor.add({
      name: "cuentas",
      description: "Límites y cuotas de todas las cuentas (alias de /limits)",
      execute: executeLimits,
    })
    editor.add({
      name: "quotas",
      description: "Límites y cuotas de todas las cuentas (alias de /limits)",
      execute: executeLimits,
    })

    // /antigravity (with alias /ag)
    editor.add({
      name: "antigravity",
      description: "Manage Antigravity accounts, status and models",
      execute: executeAntigravity,
    })
    editor.add({
      name: "ag",
      description: "Manage Antigravity accounts (alias of /antigravity)",
      execute: executeAntigravity,
    })
  })
}
