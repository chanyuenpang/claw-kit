# Execute-first validation engineering

## Error fidelity after execution

Error cause and execution disposition are independent. A safe original code such as EACCES or ECONNRESET identifies an observed failure; it is not evidence that the business operation did not commit. Only the mutation owner or its exact canonical receipt supplies phase/outcome/effect evidence. Parent and child operations carry their own operation/resource/correlation, so a child no-write refusal cannot erase a parent's partial or committed effects.

Use the Core pure failure codec for Core/CLI and distributed Host diagnostics. Preserve safe owner code spelling and bounded message/cause; do not require constructor identity, prefix-renormalize codes, or mine uppercase words from free text as authority. A missing code gets a stable operation-specific fallback and an honest reason, not a guessed root cause. Existing JSON/identity/path/claim checks remain with their owners; this is not a new preflight or capability gate.

A failed readonly recovery is a secondary diagnostic. Reopening, parsing, catalog reads and persistence warnings must not replace the primary send failure. Successful business replies remain successful when activity bookkeeping or a Host projection fails, with a separately visible post-command/effect warning. Accepted delivery and uncertain receipt persistence are separate facts. Unknown/accepted never licenses resending; a known rejection permits a fallback only when the existing owner explicitly rejected before effects, not merely because its outcome is known.

Diagnostic normalization is bounded before string processing (4096 input characters, 768 message characters, depth 3, total 12 nodes, at most 3 secondary entries). Getter/cycle/formatting failures remain diagnostics, not replacements for readable primary facts. Credentials, inline prompt/payload bodies, URLs and personal/UNC paths are redacted. Execution context uses the same redaction and limits; scope/correlation identifiers remain useful, and no raw transcript is persisted.

Standalone Host artifacts bundle the same codec, not their own business rules. Fresh source build/check/composition verifies generated contract drift; frozen tested candidates are not regenerated. The Codex serialized driver has its own cache revision and embeds that same pure codec. This engineering check is not runtime shadow authorization.

Regression checks emphasize one owner call, same cause with different outcomes, parent/child scope, no fallback after partial/unknown/accepted, redaction and diagnostics that fail without hiding the original. Historic generic-only records may have permanently lost their cause; do not replay production to manufacture evidence.


This policy applies to every package, host adapter, CLI entry, service, hook, and tool in this repository. Validation is not automatically beneficial: a false positive can discard a correct operation, lose one unit of progress, strand durable state, and force unnecessary user recovery.

## Default rule

Call the authoritative business owner once and return its real result. Add a preflight hard gate only when allowing the call can cause a serious, non-recoverable effect that cannot be contained by the owner or verified afterward.

The burden of proof belongs to the hard gate. “Safer”, “stricter”, “consistent”, or “defensive” are not sufficient reasons.

## Three responsibility labels

### Authority Guard

A guard protects an authority fact before an irreversible effect. Valid examples include:

- host-owned actor, session, workspace, and scoped operation identity;
- path containment and symlink escape prevention before granting write access;
- canonical compare-and-set, claim token, delivery key, or immutable executor identity;
- a proven duplicate target when the business API can only address an ambiguous name;
- preventing a resend after an accepted or outcome-unknown mutation/send.

An Authority Guard must be implemented by the owner of the side effect whenever possible. Adapters must not reproduce Host or Core authorization as a stricter shadow policy.

### Recovery Adapter

Recovery translates a real result into `committed`, `rejected`, `partial`, or `unknown`, then reconciles the exact affected resource. It does not predict success and does not create a second canonical state.

- Read-only observations may receive one immediate retry when that is cheaper than blocking.
- A mutation or send is never retried after its outcome becomes unknown.
- Unknown affects only the exact operation/resource; unrelated reads and work continue.
- Positive canonical evidence may recover a lost acknowledgement.

### Error Fidelity

Execute-first depends on preserving the real owner's rejection. Normalize structured failures into a safe code, operation phase, and correlation identity; redact user content, paths, tokens, and unbounded exception text. When the owner supplies no safe code, use a stable phase-specific category such as `MEMBER_START_REJECTED`, not a generic catch-all. Investigate the owner failure before changing routing or validation.

Error text is diagnostic data, never retry authorization. A mutation or send is not replayed because its message looks transient. Do not add a preflight merely to hide a runtime rejection; fix the call, downgrade an advisory dependency, or retain the actionable owner error.

### Advisory Observation

Capabilities, catalogs, descriptions, versions, model preferences, projected schemas, UI state, caches, diagnostics, and optional metadata are advisory unless their owner explicitly makes them authoritative.

Advisory failure produces a bounded warning, an `unknown` display value, or a different callable route. It must not become permission, identity, or success evidence.

## Required hard-gate record

Every new or materially tightened preflight must state in the design, ADR, or code review:

1. **Protected fact** — the exact invariant.
2. **Unique owner** — the component that owns the write or authority.
3. **Evidence** — why the input is authoritative rather than a projection or cache.
4. **False-negative harm** — the worst result if the gate is absent.
5. **False-positive harm** — the correct progress that an incorrect rejection loses.
6. **Why preflight is necessary** — why the owner call or a postcondition cannot contain the harm.
7. **Failure scope** — the smallest resource that must stop.

If these cannot be answered, do not add the gate. Remove it or move it to the owner call, a postcondition, or diagnostics.

## Natural tool use

When a Host exposes a tool to an exact Agent and supplies its session/workspace, a schema-conforming call should reach the real business method without extra adapter ceremony.

- Tool/schema discovery is a route hint, not a second permission system.
- Provider/model catalogs refine optional launch parameters; they do not override callable Host methods.
- Additive metadata and unknown non-authority fields should be forward-compatible.
- Do not require full catalog cleanliness to act on a known exact target.
- Do not require UI/plugin/version projections to prove runtime business capability.

## Side-effect critical section

For a mutation or send, keep the critical path short:

1. establish host-owned identity and the canonical target;
2. reserve the exact operation when duplicate effects matter;
3. obtain the current owner method;
4. persist the durable attempted marker;
5. invoke the owner exactly once;
6. persist accepted/rejected evidence or mark the exact operation unknown.

Do not insert capability, catalog, model, version, maintenance, or projection checks between `attempted` and the real call. Such checks can manufacture false unknown outcomes without any side effect.

## Review checklist

For every changed validation:

- Is this an authority fact, recovery evidence, or advisory observation?
- Is the same fact checked in another layer? If yes, keep one owner.
- Does this reject a natural call before the business method could decide?
- Does exact equality depend on descriptions, JSON serialization, object identity, ordering, versions, or optional fields?
- Can an unrelated diagnostic block a known target?
- Can a successful canonical mutation be reported as failed because a Goal, UI, cache, index, or alert update failed?
- Is a `deferred` result merely a renamed hard rejection that never calls the owner?
- After `attempted`, is there any code other than the single owner call and receipt persistence?

## Verification guidance

Prefer assertions about outcomes and call counts:

- the owner method is invoked exactly once on the natural path;
- authority violations produce zero side effects;
- advisory drift does not prevent a valid owner call;
- canonical success is not rolled back by projection or maintenance failure;
- accepted and unknown operations are never resent;
- recovery uses positive evidence for the same identity.

Do not add brittle snapshots for every optional metadata field. Removing ceremonial validation does not require replacing it with an equal number of tests.
