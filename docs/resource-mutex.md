# Crash-safe local resource mutexes

Core owns resource exclusion for synchronous writes, opportunistic maintenance and asynchronous focus/session queues. The existing wrapper APIs and lock ordering remain unchanged; adapters must not implement their own stale-lock cleanup. This contract covers one machine and a local filesystem with working SQLite file locks. SMB/NFS and multi-machine writers are not supported by this change.

## Occupancy and recovery

Each canonical resource directory/path has a stable adjacent `*.mutex.sqlite` file and a dedicated connection. `BEGIN IMMEDIATE` acquires an OS-managed SQLite reservation. Closing the connection, including process termination, releases that reservation; the empty database can remain. On Windows the SQLite connection receives the extended-length spelling of that same canonical pathname, so resources beyond `MAX_PATH` remain lockable without changing lock identity. File existence, mtime, PID and heartbeat age are never proof of occupancy or permission to steal a lock. Do not delete or replace mutex files while any writer can run: doing so creates a second lock identity. Directory aliases resolve to the same sidecar; resources are pathname identities, not target inode identities (atomic replacement is allowed).

SQLite stores no application state in the mutex. Releasing a lock does not undo a partially written plan or replay a mutation. Existing canonical revisions and focus journals still own commit/recovery. Only acquisition may retry; an action error, including `PLAN_WRITE_CONFLICT` or an unknown outcome, propagates without replay.

Synchronous writers fail fast. Optional maintenance skips acquisition contention. Async queues use zero SQLite busy timeout and bounded asynchronous polling, so a waiter cannot block a holder on the same event loop. Different resources use different databases. Busy errors retain `PLAN_WRITE_CONFLICT` with `phase: acquire`, resource/lock paths and reason (`busy` or `legacy-lock`); queue timeout includes its wait budget. Other SQLite/filesystem errors are not treated as contention.

## Upgrade from occupancy files

Stop **all** CLI/daemon/adapter writers sharing the project and session storage before upgrading them together. Mixed old/new writers are unsupported: the previous version does not participate in SQLite exclusion. The implementation checks the exact old `.lock` or queue-owner path before and after acquisition, but this cannot fence an old binary started later.

Existing old files are preserved and reported as `reason: legacy-lock`; queues do not infer safety from a dead PID or old timestamp. With all writers stopped, back up only the exact reported old occupancy file out of the way, upgrade/restart all writers, then recover through the normal entry. Do not recursively delete locks or remove the new SQLite files as routine recovery. New-version process crashes need no manual lock cleanup.

The legacy-file gate protects the exact resource against a possibly active old-protocol writer. Core is its only owner, and the exact old occupancy path is the protocol evidence. Concurrent old/new effects could corrupt canonical state before a postcondition could contain them; the business action cannot repair this after the fact. False positives from abandoned files require a one-time offline backup, not a project-wide ban. Optional maintenance may skip; unrelated resources remain available. This is a protocol transition boundary, not PID/version/catalog shadow authorization.

## Recovery entry and maintenance

A completed task-layout migration with no leftover marker returns without taking the maintenance mutex. Necessary migration/marker cleanup still takes the authoritative lock and propagates real failures. Both migration completion and daily maintenance stamps are written atomically, preserving the monotonic completion fact for concurrent recovery reads. Focus-journal repair is not skipped or reclassified as an empty workflow.

## Verification

[Core mutex regressions](../packages/core/test/resource-mutex.test.ts) use real child processes for exclusion, crash release, simultaneous updates and async waiting, plus directory aliases, preserved legacy/invalid files and migration fast paths. Existing plan-edit and focus-recovery regressions cover the wrappers. [CLI recovery regressions](../packages/cli/test/cli-project.test.ts) verify that an exact session-bound workflow is restored despite a leftover legacy maintenance lock. Tests use temporary resources, not the live project state.

Validation on 2026-11-11 (Windows, Node 24.12): Core build and all 317 Core tests pass, including a real-process long-path regression. The original 13 failures were classified against the source-plan handoff ADR: 12 obsolete job/capture expectations and one CommonJS fixture inheriting the user home module type. Tests now assert the new no-implicit-job boundary while retaining explicit legacy claim/cancellation coverage. Broader CLI verification exposed an actual Windows SQLite long-path defect; the same isolated session/subplan test failed before the extended-path fix and passes after it. DSH build/tests/type check pass. CLI full-suite verification and release/install remain separate checkpoints. No POSIX run or network-filesystem certification was performed.
