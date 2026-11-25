# Fork workflow (gulp79/opencode-antigravity-auth)

This fork is **not** published to npm. Builds are produced by GitHub Actions and attached to pre-releases of this repository; hosts load the plugin from a directory.

---

## Builds & Packaging

Workflow: `.github/workflows/build-fork.yml` (manual `workflow_dispatch`, no secrets required).

- Tag scheme: `v<package version>-<label>`, default label `fork.<run>.<attempt>` (e.g. `v2.1.2-fork.7.1`). Pass a short label such as `gulp.3` for a cleaner tag.
- Runs `npm ci --legacy-peer-deps`, `npm run typecheck`, `npm test`, `npm run build` (which runs `tsc` + ESM fix + `vite build`), verifies `dist/`, then packs two assets:

| Asset | Contents | Needs npm on the host? |
| --- | --- | --- |
| `opencode-antigravity-auth-<version>.tgz` | compiled package only (`dist/` included) | yes |
| `opencode-antigravity-auth-<version>-bundle.tar.gz` | `node_modules/` with the package and all runtime dependencies | no |

`.github/workflows/release.yml` is upstream-only: the `publish` job is guarded by `github.repository == 'NoeFabris/opencode-antigravity-auth'`, so pushes to this fork skip it. Do not re-enable npm publishing here — the package name and the `repository.url` check belong to upstream.

---

## Install on a host without npm/node

```bash
TAG=v2.1.2-gulp.3
mkdir -p ~/opt/oc-antigravity
curl -L -o /tmp/bundle.tar.gz \
  "https://github.com/gulp79/opencode-antigravity-auth/releases/download/${TAG}/opencode-antigravity-auth-2.1.2-bundle.tar.gz"
tar -xzf /tmp/bundle.tar.gz -C ~/opt/oc-antigravity
```

`~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/home/USER/opt/oc-antigravity/node_modules/opencode-antigravity-auth"]
}
```

A directory entry is ignored by the plugin auto-updater, so it never reverts to the upstream npm package.

---

## Upstream patches carried by this fork

Keep this table authoritative. Every integration adds a row; a removed patch keeps its row marked `reverted` instead of disappearing.

| Upstream PR | Title | Upstream commit | Fork commit | State | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| [#624](https://github.com/NoeFabris/opencode-antigravity-auth/pull/624) | Sanitize `tools.opencode.session_relocate` (HTTP 429 loop in OpenCode 2.2+) | `b523ee7` (2 commits) | `c1e5a2c` "fix google" | applied | Essential: without it single-account setups loop on `RESOURCE_EXHAUSTED`. Regression tests in `src/plugin/request.test.ts`. |
| [#617](https://github.com/NoeFabris/opencode-antigravity-auth/pull/617) | Scrollable native quota dialog (weekly + 5-hour cards) | `b62dd36` (3 commits) | `db7b5ee` (merge `419cf13`) | applied | Conflicts in `src/tui.ts` and `src/tui.test.ts` resolved by keeping all commands (`/antigravity`, `/quota` from #617, `/limits` from #624) and both tests. Deviates from the PR: `@opentui/core`, `@opentui/solid` and `solid-js` moved to `dependencies` (see below). |
| [#612](https://github.com/NoeFabris/opencode-antigravity-auth/pull/612) | Omit `undefined` quota properties from the account-list RPC payload (HTTP 500 `Expected JSON value at ["output"]` on OpenCode 2.2+) | `69d8cf7` (2 commits) | `6791536` (merge of `69d8cf7`) | applied | Conflict in `src/plugin/account-management.ts` was formatting only in `list()`: kept the compact object literal already present after #617; the conditional spreads in `summarizeCachedQuota()` merged cleanly. Fixes upstream issue #604. No fork deviation. |

---

## Fork Feature Additions: Desktop GUI & Non-TUI Layer

Beyond early upstream bugfixes, this fork implements a full GUI and RPC subsystem specifically crafted for **OpenCode Desktop** and non-TUI environments (Web / Desktop clients).

### 1. OpenCode Desktop GUI Plugin (`src/gui.tsx`)
- Built with **SolidJS** and the official `@opencode/plugin/gui` extension system.
- **Side Panel (`accounts`)**: A dedicated panel displaying all configured Antigravity Google accounts alongside active OpenAI/ChatGPT accounts. Provides one-click account selection, enabling/disabling, account deletion, manual quota refresh, and model catalog reload.
- **Composer Pill (`ctx.composer.pill`)**: A live status indicator displayed directly in the chat composer bar. Shows the active account email and a visual gauge / percentage of remaining quota for the primary model.
- **Rich Quota Visualizer**: Native cards rendering quota breakdowns (5-hour burst limits and weekly quota limits), expiration/reset timestamps, and visual progress bars.
- **Desktop Slash Commands & Palette**: Registers `/antigravity`, `/ag`, `/quota`, `/limits` in the Desktop command palette for quick interaction without requiring terminal TUI access.
- **Multi-Provider Account View**: Combines Google Antigravity accounts and local OpenAI/ChatGPT subscriptions in a unified dashboard.

### 2. Account RPC System (`src/plugin/account-rpc.ts` & `src/plugin/account-management.ts`)
- Defines the `antigravity.accounts` RPC protocol using `@opencode/plugin/rpc` and Zod schemas:
  - `list`: Returns all registered Google Antigravity accounts, active state, quota fraction, and verification requirements.
  - `connections`: Returns provider connection IDs associated with an account.
  - `quotas`: Fetches on-demand quota reports across all accounts or for a single account.
  - `update`: Handles actions (`enable`, `disable`, `select`, `delete`) dispatched from the GUI.
  - `models`: Triggers re-interrogation of live models and returns the count.
  - `openai`: Fetches OpenAI account metadata directly from the local OpenCode SQLite database.
- Registered into the OpenCode plugin server context inside `src/plugin/account-management.ts`.

### 3. OpenAI Local Integration (`src/plugin/openai-accounts.ts`)
- Queries the local OpenCode SQLite database (`opencode.db` under standard platform config paths) to extract stored OpenAI/ChatGPT OAuth credentials and plan details (e.g., Plus, Team, Enterprise).
- Allows Desktop users to monitor both Google Antigravity and OpenAI accounts in the same side panel without requiring separate plugins.

### 4. Non-TUI / TUI Decoupling & Server Command Deduplication (`src/tui.ts`, `src/v2.ts`)
- In non-TUI environments (such as OpenCode Desktop), running server-registered commands alongside GUI commands previously caused duplicate `/antigravity` slash commands and redundant background model queries.
- Refactored `src/tui.ts` and `src/v2.ts` to delegate account actions to the RPC layer and prevent command duplication when running inside OpenCode Desktop.

---

## Complete File Inventory: Fork vs Upstream

The following table details every file added or modified in this fork compared to the upstream repository (`NoeFabris/opencode-antigravity-auth`):

| File Path | Type | Category | Purpose / Changes in Fork |
| --- | --- | --- | --- |
| `src/gui.tsx` | **Added** | Desktop GUI | Main SolidJS GUI plugin for OpenCode Desktop (Side Panel, Composer Pill, Quota Visualizer, Desktop slash commands). |
| `src/plugin/account-rpc.ts` | **Added** | RPC Layer | Zod schemas and `Rpc.define({ id: "antigravity.accounts", ... })` contract for GUI-to-backend communication. |
| `src/plugin/openai-accounts.ts` | **Added** | Multi-Provider | Reads local OpenCode SQLite DB to display ChatGPT/OpenAI account status in GUI. |
| `vite.config.ts` | **Added** | Build Tooling | Vite configuration bundling `src/gui.tsx` using `@opencode/plugin/gui/vite`. |
| `.github/workflows/build-fork.yml` | **Added** | CI / Release | Manual workflow to test, build (`tsc` + `vite`), and publish `.tgz` and self-contained `-bundle.tar.gz` pre-releases. |
| `src/plugin/account-management.ts` | Modified | RPC & Quota | Implements and registers `AntigravityAccountsRpc` handlers; carries PR #612 (omit undefined quota properties). |
| `src/tui.ts` | Modified | TUI / Non-TUI | Adapted to use the RPC backend; carries PR #617 quota dialogs; handles command deduplication. |
| `src/v2.ts` | Modified | Plugin Core | Initializes RPC registration cleanly; optimizes model discovery and prevents duplicate interrogation in Desktop. |
| `src/v2.test.ts` | Modified | Tests | Updated assertions to accommodate RPC registration and multi-environment setup. |
| `src/plugin/request.ts` | Modified | Upstream Patches | Carries PR #624 (`session_relocate` sanitizer to prevent HTTP 429 loops). |
| `src/quota-dialog.tsx` | Added (via PR #617) | Upstream Patches | OpenTUI Solid native dialog for terminal quota inspection. |
| `src/plugin/ui/quota.ts` | Added (via PR #617) | Upstream Patches | Quota inspection UI helpers. |
| `package.json` | Modified | Build & Config | Added `vite build` to `scripts.build`; added `@opencode/client`, `@opencode/plugin`, `vite`, `vite-plugin-solid`, `@opentui/*` dependencies; added `"./gui-experimental"` export. |
| `package-lock.json` | Modified | Dependencies | Locked versions for SolidJS, Vite, and OpenCode plugin packages. |
| `.github/workflows/ci.yml` | Modified | CI | Runs on `integrate/**` branches; surfaces package verification logs as annotations; uses `--legacy-peer-deps`. |
| `.github/workflows/release.yml` | Modified | CI | Guarded to run only on `NoeFabris/opencode-antigravity-auth` to prevent accidental npm publish attempts. |
| `script/verify-package.mjs` | Modified | Packaging | Tolerates transitive TypeScript peer dependency introduced by `@opentui/core`. |
| `.gitignore` | Modified | Config | Ignores `promptMerge.md` and local fork maintenance artifacts. |
| `FORK.md` | Modified / Maintained | Documentation | Authoritative inventory of fork features, upstream PRs, and build guidelines. |
| `AGENTS.md` | Modified / Maintained | Documentation | Developer and AI guidance for maintaining fork features and coding standards. |

---

## Fork Deviations & Packaging Quirks

1. **Runtime dependencies for UI components:**
   `@opentui/core`, `@opentui/solid`, and `solid-js` are required at runtime by both the terminal dialog (`src/quota-dialog.tsx`) and the Desktop GUI (`src/gui.tsx`). They are kept in `dependencies` rather than `devDependencies` so that self-contained bundle installations (`-bundle.tar.gz`) function without global node modules.
2. **`--legacy-peer-deps` during CI:**
   Due to peer dependency conflicts between `@opentui/core` (which peers with TypeScript) and newer `@opencode/plugin` versions, `npm ci --legacy-peer-deps` is used in GitHub Actions (`build-fork.yml` and `ci.yml`).
3. **Dual Build Pipeline:**
   `npm run build` runs:
   ```bash
   tsc -p tsconfig.build.json && node script/fix-esm-imports.mjs && vite build
   ```
   `tsc` compiles the TypeScript backend and TUI to `dist/`, while `vite build` bundles `src/gui.tsx` into `dist/gui.js` using `@opencode/plugin/gui/vite`.

---

## Integration & Merge Procedure

When synchronizing this fork with upstream `NoeFabris/opencode-antigravity-auth`:
1. **Never do a blind rebase or fast-forward merge.**
2. Follow the dedicated step-by-step instructions in `promptMerge.md`.
3. Verify that all Desktop GUI (`src/gui.tsx`), RPC definitions (`src/plugin/account-rpc.ts`), and build steps (`vite.config.ts`, `package.json` scripts) remain intact.
4. Run `npm run typecheck`, `npm test`, and `npm run build` to confirm both backend and GUI compilation succeed.
