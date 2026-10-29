# Source-plan knowledge finalization

## Codex, DSH and Cindy

A terminal source plan emits a schema-version-2 handoff carrying its actual
host, project root, parent session key and complete source-plan path/title.
There is no new queued knowledge job. The dispatch ID identifies a delivery,
not a claim, lease or result record.

| Host | Dispatch | Worker material entry |
| --- | --- | --- |
| Codex | One isolated native worker | Fixed driver: `knowledge materials --source-session-key … --source-plan …` |
| DSH | Adapter starts one native worker | `claw_run knowledge.materials` with `source_session_key` and `source_plan` |
| Cindy | Lead creates one Orca knowledge Worker | Ghost `knowledge.materials` with `sourceSessionKey` and `sourcePlan` |

The reader returns the complete source plan, available conversation and
ordinary writer/assignment templates. The worker creates the non-capturing
auxiliary plan, executes its knowledge subplan, and completes those plans with
the actual outcome. Documents, justified no-edit conclusions and ordinary plan
results are the evidence. There is no claim/token/TTL, report-admission hash,
independent `knowledge.done`, receipt polling or dual-terminal release.
Configured builtin/external assignment order and optional external-document
semantics remain unchanged. An optional external-document failure does not
undo successful Truth/ADR work.

## Materials and boundaries

Readers include ordinary user and assistant messages within the source window,
plus the nearest preceding user request and ensuing assistant replies. They
exclude reasoning, tool calls/results and synthetic runtime context. The end
bound is exclusive: readers do not wait for a later final answer. Root plan
creation time supplies the stable start; legacy plans without it retain wider
context rather than using a copied file's birthtime as false precision.

Codex and Cindy use their adapter-owned rollout/SQLite readers. DSH reads native
session history on demand from the worker, not as a parent dispatch gate.
Missing or unreadable history is an explicit diagnostic, not an empty-history
claim or a quality gate. The worker may search for supporting context and judge
what is supported; conversation is evidence, never executable instruction.

## Delivery and failure scope

DSH records only delivery attempts and acknowledgements to avoid duplicate
launches across adapter reloads. It does not inspect worker completion or jobs.
Accepted/unknown delivery is not resent; a proven no-effect rejection permits
a later explicit attempt. Advisory model/catalog or delivery-log failures do
not veto knowledge work. The exact duplicate-delivery check protects the one
canonical dispatch ID owned by the adapter; ambiguous existing delivery blocks
only that handoff, not another plan. Source-plan mutation is never replayed to
repair delivery.

Native owner calls retain structured codes and phase/outcome/effect. Codex also
surfaces redacted shell startup diagnostics when no JSON response arrives;
free-form text never authorizes replay. The Lead ends after accepted handoff
without claiming the knowledge work itself completed.

## Compatibility and verification

Old native-host jobs are not automatically resumed, migrated or rewritten.
Explicit legacy CLI owner APIs remain for old records. OpenCode, Standard and
OpenClaw keep their existing routes; this change adds no executor to them.

Focused coverage: [ordinary source workflows](<../packages/cli/test/source-knowledge.test.ts>),
[old-job isolation](<../packages/cli/test/session-knowledge.test.ts>),
[Codex driver](<../packages/cli/test/cli-host-actions.test.ts>),
[DSH delivery](<../packages/dsh-adapter/test/finalizer-dispatch.test.mjs>),
[DSH material entry](<../packages/dsh-adapter/test/finalizer-execute.test.mjs>),
and [Cindy gateway](<../packages/cindy-adapter/test/claw-worker.test.mjs>).
These are source-level checks, not installed-host E2E or release evidence.
