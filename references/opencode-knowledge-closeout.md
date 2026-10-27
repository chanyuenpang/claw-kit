# OpenCode native knowledge closeout

## Ownership and normal path

Foreground plan completion and session binding remain Core-owned and do not wait for knowledge deposition. Plugin failures never roll back plan.done.

1. The plugin captures the final assistant text at session.idle with the actual parent session identity. Core produces the canonical job and bootstrap.
2. Core reserves an opencodeExecution record before native session.create, binds the returned child ID, and records send-attempted before promptAsync. The plugin copies parent session permission rules; the writer agent does not grant blanket bash/edit permission. Host configuration and permission prompts still apply.
3. The child receives only the canonical bootstrap, uses its own CLAW_SESSION_ID, claims the job and completes through Core knowledge.done. Core alone owns claim authorization and final success/failure.
4. Native acceptance is not completion. Recovery inspects the persisted execution and canonical job status, including expiration; logs distinguish queued/running/terminal outcomes. No CLI executable lookup, global finalizer environment switch, or process spawn is needed for this route.

## Failure and authority boundaries

The persisted parent/project/child association is the authority for dispatch and claim. Only that parent may reserve or bind; only the bound child may claim after a send attempt. Deferring these checks until after dispatch could send the bootstrap to the wrong session or let another session consume the job. Reject only the affected operation, never unrelated plans. Missing association deliberately prevents claims rather than guessing a child from a title or directory scan.

Create-attempted, send-attempted and unknown survive plugin restarts and never authorize automatic replay. A lost create reply can leave an unassociated empty child; do not create another. A lost prompt reply may already be executing; the known child can still claim and complete. Rejected or unknown transport is visible independently of the canonical job status. Do not retry plan.done to repair it. Read the canonical receipt/status before considering any operator recovery; this adapter does not implement automatic redispatch.

Writer sessions are identified from Core records, not a process-wide flag. Their shell environment marks finalizer execution; startup plan prompts, idle capture and goal continuation are suppressed only for those sessions. Parent and sibling sessions remain ordinary sessions. If Core classification is unavailable, the adapter logs the failure and suppresses claw automation for that event without throwing through the host shell hook; this conservative result is not cached. It may temporarily suppress ordinary capture but prevents recursive deposition and does not stop ordinary host work.

Execution lives inside the current OpenCode service. Exiting that service can interrupt deposition; durable records prevent duplicate execution but do not promise a detached worker will survive shutdown. Pending is never reported as successful Truth/ADR deposition.

## Verification and code

- Core: [execution owner](../../core/src/opencode-finalizer-execution.ts), [claim and completion](../../core/src/knowledge-sidecar.ts).
- Adapter: [native dispatch and session hooks](../plugin/index.ts).
- Regressions cover parent/child authorization, immutable association, at-most-once creation/send across restart, resolved SDK rejection, unknown delivery, permission copying, and child-only recursion suppression.
- This route is the plugin's native closeout path. The older CLI runner remains for legacy CLI entry points; it is not a fallback on native dispatch failure.
