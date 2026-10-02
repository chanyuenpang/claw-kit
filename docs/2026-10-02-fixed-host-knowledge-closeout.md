# Fixed host knowledge closeout

Knowledge execution belongs to the invoking adapter. The project, personal override, templates and dispatch protocol no longer expose executionPolicy or policy.

| Host | Fixed flow |
| --- | --- |
| Codex | Terminal queued job, native isolated finalizer, claim-time adapter collector |
| Cindy | Terminal queued job, Orca Worker, claim-time adapter collector |
| DSH | Terminal queued job, admitted native executor, bounded adapter capture |
| OpenCode | Idle capture, adapter-owned detached writer |
| Standard / hostless | Agent-memory prepare, ordered assignments, complete |

Writer content settings remain configurable, including externalSkills, model, reasoningEffort and datedSectionsToKeep; per-host overrides affect those fields only.

Legacy executionPolicy fields are discarded by readers and protocol repair. New configuration writes reject the removed field. Old queued jobs require a supported host and capture ownership before a new claim; unsupported jobs become failed without an execution token. Existing running claims may still report their terminal result with the original token. No historical bulk rewrite or cross-executor fallback occurs.

Canonical plan completion does not imply asynchronous knowledge completion. TTL, immutable capture boundaries, claim tokens and DSH admission rules remain in force.

Codex packages only SessionStart and its claim-time collector. The actual loaded plugin directory is carried by the adapter bootstrap to register the collector; the CLI does not guess cache paths. Successful task.done receipts bind the immediately preceding assistant conclusion to the frozen parent interval. Stop hooks, SDK dependencies and alternate launchers are removed.

This decision supersedes the execution-policy sections of [the earlier design](2026-07-30-knowledge-finalization-execution-design.md).
