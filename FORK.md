# Fork workflow (gulp79/opencode-antigravity-auth)

This fork is **not** published to npm. Builds are produced by GitHub Actions and attached to pre-releases of this repository; hosts load the plugin from a directory.

## Builds

Workflow: `.github/workflows/build-fork.yml` (manual `workflow_dispatch`, no secrets required).

- Tag scheme: `v<package version>-<label>`, default label `fork.<run>.<attempt>` (e.g. `v2.1.2-fork.7.1`). Pass a short label such as `gulp.3` for a cleaner tag.
- Runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, verifies `dist/`, then packs two assets:

| Asset | Contents | Needs npm on the host? |
| --- | --- | --- |
| `opencode-antigravity-auth-<version>.tgz` | compiled package only (`dist/` included) | yes |
| `opencode-antigravity-auth-<version>-bundle.tar.gz` | `node_modules/` with the package and all runtime dependencies | no |

`.github/workflows/release.yml` is upstream-only: the `publish` job is guarded by `github.repository == 'NoeFabris/opencode-antigravity-auth'`, so pushes to this fork skip it. Do not re-enable npm publishing here — the package name and the `repository.url` check belong to upstream.

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

## Upstream patches carried by this fork

Keep this table authoritative. Every integration adds a row; a removed patch keeps its row marked `reverted` instead of disappearing.

| Upstream PR | Title | Upstream commit | Fork commit | State | Notes |
| --- | --- | --- | --- | --- | --- |
| [#624](https://github.com/NoeFabris/opencode-antigravity-auth/pull/624) | Sanitize `tools.opencode.session_move` (HTTP 429 loop in OpenCode 2.2+) | `b523ee7` (2 commits) | `c1e5a2c` "fix google" | applied | Essential: without it single-account setups loop on `RESOURCE_EXHAUSTED`. Regression tests in `src/plugin/request.test.ts`. |
| [#617](https://github.com/NoeFabris/opencode-antigravity-auth/pull/617) | Scrollable native quota dialog (weekly + 5-hour cards) | `b62dd36` (3 commits) | — | not applied | Merge simulation conflicts only in `src/tui.ts` and `src/tui.test.ts` (one hunk each, keymap command list / test list). `src/plugin.ts` merges cleanly. |

### Integration procedure

1. `git fetch https://github.com/NoeFabris/opencode-antigravity-auth.git refs/pull/<n>/head:refs/heads/tmp/pr-<n>`.
2. Create `integrate/pr-<n>` from `main`, merge `tmp/pr-<n>`, resolve conflicts by keeping **both** behaviours (never drop an existing command, test or sanitizer from another carried PR).
3. Push the branch, open a pull request into this fork's `main`, wait for CI (`typecheck`, `test`, `build`).
4. Merge with a message prefixed `upstream(#<n>): <title>`, so `git log --grep='upstream(#'` lists every carried patch.
5. Add the row to the table above with upstream commit, fork merge commit and date.
6. Build a new asset with the Build Fork workflow and smoke-test it on the host before relying on it.

## Known risk: runtime dependencies of #617

#617 adds `@opentui/core`, `@opentui/solid` and `solid-js` as **devDependencies**, while the compiled TSX dialog imports them at runtime. `@opencode/plugin@2.1.2` declares the same three packages as *optional peer dependencies*, so the OpenCode host is expected to provide them. The `-bundle.tar.gz` asset installs production dependencies only, so it will not contain them.

If the plugin fails to load on the host after #617, move the three packages to `dependencies` in the fork and note the deviation in the table. Verify on the test host before promoting the build.

## Files

- `.github/workflows/build-fork.yml` — typecheck, tests, build, bundle, pre-release.
- `.github/workflows/release.yml` — upstream publish pipeline, guarded in this fork.
- `FORK.md` — this file: build usage, carried patches, integration rules.
