---
name: gitnexus-cli
description: "Use for GitNexus setup, CLI indexing, status, cleanup, wiki, and index upgrades. Check repository .gitnexusrc and existing index coverage before rebuilding an older index."
---

# GitNexus CLI Commands

Use one command alias in the session so every CLI/MCP call stays on one version line. After `setup`, use `~/.gitnexus/config.json` as the CLI package spec source (`cliPackageSpec` first, then `cliVersion`). MCP wiring and skill install locations are scope-dependent (`project` vs `global`).

### setup — choose scope explicitly

```bash
gitnexus setup --scope project --agent codex --cli-spec @veewo/gitnexus@<version>
```

Rules:

- If user asks "setup this repository" / "本仓库 setup", use `--scope project`.
- `--scope project` updates repo-local files:
  - Codex MCP config: `.codex/config.toml`
  - Skills: `.agents/skills/gitnexus/`
- `--scope global` updates user-global files:
  - Codex MCP config: `~/.codex/config.toml`
  - Skills: `~/.agents/skills/gitnexus/`
- `--scope global` does not overwrite repo-local `.agents/skills` or `.codex/config.toml`.
- `--coding-agent <agents>` selects the upstream detected-editor installer explicitly; it is separate from fork `--scope` / `--agent` wiring.
- Never rely on setup defaults for scope; pass `--scope` explicitly to avoid global/project mismatch.
- Project `setup` previews a `.gitnexusrc` plan. Terminal use asks for missing scope/extensions and confirmation. In scripts, default `auto` reports `pending`; use `--rc-mode migrate --accept-rc` for a complete old receipt or `--rc-mode create --rc-scope Assets/,Packages/ --rc-extensions .cs,.meta --accept-rc` for explicit choices. Use `all` for a deliberate full selection. `--scope` still chooses installation location; `--rc-scope` chooses analysis paths. Global setup and `--coding-agent` do not create rc files.

```bash
if command -v gitnexus >/dev/null 2>&1; then
  GN="gitnexus"
else
  GITNEXUS_CLI_SPEC="$(
    node -e 'const fs=require("fs");const os=require("os");const path=require("path");
    try {
      const raw=fs.readFileSync(path.join(os.homedir(),".gitnexus","config.json"),"utf8");
      const parsed=JSON.parse(raw);
      const spec=typeof parsed.cliPackageSpec==="string" && parsed.cliPackageSpec.trim()
        ? parsed.cliPackageSpec.trim()
        : typeof parsed.cliVersion==="string" && parsed.cliVersion.trim()
          ? `@veewo/gitnexus@${parsed.cliVersion.trim()}`
          : "";
      if (spec) process.stdout.write(spec);
    } catch {}'
  )"
  if [ -z "$GITNEXUS_CLI_SPEC" ]; then
    echo "Missing GitNexus CLI package spec in ~/.gitnexus/config.json. Run gitnexus setup --cli-spec <packageSpec> first." >&2
    exit 1
  fi
  GN="npx -y ${GITNEXUS_CLI_SPEC}"
fi
```

## Commands

### analyze — Build or refresh the index

Run `$GN analyze` from the repository root. Recurring defaults live in a committed `.gitnexusrc`; explicit CLI flags override them. `gitnexus.json` (with a legacy `meta.json` mirror) is index state and does not supply analyze option defaults.

Before rebuilding an existing index after a CLI upgrade:

1. Check `$GN --version`, `$GN status --json`, and whether `.gitnexusrc` exists. A stale runner identity means the index needs rebuilding with the current CLI; it does not identify the LadybugDB file format. `gitnexus doctor` checks the current runtime and extension, not the persisted database version.
2. Read `.gitnexus/gitnexus.json` (or legacy `.gitnexus/meta.json`) for its last successful `indexCoverage.scopeRules` and `indexCoverage.includeExtensions`. Legacy `analyzeOptions`, when present, may provide a clue. These are records of the old run, never defaults for the next one. If neither records the old selection, do not infer scope from `fileHashes` or `analysisInputFingerprint`.
3. If `.gitnexusrc` is absent, show the available old selection and ask the user to confirm the intended scope, extensions, repository name, and C# project before writing `.gitnexusrc` and rebuilding. If no trustworthy selection remains, ask whether to index the whole repository or a chosen subset. An unconfigured `$GN analyze --force` uses built-in defaults and may expand a formerly scoped index.
4. Use project `setup` to preview and confirm the rc migration when MCP wiring, skills, or the CLI pin also need updating. Confirm `Analysis config: created` before rebuilding; `pending` means no new defaults were installed. Setup does not repair the database.

Unity example `.gitnexusrc`:

```json
{
  "name": "my-unity-project",
  "includeExtensions": [".cs", ".meta"],
  "scopeRules": ["Assets/", "Packages/com.veewo.*"],
  "csharpDefineCsproj": "Assembly-CSharp.csproj"
}
```

`csharpDefineCsproj` resolves relative to the target repository and selects active C# conditional-compilation branches while preserving source offsets. Scope rules are path prefixes; trailing `*` means prefix wildcard, not general glob syntax.

```bash
$GN analyze --force
# Temporary overrides:
$GN analyze --extensions .cs,.meta --scope Assets/,Packages/ --csharp-define-csproj Assembly-CSharp.csproj
```

Changes to effective scope/extensions or C# define symbols automatically rebuild the graph, even on a clean unchanged Git HEAD. External csproj symbol changes are included. Older indexes without an analysis-input receipt rebuild once; unchanged inputs retain the fast path.


Use `$GN analyze --help` for available flags. `--index-only` skips context and skill generation; `--skip-agents-md` and `--skip-skills` control those outputs separately. `--name` selects a registry name; `--repo-alias` is a compatibility alias.

`--max-file-size` (KiB; default 512) also limits lazy content reads during CSV export. Supplemental resource File nodes and their relationships are retained even when their text exceeds the limit; those nodes have empty `content`. Unity binding/lifecycle extraction is unaffected. Accepted files retain their full text under the `full` content-retention profile. `GITNEXUS_MAX_FILE_SIZE` supplies the same limit when no CLI override is given.

After a failed or timed-out analyze, report the exact error and inspect the cause before another run. For Unity runtime validation, use the shared runtime-process and hydration contracts below.

For Unity projects, analyze validates a separate content snapshot of source,
resources, metadata and consumed configuration. A compatible `unityInputReceipt`
allows unchanged content to reuse the index even when the worktree is dirty;
parse, scope resolution, Unity enrichment, graph writes and FTS are skipped.
Real input changes and legacy indexes without this receipt use a full staged
rebuild, retaining parser-cache reuse and existing embedding preservation.
`--force` and `--no-parse-cache` still force processing. Mixed source languages
whose external input closure is not covered do not use this shortcut.

`Unity inputs:` diagnostics report the decision and validation time. On
`input-failure`, fix the unreadable/unstable input and rerun; missing hashes must
never be treated as deletions. Staged Unity rebuilding requires a supported
atomic-swap configuration; unsupported Windows configurations fail before DB
mutation. This receipt governs analyze reuse; it is not a runtime-closure proof
or a replacement for status's existing coverage checks.

### status — Check index freshness

```bash
$GN status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

If `incompleteReasons` includes `unity-resource-analysis-failed`, inspect metadata's
`unityResourceFailures` for the affected paths. Resource reads or version checks
failed; empty resource evidence is not a complete result. Fix the file issue and
rerun analyze; the recorded failure forces a full retry. Skipped derived phases
retain the previous failure receipt.

For working-tree freshness, run `status` without `--repo`: it compares content
using the last successful analysis's `indexCoverage` scope/extensions and size
limit. Out-of-scope edits do not cause content drift; covered additions, edits
and removals still do. HEAD and analyzer identity checks also apply.

After changing scope/extensions in `.gitnexusrc`, run analyze to apply them.
For legacy receipts missing those filters, rerun analyze once with the intended
CLI flags or `.gitnexusrc` defaults to record coverage; until then status keeps a
conservative scan that may include out-of-scope additions. Metadata receipts
are index state, not option defaults. `status --repo` reports registered-index
availability rather than working-tree freshness.

### clean — Delete the index

```bash
$GN clean --force
```

Removes index data while preserving `.gitnexus/config.json`, `.gitnexus/meta.json`, and `.gitnexus/.gitnexusignore`. Recurring analyze defaults remain in the repository `.gitnexusrc`; the next analyze rebuilds derived data.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

### wiki — Generate documentation from the graph

```bash
$GN wiki
```

Generates repository documentation from the knowledge graph using an LLM. Requires an API key (saved to `~/.gitnexus/config.json` on first use).

| Flag                | Effect                                    |
| ------------------- | ----------------------------------------- |
| `--force`           | Force full regeneration                   |
| `--model <model>`   | LLM model (default: minimax/minimax-m2.5) |
| `--base-url <url>`  | LLM API base URL                          |
| `--api-key <key>`   | LLM API key                               |
| `--concurrency <n>` | Parallel LLM calls (default: 3)           |
| `--gist`            | Publish wiki as a public GitHub Gist      |

### list — Show all indexed repos

```bash
$GN list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

### query/context — Unity hydration mode

For Unity resource retrieval:

```bash
$GN context DoorObj --repo neonnew-core --file Assets/NEON/Code/Game/Doors/DoorObj.cs --unity-resources on --unity-hydration compact
```

```bash
$GN query "DoorObj binding" --repo neonnew-core --unity-resources on --unity-hydration compact
```

Rules:

- `--unity-hydration compact` is the default (fast path).
- If response `hydrationMeta.needsParityRetry=true`, rerun with `--unity-hydration parity`.
- `--unity-hydration parity` is completeness-first mode for advanced verification.

### Unity runtime process contract trigger

When CLI analysis targets Unity runtime process semantics (runtime chain closure/confidence), load:

- `_shared/unity-runtime-process-contract.md`

Runtime-process verification examples:

```bash
$GN query "Reload NEON.Game.Graph.Nodes.Reloads" --repo neonspark --unity-resources on --unity-hydration parity --runtime-chain-verify on-demand
```

```bash
$GN context ReloadNode --repo neonspark --unity-resources on --unity-hydration compact --runtime-chain-verify on-demand
```

### unity-ui-trace — Unity UI evidence tracing workflow

For full workflow details, load: `_shared/unity-ui-trace-contract.md`

```bash
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal asset_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/CoreScreen.uxml" --goal template_refs --repo neonspark
$GN unity-ui-trace "Assets/NEON/VeewoUI/Uxml/BarScreen/Patch/PatchItemPreview.uxml" --goal selector_bindings --selector-mode balanced --repo neonspark
```

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **Index is stale after re-analyzing**: Restart Claude Code to reload the MCP server
- **Embeddings slow**: Omit `--embeddings` (it's off by default) or set `OPENAI_API_KEY` for faster API-based embedding
- **`analyze --force` hangs or crashes**: Preserve the complete log and inspect the first database error. Confirm `.gitnexusrc` scope before another run. Common interruption clues include `.gitnexus/csv/` without `relations.csv`, or `.gitnexus/lbug.wal` beside a tiny `lbug` file; these clues alone do not establish the cause.
- **FTS build or `--repair-fts` fails**: Run `$GN doctor` to check FTS availability. If repair reports a missing index, inspect the complete earlier analyze log and the native error. `Table: 0_<index>_appears_info already exists` can mean an orphaned internal FTS table while the named index is absent. Do not treat this as a successful index build or edit LadybugDB internal tables by hand. After confirming `.gitnexusrc`, a fresh `analyze --force` rebuild can use a new staged database; preserve the old index and logs until the new index passes status and keyword-search checks.

## Runtime-Chain Closure Guard

- Treat runtime-chain outputs as two layers:
  - `verifier-core`: binary verifier result (`verified_full` | `failed`)
  - `policy-adjusted`: user-visible result after hydration policy is applied
- If `hydration_policy=strict` and `hydrationMeta.fallbackToCompact=true`, the result is downgraded policy-adjusted output and is not closure.
- In that downgraded state, rerun with parity before final conclusions.


## Additional analyze modes

- `--pdg` enables the control/data dependence and taint layers used by `pdg_query` and `explain`.
- `--asyncapi-spec <path>` imports an AsyncAPI contract alongside code analysis.
- `node .gitnexus/run.cjs <command>` selects an available runner and preserves a configured package pin. Before the runner exists, resolve `cliPackageSpec` / `cliVersion` from `~/.gitnexus/config.json`; `bunx <resolved-spec> analyze` is an alternative bootstrap when only Bun is installed.
