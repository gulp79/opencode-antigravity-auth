# AGENTS.md

Guidance for AI agents working with this repository.

## Overview

OpenCode plugin for Google Antigravity OAuth. Intercepts `fetch()` calls to `generativelanguage.googleapis.com`, transforms them to Antigravity format, and handles auth, quota, recovery, multi-account rotation, native TUI dialogs, and a native OpenCode Desktop GUI plugin.

## Build & Test Commands

```bash
npm install --legacy-peer-deps        # Install dependencies (flag needed for @opentui peer deps)
npm run build                        # Compile backend (tsc) + ESM fixes + Desktop GUI (vite build)
npm run typecheck                    # Type-check only (tsc --noEmit)
npm test                             # Run all tests (vitest run)
npx vitest run src/plugin/auth.test.ts          # Single test file
npx vitest run -t "test name here"              # Single test by name
npx vitest --watch src/plugin/auth.test.ts      # Watch mode, single file
npm run test:coverage                # Coverage report
npm run test:e2e:models              # E2E: model availability check
npm run test:e2e:regression          # E2E: regression suite
```

> **Note on Build Pipeline**: `npm run build` runs `tsc -p tsconfig.build.json && node script/fix-esm-imports.mjs && vite build`. `tsc` builds the core plugin backend and TUI, while `vite` bundles `src/gui.tsx` into `dist/gui.js` for OpenCode Desktop.

No linter or formatter is configured. Style is enforced by convention (see below).

## Fork Workflow & Architecture

This repository is the `gulp79` fork; `upstream` is `NoeFabris/opencode-antigravity-auth`. It is not published to npm.

- Builds and test builds come from `.github/workflows/build-fork.yml` (manual dispatch): runs typecheck, tests, `npm run build`, then produces a `.tgz` plus a self-contained `-bundle.tar.gz` attached to a pre-release.
- `.github/workflows/release.yml` (npm publish) is guarded to upstream and skipped here. Never bump the version or publish to npm from this fork.
- Hosts are expected to load the plugin from a directory, not from `opencode-antigravity-auth@<version>` (that resolves to the upstream package).
- Upstream pull requests and proprietary fork features are tracked in [FORK.md](FORK.md). Read it before touching code covered by a carried patch or GUI/RPC subsystem.
- When performing merges or synchronizations with upstream, **strictly follow [promptMerge.md](promptMerge.md)** to prevent regressions in Desktop GUI, RPC communication, and bundle packaging.
- Write integration commits as `upstream(#<pr>): <title>`, and land them through a branch plus a pull request into `main` — never directly.

## TypeScript Configuration

- `strict: true` with extra strictness: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `target: ESNext`, `module: Preserve`, `moduleResolution: bundler`
- `allowImportingTsExtensions: true` — use `.ts` extensions in imports
- No path aliases — all imports are relative

## Code Style

### Imports
- Use `import type { ... }` for type-only imports (enforced by `verbatimModuleSyntax`)
- Named imports only — no default imports in src/ (except Solid components / GUI entrypoint if required by `@opencode/plugin/gui`)
- Relative paths with `.ts` / `.tsx` extensions: `import { foo } from "./bar.ts"`
- Order: node builtins > external packages > local modules

### Exports
- Named exports only in src/ — no default exports (except `src/gui.tsx` default export for OpenCode Desktop plugin loader)
- Barrel files (index.ts) for module surfaces

### Naming
- `camelCase` for functions, variables, parameters
- `PascalCase` for types, interfaces, classes, enums, Solid components
- `UPPER_SNAKE_CASE` for constants
- `kebab-case` for file names (e.g., `request-helpers.ts`, `account-rpc.ts`, `openai-accounts.ts`)
- Test files: `*.test.ts` colocated with source

### Types
- No `I` prefix on interfaces, no `Type` suffix
- Use `z.infer<typeof Schema>` for Zod-derived types
- Extract to `types.ts` or `*-rpc.ts` when shared, inline when local
- Discriminated unions preferred over boolean flags
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`

### Functions
- `export function` for public APIs
- Arrow functions for callbacks, factories, and inline closures
- Async functions with targeted try/catch (not blanket)

### Error Handling
- Defensive try/catch with graceful degradation (fallback values, not crashes)
- Custom error classes with metadata when domain-specific
- Catch `unknown`, log, and convert to domain errors — never empty catch blocks
- Rate limit / quota errors trigger account rotation, not failure

### Formatting
- 2-space indentation
- Double quotes for strings
- Trailing commas in multiline constructs
- No semicolons (project convention)

### Logging
- `createLogger("module-name")` for structured logging
- `console.log` only for CLI/user-facing output

## Module Structure

```
src/
├── gui.tsx                  # Native OpenCode Desktop GUI plugin (SolidJS: side panel, composer pill, quota visualizer)
├── quota-dialog.tsx         # OpenTUI Solid scrollable terminal quota dialog (PR #617)
├── plugin.ts                # Main entry, fetch interceptor
├── constants.ts             # Endpoints, headers, API config, system prompts
├── v2.ts                    # OpenCode V2 provider and tool integration
├── tui.ts                   # Terminal command handling & TUI UI integration
├── antigravity/oauth.ts     # OAuth token exchange
└── plugin/
    ├── account-rpc.ts       # Zod RPC schema definitions for Desktop GUI communication
    ├── openai-accounts.ts   # Local OpenCode SQLite queries for OpenAI/ChatGPT accounts
    ├── account-management.ts# Multi-account operations, rotation logic & RPC server registration
    ├── auth.ts              # Token validation & refresh
    ├── request.ts           # Request transformation (core logic, PR #624 sanitizers)
    ├── request-helpers.ts   # Schema cleaning, thinking filters
    ├── thinking-recovery.ts # Turn boundary detection
    ├── recovery.ts          # Session recovery (tool_result_missing)
    ├── quota.ts             # Quota checking (API usage stats)
    ├── cache.ts             # Auth & signature caching
    ├── storage.ts           # Persistent storage schemas (Zod)
    ├── fingerprint.ts       # Device fingerprint generation & headers
    ├── project.ts           # Managed project context resolution
    ├── ui/quota.ts          # Quota rendering helpers
    └── debug.ts             # Debug logging utilities
```

## Key Design Patterns

### 1. Request Interception
Plugin intercepts `fetch()` for `generativelanguage.googleapis.com`, transforms to Antigravity format. Two header styles: `antigravity` (Electron-style UA + fingerprint) and `gemini-cli` (nodejs-client UA).

### 2. OpenCode Desktop Native GUI (`src/gui.tsx`)
Written with SolidJS via `@opencode/plugin/gui`.
- **Side Panel (`accounts`)**: Interactive list of active Google and OpenAI accounts with live status indicators, account switching, quota cards, and model reloads.
- **Composer Pill (`ctx.composer.pill`)**: Displays current account email and a remaining quota gauge directly in the prompt composer.
- **Desktop Slash Commands**: Exposes `/antigravity`, `/ag`, `/quota`, `/limits` in the Desktop client without duplicating CLI server commands.

### 3. Account RPC Communication (`src/plugin/account-rpc.ts`)
Decouples GUI clients from backend storage and operations:
- Defined via `Rpc.define({ id: "antigravity.accounts", ... })`.
- Handlers registered in `src/plugin/account-management.ts` via `ctx.rpc.register(AntigravityAccountsRpc, ...)`.
- Provides type-safe RPC methods: `list`, `connections`, `quotas`, `update`, `models`, `openai`.

### 4. Local OpenAI Multi-Account Aggregation (`src/plugin/openai-accounts.ts`)
Queries OpenCode's local SQLite storage (`opencode.db`) across standard OS config locations. Extracts active OpenAI subscriptions so that users can inspect both Google Antigravity and OpenAI quota/plan statuses from a unified side panel.

### 5. Claude Thinking Blocks
ALL thinking blocks are stripped from outgoing requests for Claude models. Claude generates fresh thinking each turn. This eliminates signature validation errors.

### 6. Session Recovery & Schema Sanitization
- When tool execution is interrupted (ESC/timeout), the plugin injects synthetic `tool_result` blocks to recover the session without starting over.
- Tool schemas are cleaned via allowlist. Unsupported fields (`const`, `$ref`, `$defs`, `session_relocate` recursion) are stripped or sanitized.

### 7. Multi-Account Load Balancing & Fingerprints
Accounts rotate on rate limits. Gemini has dual quota pools (Antigravity headers + Gemini CLI headers). Per-account device fingerprints stored in `antigravity-accounts.json` with history tracking.

## Dependencies

- `zod ^4` — schema validation (NOT zod v3)
- `@opencode-ai/plugin` & `@opencode/plugin` — OpenCode plugin runtime interfaces
- `@opencode/client` — OpenCode client SDK
- `@openauthjs/openauth` — OAuth client
- `@opentui/core` & `@opentui/solid` — Terminal UI runtime
- `solid-js` & `vite-plugin-solid` — Reactive GUI rendering
- `vite` — Bundler for `src/gui.tsx`
- `proper-lockfile` — file locking for concurrent access
- `xdg-basedir` — XDG directory resolution

## Testing

- Framework: **Vitest 3** with native ESM
- Config: `vitest.config.ts`
- Tests colocated: `src/plugin/foo.test.ts` next to `src/plugin/foo.ts`
- Use `describe`/`it`/`expect` — standard Vitest API
- Mock with `vi.fn()`, `vi.spyOn()`, `vi.mock()`

## Documentation

- [README.md](README.md) — Installation & usage
- [FORK.md](FORK.md) — Authoritative fork inventory, carried PRs, GUI additions, and packaging
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Detailed architecture guide
- [docs/ANTIGRAVITY_API_SPEC.md](docs/ANTIGRAVITY_API_SPEC.md) — API reference
- [CHANGELOG.md](CHANGELOG.md) — Version history
