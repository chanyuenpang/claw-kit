# Claw Runtime State and Cleanup Specification

Status: canonical design baseline, 2026-07-30

This document defines where Core and platform adapters may write runtime state,
how each state class is retained, and which cleanup process owns it. It exists
to prevent Codex, Cindy, OpenCode, and future adapters from creating unrelated
temporary layouts that grow without bound or delete recoverable workflow data.

The workflow plan is canonical only while it is within its retention window.
Workflow files are temporary operational state; they are classified by their
recovery value and age, not by which adapter created them.

## 1. Normative rules

The words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are normative.

1. Every new runtime file MUST belong to one state class below.
2. Every temporary or recoverable file MUST have an owner, creation/update time,
   and a cleanup policy. Prefer a sidecar manifest when the filename alone is
   not sufficient.
3. Adapters MUST write only inside the runtime root supplied by Core or the
   host. They MUST NOT invent a second `.claw` directory or write beside the
   user's source files.
4. Adapters MUST NOT delete project configuration or durable project knowledge
   as part of routine cleanup. Workflow task plans, reports, bindings, runtime
   records, and archives are temporary and MUST be subject to retention.
5. Daily maintenance is the cleanup owner. Adapters MAY request maintenance or
   leave an explicit cleanup record, but MUST NOT independently sweep Core-owned
   directories.
6. Cleanup MUST be fail-open: a locked, malformed, or currently active item is
   skipped and reported rather than forcibly deleted.
7. A cleanup pass MUST be idempotent and safe to run concurrently through the
   existing maintenance lock.

## 2. State classes

The runtime model intentionally has only three classes. New runtime data MUST
fit one of them; a separate registry is not required.

### 2.1 Durable data — never routine-delete

Only project-owned configuration and durable knowledge are outside routine task
retention:

- `.claw/project.json`
- `.claw/project-override.json`
- `.claw/truth/**`

Adapters MUST treat these files as read-only except through Core operations.

### 2.2 Task data — TTL cleanup

All task-scoped workflow state is temporary, including incomplete work:

- `.claw/tasks/**/plan.json`
- `.claw/tasks/**/plan.report`
- `.claw/archive/tasks/**`
- `.claw/runtime/session-bindings.json`
- `~/.claw/runtime/sessions/<session-hash>/session.json`
- `.claw/runtime/knowledge-sessions/**`
- queued, failed, or terminal knowledge finalization jobs
- adapter continuation/recovery records when they are persisted by Core

These files MUST use an explicit last-seen or updated timestamp. Cleanup MAY
remove an incomplete task after its TTL; active status alone is not permanent
retention. A recent update or valid lease delays cleanup, but never removes the
retention deadline indefinitely.

Default workflow task/archive TTL is 30 days. Default session and binding TTL is
seven days. Knowledge jobs use the containing task's TTL unless a shorter retry
retention policy applies.

Archive is a lifecycle stage of task data, not a fourth storage class. Archive
eligibility, `maxTasksToKeep`, and final TTL deletion remain separate policies.

### 2.3 Runtime temporary data — owner-specific cleanup

This class contains disposable intermediate output:

- `.claw/runtime/tmp/**`
- `<task>/.runtime/tmp/**`
- adapter-specific temporary files under the supplied runtime root
- one-shot status files, staging files, and intermediate serialization output

Temporary files MUST use one of these forms:

```text
<name>.tmp
<name>.work
<name>.status.json
```

If a temporary item may survive a process crash, it MUST include a sidecar or
JSON envelope with `createdAt`, `updatedAt`, `owner`, and `expiresAt`. Cleanup
removes only expired items. An active lock, PID marker, or lease MUST protect
work still in progress.

New code SHOULD use an explicit adapter or task subdirectory and an expiry
record. Legacy layouts are not a compatibility contract; unsupported legacy
temporary files MAY be removed during migration.

Caches and process state are runtime temporary data, but they remain owned by
their producing subsystem:

- embedding/model caches;
- search or embedding daemon runtime directories;
- host/plugin installation caches;
- sockets, ports, PID files, and lock files owned by a running process.

The component that owns a cache or daemon MUST provide its cleanup/reconcile
operation. Daily project maintenance MUST NOT recursively delete a cache or
daemon state it does not own. Stale process state MAY be removed only after
ownership and process liveness checks.

## 3. Standard runtime layout

Project-scoped runtime files SHOULD follow this layout:

```text
.claw/
  runtime/
    maintenance.json
    session-bindings.json
    tmp/<adapter>/<session-key>/...
    knowledge-sessions/<session-hash>.json
  tasks/<date>/<task>/
    plan.json
    plan.report
    .runtime/
      knowledge-finalization/<finalize-id>.json
      tmp/<adapter>/...
  logs/<category>/...
```

Session-scoped workflows use the same structure below the session runtime
root. The adapter receives that root from Core and MUST NOT depend on a fixed
home-directory path.

Adapter names MUST be lowercase stable identifiers (`cindy`, `codex`,
`opencode`, etc.). Session keys MUST be hashed or otherwise path-safe; raw
provider, thread, or user text MUST NOT become a path segment.

## 4. Runtime timestamps

New JSON task or temporary records SHOULD carry these fields when they may
survive a process crash:

```json
{
  "createdAt": "2026-07-30T00:00:00.000Z",
  "updatedAt": "2026-07-30T00:00:00.000Z",
  "expiresAt": "2026-07-31T00:00:00.000Z"
}
```

The filename or containing directory may supply owner and scope. A full
envelope is optional; the minimum requirement is a reliable last-updated time
and a known TTL.

## 5. Cleanup ownership and cadence

| State | Owner | Default policy | Cleanup trigger |
| --- | --- | --- | --- |
| Project config/truth | Core + explicit user action | Never routine-delete | explicit migration/user action |
| Task plan/report/archive | Core | 30-day inactivity TTL | daily maintenance |
| Session workflow state/bindings | Core | 7-day idle TTL | daily maintenance |
| Knowledge jobs | Core knowledge sidecar | containing-task TTL or shorter retry retention | daily maintenance + job sweep |
| Temporary work products | Core maintenance | expired/one-day TTL | daily maintenance |
| Project logs | Core maintenance | date/retention policy | daily maintenance |
| Model/search/embedding cache | owning subsystem | subsystem policy | subsystem reconcile |
| Host/plugin cache | host/adapter owner | host policy | host update/uninstall |

Adapters MUST report cleanup failures with a category and path class, but must
not turn cleanup failure into prompt failure.

## 6. Adapter contract

Every adapter reference MUST document, in a short runtime-data table:

1. its runtime root and whether it is project- or session-scoped;
2. the data class, cleanup owner, and TTL for its runtime files;
3. how active work is protected from cleanup;
4. how a restart reconstructs or discards the state.

For Cindy specifically:

- the resident plugin's in-memory maps are disposable projections, not
  canonical state;
- Node worker temporary output MUST go under Core-provided runtime paths;
- card identity and UI state MAY be lost on plugin restart and must be rebuilt
  from the latest typed plan projection;
- report capture and knowledge finalization records MUST remain recoverable and
  MUST NOT be placed in the disposable temporary directory.

## 7. Five-rule review checklist

When adding a runtime file, review:

- Is it durable data, task data, or runtime temporary data?
- What is its TTL and who cleans it?
- Can a process crash leave it behind?
- Can cleanup distinguish active from stale?
- Can a restart rebuild it or safely discard it?

No adapter is complete if its non-durable runtime files do not have a finite
retention policy and a single cleanup owner.
