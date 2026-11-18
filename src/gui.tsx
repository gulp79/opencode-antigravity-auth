/** @jsxImportSource solid-js */
import { createSignal, For, Show } from "solid-js"
import {
  Plugin,
  Command,
  Panel,
  MenuItem,
  ComposerPill,
} from "@opencode/plugin/gui"
import type {
  Context,
  PanelProps,
  ComposerPillProps,
} from "@opencode/plugin/gui"
import { AntigravityAccountsRpc, type AccountSummary, type OpenAIAccountSummary } from "./plugin/account-rpc.ts"

export default Plugin.define({
  setup(ctx: Context) {
    const rpc = () => ctx.client.rpc(AntigravityAccountsRpc)

    // Reactive State
    const [accounts, setAccounts] = createSignal<AccountSummary[]>([])
    const [openaiAccounts, setOpenaiAccounts] = createSignal<OpenAIAccountSummary[]>([])
    const [quotaReport, setQuotaReport] = createSignal<string>("")
    const [loading, setLoading] = createSignal<boolean>(false)
    const [statusMessage, setStatusMessage] = createSignal<string>("")

    async function loadData() {
      setLoading(true)
      try {
        const [accList, opList] = await Promise.all([
          rpc().list({}),
          rpc().openai({}).catch(() => []),
        ])
        setAccounts(accList)
        setOpenaiAccounts(opList)
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    async function refreshQuotas(id?: string) {
      setLoading(true)
      setStatusMessage("Consultando quote in corso…")
      try {
        const res = await rpc().quotas(id ? { id } : {})
        setQuotaReport(res.report)
        await loadData()
        setStatusMessage("Quote aggiornate con successo")
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    async function refreshModels() {
      setLoading(true)
      setStatusMessage("Ricarica catalogo modelli in corso…")
      try {
        const res = await rpc().models({})
        setStatusMessage(`${res.count} modelli disponibili aggiornati`)
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    async function handleAccountAction(id: string, action: "select" | "enable" | "disable" | "delete") {
      setLoading(true)
      try {
        const res = await rpc().update({ id, action })
        ctx.toast.show({ title: res.message, variant: "success" })
        await loadData()
      } catch (err) {
        ctx.toast.show({ title: err instanceof Error ? err.message : String(err), variant: "error" })
      } finally {
        setLoading(false)
      }
    }

    function openPanelOrDialog() {
      const session = ctx.sessions.current()
      if (session) {
        ctx.layout.open(`${ctx.id}:accounts`, session, { background: false })
      } else {
        openAccountsDialog()
      }
    }

    function openAccountsDialog() {
      ctx.dialogs.open((dialog) => (
        <div style={{
          padding: "20px",
          "max-width": "680px",
          "max-height": "85vh",
          "overflow-y": "auto",
          background: "var(--background, #18181b)",
          "border-radius": "10px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}>
          <AccountsMainView onDone={dialog.close} />
        </div>
      ))
    }

    // Load initial data
    void loadData()

    // 1. Slash Commands & Command Palette
    ctx.add(Command, {
      id: "antigravity",
      title: "Google Antigravity Accounts & Quotas",
      description: "Visualizza e gestisci gli account Google e le relative quote",
      group: "Antigravity",
      slash: { name: "antigravity" },
      run: () => {
        openPanelOrDialog()
      },
    })

    ctx.add(Command, {
      id: "ag",
      title: "Google Antigravity (apri pannello)",
      group: "Antigravity",
      slash: { name: "ag" },
      run: () => {
        openPanelOrDialog()
      },
    })

    ctx.add(Command, {
      id: "quota",
      title: "Antigravity Model Quotas",
      description: "Aggiorna e mostra le quote disponibili per i modelli Antigravity",
      group: "Antigravity",
      slash: { name: "quota" },
      run: () => {
        void refreshQuotas()
        openPanelOrDialog()
      },
    })

    ctx.add(Command, {
      id: "limits",
      title: "All Limits (Antigravity & ChatGPT)",
      description: "Riepilogo limiti di tutte le quote e account connessi",
      group: "Antigravity",
      slash: { name: "limits" },
      run: () => {
        openPanelOrDialog()
      },
    })

    // 2. Side Panel Item (+ menu in session side panel)
    ctx.add(MenuItem, {
      id: "open-panel",
      menu: "session.panel",
      title: "Antigravity Accounts & Quotas",
      icon: "models",
      run: () => {
        openPanelOrDialog()
      },
    })

    // 3. Side Panel Registration (in side region)
    ctx.add(Panel, {
      id: "accounts",
      region: "side",
      list: () => {
        return [{
          id: "accounts",
          title: "Antigravity & Limits",
          closable: "hover" as const,
        }]
      },
      render: () => <AccountsMainView />
    })

    // 4. Composer Pill (Indicator placed above prompt input)
    ctx.add(ComposerPill, {
      id: "quota-indicator",
      order: 10,
      show: () => {
        const list = accounts()
        const active = list.find(a => a.current) || list[0]
        if (!active) return undefined

        const remaining = active.quota?.remainingFraction ?? 1
        const pct = Math.round(remaining * 100)
        const tone: "success" | "warning" | "danger" = remaining < 0.2 ? "danger" : remaining < 0.5 ? "warning" : "success"

        return {
          label: `🌌 ${active.email} (${pct}%)`,
          title: `Antigravity Quota: ${active.email}`,
          icon: "models" as const,
          tone,
          rows: [
            {
              id: "open-panel",
              label: "Apri pannello account e quote",
              icon: "models" as const,
              run: () => {
                openPanelOrDialog()
              },
            },
            {
              id: "refresh-quota",
              label: "Aggiorna quote adesso",
              icon: "check" as const,
              run: () => void refreshQuotas(),
            },
            {
              id: "refresh-models",
              label: "Ricarica modelli",
              icon: "cube" as const,
              run: () => void refreshModels(),
            },
          ],
        }
      },
    })

    function AccountsMainView(props: { onDone?: () => void }) {
      return (
        <div style={{
          display: "flex",
          "flex-direction": "column",
          gap: "16px",
          padding: "16px",
          height: "100%",
          "overflow-y": "auto",
          "box-sizing": "border-box",
          "font-family": "system-ui, -apple-system, sans-serif",
          color: "var(--foreground, #e4e4e7)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
            <div>
              <h2 style={{ margin: "0", "font-size": "1.2rem", "font-weight": "600", display: "flex", "align-items": "center", gap: "8px" }}>
                <span>🌌</span> Antigravity & AI Limits
              </h2>
              <p style={{ margin: "4px 0 0", "font-size": "0.85rem", opacity: "0.7" }}>Gestione account, quote e limiti modelli</p>
            </div>
            <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
              <ctx.ui.Button
                size="small"
                variant="neutral"
                disabled={loading()}
                onClick={() => void refreshQuotas()}
              >
                🔄 Quote
              </ctx.ui.Button>
              <ctx.ui.Button
                size="small"
                variant="neutral"
                disabled={loading()}
                onClick={() => void refreshModels()}
              >
                ⚡ Modelli
              </ctx.ui.Button>
              <Show when={props.onDone}>
                <ctx.ui.Button size="small" variant="ghost" onClick={props.onDone}>✕</ctx.ui.Button>
              </Show>
            </div>
          </div>

          <Show when={statusMessage()}>
            <div style={{
              padding: "8px 12px",
              "border-radius": "6px",
              "background-color": "rgba(255, 255, 255, 0.05)",
              "font-size": "0.85rem",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}>
              {statusMessage()}
            </div>
          </Show>

          {/* Section: Google Antigravity */}
          <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <h3 style={{ margin: "0", "font-size": "1rem", "font-weight": "600", display: "flex", "align-items": "center", gap: "6px" }}>
              <span>🪐</span> Account Google Antigravity ({accounts().length})
            </h3>

            <Show when={accounts().length === 0 && !loading()}>
              <div style={{ padding: "16px", "text-align": "center", opacity: "0.6", "font-size": "0.9rem" }}>
                Nessun account Google configurato.
              </div>
            </Show>

            <For each={accounts()}>
              {(acc) => {
                const remaining = acc.quota?.remainingFraction ?? 1
                const pct = Math.round(remaining * 100)
                const barColor = remaining < 0.2 ? "#ef4444" : remaining < 0.5 ? "#f59e0b" : "#10b981"

                return (
                  <div style={{
                    padding: "12px",
                    "border-radius": "8px",
                    "background-color": "rgba(255, 255, 255, 0.03)",
                    border: acc.current ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    "flex-direction": "column",
                    gap: "8px",
                  }}>
                    <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                        <span style={{ "font-weight": "600", "font-size": "0.95rem" }}>{acc.email}</span>
                        <Show when={acc.current}>
                          <span style={{
                            "font-size": "0.75rem",
                            padding: "2px 6px",
                            "border-radius": "4px",
                            "background-color": "rgba(59, 130, 246, 0.2)",
                            color: "#60a5fa",
                            "font-weight": "500",
                          }}>
                            Attiva
                          </span>
                        </Show>
                        <Show when={!acc.enabled}>
                          <span style={{
                            "font-size": "0.75rem",
                            padding: "2px 6px",
                            "border-radius": "4px",
                            "background-color": "rgba(239, 68, 68, 0.2)",
                            color: "#f87171",
                          }}>
                            Disabilitata
                          </span>
                        </Show>
                        <Show when={acc.verificationRequired}>
                          <span style={{
                            "font-size": "0.75rem",
                            padding: "2px 6px",
                            "border-radius": "4px",
                            "background-color": "rgba(245, 158, 11, 0.2)",
                            color: "#fbbf24",
                          }}>
                            Verifica richiesta
                          </span>
                        </Show>
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        <Show when={!acc.current && acc.enabled}>
                          <ctx.ui.Button
                            size="small"
                            variant="neutral"
                            disabled={loading()}
                            onClick={() => void handleAccountAction(acc.id, "select")}
                          >
                            Seleziona
                          </ctx.ui.Button>
                        </Show>
                        <ctx.ui.Button
                          size="small"
                          variant="ghost"
                          disabled={loading()}
                          onClick={() => void handleAccountAction(acc.id, acc.enabled ? "disable" : "enable")}
                        >
                          {acc.enabled ? "Disabilita" : "Abilita"}
                        </ctx.ui.Button>
                        <ctx.ui.Button
                          size="small"
                          variant="ghost"
                          disabled={loading()}
                          onClick={() => void refreshQuotas(acc.id)}
                        >
                          Quota
                        </ctx.ui.Button>
                      </div>
                    </div>

                    {/* Quota Progress Bar */}
                    <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                      <div style={{ display: "flex", "justify-content": "space-between", "font-size": "0.8rem", opacity: "0.8" }}>
                        <span>Quota residua</span>
                        <span style={{ color: barColor, "font-weight": "600" }}>{pct}%</span>
                      </div>
                      <div style={{
                        height: "6px",
                        width: "100%",
                        "background-color": "rgba(255, 255, 255, 0.1)",
                        "border-radius": "3px",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${pct}%`,
                          "background-color": barColor,
                          "border-radius": "3px",
                          transition: "width 0.3s ease",
                        }} />
                      </div>
                      <Show when={acc.quota?.resetTime}>
                        <div style={{ "font-size": "0.75rem", opacity: "0.6" }}>
                          Reset: {acc.quota?.resetTime}
                        </div>
                      </Show>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>

          {/* Section: OpenAI / ChatGPT */}
          <Show when={openaiAccounts().length > 0}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px", "margin-top": "8px" }}>
              <h3 style={{ margin: "0", "font-size": "1rem", "font-weight": "600", display: "flex", "align-items": "center", gap: "6px" }}>
                <span>🟢</span> OpenAI (ChatGPT) ({openaiAccounts().length})
              </h3>
              <For each={openaiAccounts()}>
                {(oa) => (
                  <div style={{
                    padding: "12px",
                    "border-radius": "8px",
                    "background-color": "rgba(255, 255, 255, 0.03)",
                    border: oa.active ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    "justify-content": "space-between",
                    "align-items": "center",
                  }}>
                    <div>
                      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                        <span style={{ "font-weight": "600", "font-size": "0.95rem" }}>{oa.label}</span>
                        <span style={{ "font-size": "0.85rem", opacity: "0.7" }}>({oa.email})</span>
                        <Show when={oa.active}>
                          <span style={{
                            "font-size": "0.75rem",
                            padding: "2px 6px",
                            "border-radius": "4px",
                            "background-color": "rgba(16, 185, 129, 0.2)",
                            color: "#34d399",
                          }}>
                            Attiva
                          </span>
                        </Show>
                      </div>
                      <div style={{ "font-size": "0.8rem", opacity: "0.7", "margin-top": "4px" }}>
                        Piano: <b>{oa.plan}</b> • Limite: 80 messaggi / 3 ore
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Detailed Quota Text Report */}
          <Show when={quotaReport()}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px", "margin-top": "8px" }}>
              <h3 style={{ margin: "0", "font-size": "0.95rem", "font-weight": "600" }}>📋 Dettaglio Quote per Modello</h3>
              <pre style={{
                margin: "0",
                padding: "12px",
                "border-radius": "6px",
                "background-color": "rgba(0, 0, 0, 0.3)",
                "font-size": "0.8rem",
                "font-family": "Consolas, Menlo, Monaco, monospace",
                "white-space": "pre-wrap",
                "word-break": "break-word",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                "max-height": "250px",
                "overflow-y": "auto",
              }}>
                {quotaReport()}
              </pre>
            </div>
          </Show>
        </div>
      )
    }
  },
})
