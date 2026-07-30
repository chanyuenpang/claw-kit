# Cindy artifact rule

- Scope: `packages/cindy-adapter`.
- Version: bump only the fourth segment of the Cindy adapter version; keep CLI/core and other adapters unchanged.
- Verify Cindy plugin source, package metadata, tests, and the selected release tag.
- Tag `vcindy-<adapter-version>` and create the GitHub release; do not publish npm packages.
- Do not refresh the Codex installation unless the user separately requests it.

## Cindy plugin manifest constraints

The Cindy plugin manifest (`packages/cindy-adapter/plugin/ghost.json`) is validated by
the Cindy host at install time. These constraints are enforced by Cindy shared
`validateGhostManifest` and are not discoverable from claw-kit own tooling.

### Skill limit

- **`skill.items` maximum is 4 entries.** Exceeding this rejects the plugin at install
  with `skill.items 最多 4 条`. Before bumping, count skill items in `ghost.json`.
  If the count exceeds 4, drop lower-priority skills (or move them into shared skill
  directories discoverable by other means).

### Manifest field limits

- `id`: 1–32 chars, `[a-z0-9][a-z0-9-]*`, no leading hyphen.
- `name`: 1–64 chars, non-empty.
- `version`: 1–32 chars, non-empty.
- `description`: 1–300 chars, optional.
- `whenToUse`: 1–300 chars, optional.
- `entry`: mandatory, must be a safe relative path (forward-slash segments matching
  `[a-zA-Z0-9_][a-zA-Z0-9._-]{0,63}`, no `.`/`..`, no backslash, max 256 chars).
- `node.entry`: must be a `.js` or `.cjs` file, must differ from `entry`.
- `tools[].name`: 1–64 chars, `[a-z][a-z0-9_-]*`.
- `tools[].description`: 1–1024 chars.
- `tools` array: 1–16 items.
- `subscribe.hooks` declared → `launch` must be `"resident"`.
- `slots` must be a non-empty array from the allowed set.
- `kind` is always `"chip"` (or omitted; schemaVersion 2 only).

### Skill consistency check

- Each `skill.items[].name` and `description` must exactly match the `SKILL.md`
  frontmatter in the corresponding `dir`. The host checks this at both pack time
  and install time via `checkSkillMdConsistency`.

### Path safety

- All declared file paths (`entry`, `icon`, `settingsHtml`, `node.entry`,
  `skill.items[].dir`, `panel.html`, locale paths) must use forward slashes only,
  no `..` segments, no absolute paths.

## Building the .cindy package

When `ghost_forge_pack` (Cindy MCP tool) is unavailable, build the `.cindy`
artifact manually:

1. The `.cindy` file is a ZIP archive containing all files under
   `packages/cindy-adapter/plugin`, excluding:
   - dot-prefixed files/dirs (`.git`, `.DS_Store`, etc.)
   - `node_modules`
   - existing `*.cindy` files (prevents archive nesting)
2. Use `jszip` (or any ZIP library) with DEFLATE compression at level 9.
3. The output filename is `<id>-<version>.cindy` (from `ghost.json`), placed
   in the plugin source directory.

Example with Node.js:
```js
const JSZip = require("jszip");
const dir = "<plugin-source-dir>";
const manifest = JSON.parse(fs.readFileSync(dir + "/ghost.json", "utf8"));
const out = dir + "/" + manifest.id + "-" + manifest.version + ".cindy";
// walk dir recursively, skip dot-files/node_modules/*.cindy,
// zip.file(relPath, buffer), then zip.generateAsync({type:"nodebuffer",
// compression:"DEFLATE", compressionOptions:{level:9}})
```

## Installing the plugin

The preferred path is opening the `.cindy` file with Cindy
(`C:\Program Files\Cindy\Cindy.exe <path>` on Windows).

If the dialog does not appear (Cindy may silently reject invalid manifests
without a visible error), check `C:\Users\<user>\AppData\Roaming\Cindy\logs\
main-<date>.log` for `GHOST_FILE_INVALID` errors.

As a fallback, copy plugin source files directly into the installed plugin
directory at `C:\Users\<user>\AppData\Roaming\Cindy\owners\<owner-id>\
cindy-brain\<plugin-id>\`, then restart Cindy.

## Release checklist

1. Bump `packages/cindy-adapter/package.json` 4th segment.
2. Bump `packages/cindy-adapter/plugin/ghost.json` `version` to match.
3. Verify `skill.items` has ≤ 4 entries.
4. Run `npm run sync:template-versions` then `npm run sync:shared-skills`.
5. Run `npm run check`.
6. Classify all worktree changes; commit only release-relevant content.
7. Verify `git status --porcelain` is empty.
8. `git push origin main`.
9. `npm run verify:release` must pass.
10. Tag: `git tag -a vcindy-<version> -m "Cindy adapter v<version>"`
11. `git push origin vcindy-<version>`
12. Build `.cindy` package and open with Cindy.
13. Verify install in `main-<date>.log` (no `GHOST_FILE_INVALID`).
14. Restart Cindy to load the updated plugin.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `GHOST_FILE_INVALID 清单不合格: skill.items 最多 4 条` | Too many skill entries | Remove skills from manifest until ≤ 4 |
| Install dialog never appears | Manifest validation failed silently | Check logs, fix manifest, rebuild |
| `node.entry 不能与浏览器沙箱 entry 使用同一个文件` | `entry` and `node.entry` point to same file | Use different files |
| Plugin installed but old version active | Cindy uses cached version | Restart Cindy |
| `verify:release` fails on dirty worktree | Untracked dev files | Add local-only files to `.gitignore` first |
