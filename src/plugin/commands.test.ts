import { describe, expect, it, vi } from "vitest"
import type { Plugin } from "@opencode/plugin"
import type { CommandDefinition } from "@opencode/plugin/promise/command"
import type { AccountManager } from "./account-management.ts"
import { registerServerCommands } from "./commands.ts"

function createMockContext() {
  const commands: Record<string, CommandDefinition> = {}
  const syntheticCalls: Array<{ sessionID: string; text: string }> = []

  const ctx = {
    command: {
      transform: vi.fn(async (callback: (editor: { add: (def: CommandDefinition) => void }) => void) => {
        callback({
          add: (def: CommandDefinition) => {
            commands[def.name] = def
          },
        })
        return { dispose: async () => undefined }
      }),
    },
    session: {
      synthetic: vi.fn(async (params: { sessionID: string; text: string }) => {
        syntheticCalls.push(params)
      }),
    },
  } as unknown as Plugin.Context

  return { ctx, commands, syntheticCalls }
}

function createMockManager(): AccountManager {
  return {
    list: vi.fn(async () => [
      {
        id: "acc-1",
        email: "user1@example.com",
        enabled: true,
        current: true,
        verificationRequired: false,
        lastUsed: 1000,
        quota: { remainingFraction: 0.8, resetTime: "2h" },
      },
      {
        id: "acc-2",
        email: "user2@example.com",
        enabled: false,
        current: false,
        verificationRequired: false,
        lastUsed: 500,
      },
    ]),
    quotas: vi.fn(async (input?: { id?: string }) => {
      const all = [
        {
          id: "acc-1",
          email: "user1@example.com",
          report: "Claude 3.5 Sonnet: 80% remaining\nGemini 2.5 Flash: 100% remaining",
          disabled: false,
        },
        {
          id: "acc-2",
          email: "user2@example.com",
          report: "Account disabled",
          disabled: true,
        },
      ]
      const accounts = input?.id ? all.filter(a => a.id === input.id) : all
      return {
        report: all.map(a => `${a.email}:\n${a.report}`).join("\n\n"),
        accounts,
      }
    }),
    update: vi.fn(async ({ id, action }) => {
      return { success: true, message: `Account ${id} updated with action ${action}` }
    }),
    models: vi.fn(async () => ({ count: 12 })),
    connections: vi.fn(async () => []),
    openai: vi.fn(async () => []),
  }
}

describe("registerServerCommands", () => {
  it("gracefully degrades when ctx.command is undefined", async () => {
    const manager = createMockManager()
    const emptyCtx = {} as Plugin.Context
    const registration = await registerServerCommands(emptyCtx, manager)
    expect(registration).toBeDefined()
    expect(typeof registration.dispose).toBe("function")
  })

  it("registers quota, limits, and antigravity commands and aliases", async () => {
    const { ctx, commands } = createMockContext()
    const manager = createMockManager()

    await registerServerCommands(ctx, manager)

    expect(commands["quota"]).toBeDefined()
    expect(commands["limits"]).toBeDefined()
    expect(commands["cuentas"]).toBeDefined()
    expect(commands["quotas"]).toBeDefined()
    expect(commands["antigravity"]).toBeDefined()
    expect(commands["ag"]).toBeDefined()
  })

  describe("/quota command", () => {
    it("reports all quotas via synthetic message", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["quota"]!
      await cmd.execute({
        sessionID: "session-123" as never,
        prompt: { text: "" } as never,
        delivery: "steer" as never,
      })

      expect(manager.quotas).toHaveBeenCalled()
      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.sessionID).toBe("session-123")
      expect(syntheticCalls[0]?.text).toContain("Antigravity Quota")
      expect(syntheticCalls[0]?.text).toContain("user1@example.com")
    })

    it("filters quota by account identifier when argument is passed", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["quota"]!
      await cmd.execute({
        sessionID: "session-123" as never,
        prompt: { text: "user1@example.com" } as never,
        delivery: "steer" as never,
      })

      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.text).toContain("user1@example.com")
    })
  })

  describe("/limits command", () => {
    it("reports Antigravity quotas and OpenAI accounts", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["limits"]!
      await cmd.execute({
        sessionID: "session-456" as never,
        prompt: { text: "" } as never,
        delivery: "steer" as never,
      })

      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.sessionID).toBe("session-456")
      expect(syntheticCalls[0]?.text).toContain("Google Antigravity")
      expect(syntheticCalls[0]?.text).toContain("OpenAI (ChatGPT)")
    })
  })

  describe("/antigravity command", () => {
    it("lists accounts by default", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["ag"]!
      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "" } as never,
        delivery: "steer" as never,
      })

      expect(manager.list).toHaveBeenCalled()
      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.text).toContain("Google Accounts (Antigravity)")
      expect(syntheticCalls[0]?.text).toContain("user1@example.com")
      expect(syntheticCalls[0]?.text).toContain("Attiva")
    })

    it("handles 'select' subcommand", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["ag"]!
      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "select user1@example.com" } as never,
        delivery: "steer" as never,
      })

      expect(manager.update).toHaveBeenCalledWith({ id: "acc-1", action: "select" })
      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.text).toContain("Account acc-1 updated with action select")
    })

    it("handles 'select' missing account error", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["ag"]!
      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "select non-existent@test.com" } as never,
        delivery: "steer" as never,
      })

      expect(manager.update).not.toHaveBeenCalled()
      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.text).toContain("Nessun account trovato")
    })

    it("handles 'enable' and 'disable' subcommands", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["ag"]!
      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "enable acc-2" } as never,
        delivery: "steer" as never,
      })

      expect(manager.update).toHaveBeenCalledWith({ id: "acc-2", action: "enable" })

      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "disable acc-1" } as never,
        delivery: "steer" as never,
      })

      expect(manager.update).toHaveBeenCalledWith({ id: "acc-1", action: "disable" })
    })

    it("handles 'refresh' or 'models' subcommand", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["ag"]!
      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "refresh" } as never,
        delivery: "steer" as never,
      })

      expect(manager.models).toHaveBeenCalled()
      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.text).toContain("caricati **12** modelli disponibili")
    })

    it("handles 'help' subcommand", async () => {
      const { ctx, commands, syntheticCalls } = createMockContext()
      const manager = createMockManager()
      await registerServerCommands(ctx, manager)

      const cmd = commands["ag"]!
      await cmd.execute({
        sessionID: "session-789" as never,
        prompt: { text: "help" } as never,
        delivery: "steer" as never,
      })

      expect(syntheticCalls).toHaveLength(1)
      expect(syntheticCalls[0]?.text).toContain("Comandi Antigravity")
    })
  })
})
