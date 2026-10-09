# ADR: Execute-first validation and single-owner authority

## Context

Adapters, CLI entries, Core services, hooks, and tools had accumulated overlapping preflights for schemas, provider catalogs, descriptions, versions, projections, service objects, and canonical state. Several checks rejected valid DSH work before the Host or Core owner was called, including native finalizer admission and semantic role reuse. A false positive loses a correct unit of progress and creates user recovery work; strictness is therefore not free safety.

## Decision

Repository development follows execute-first validation engineering.

- **Authority Guard** is the only normal preflight hard gate. It protects host-owned identity/workspace/operation scope, path containment, canonical compare-and-set/claim/delivery identity, and proven duplicate irreversible effects. The side-effect owner performs the check whenever possible.
- **Recovery Adapter** maps actual results to committed/rejected/partial/unknown and reconciles only the exact resource. Read-only evidence may be retried once; mutations and sends are never replayed after unknown.
- **Advisory Observation** covers capabilities, catalogs, descriptions, provider/model preferences, versions, projected schemas, UI state, diagnostics, caches, and optional metadata. It may guide routing or emit bounded diagnostics but cannot become shadow authorization or success evidence.
- **Error Fidelity** preserves the business owner's safe structured code, operation phase, and correlation while redacting content, paths and tokens. Phase-specific fallbacks are permitted only when no structured code exists. Generic failure collapse, preflights added to hide runtime errors, and free-text-driven retries are rejected.

Every new hard preflight has the burden of proving its protected fact, unique owner, authoritative evidence, false-negative harm, false-positive harm, inability to defer to the owner/postcondition, and minimal failure scope. Without that proof it is removed or downgraded.

A natural schema-conforming tool call exposed by the Host to an exact Agent should reach the Host/Core business owner. For duplicate-sensitive effects, the critical section is identity/target → reserve → acquire current owner method → durable attempted → exactly one call → receipt/unknown. No advisory recheck is allowed between attempted and the call.

The detailed review and test contract is [Execute-first validation engineering](<../../../docs/validation-engineering.md>).

## Alternatives

“Validate everything before doing anything” was rejected because projections and caches cannot eliminate time-of-check/time-of-use changes and false positives block correct work. Blind pass-through was rejected because actor/workspace authority, path escape, canonical conflicts, and duplicate irreversible effects cannot always be repaired afterward. A global validation score, fallback router, retry engine, or second state database was rejected as more ceremony and another source of truth.

## Consequences

### Known cause does not settle unknown effects

The current source uses one Core-owned pure failure codec through CLI and generated Host contracts. Codes/messages identify safe observed reasons; phase/outcome/effect come from the actual scoped write owner or an exact receipt. An outer operation cannot borrow an inner operation's known-none disposition, or discard its possibly durable effects. Resource/correlation and nested cause keep scope visible without adding a registry or state machine.

Adapters do not add preflight qualification. They execute once, preserve owner evidence, and use only bounded after-failure readonly diagnosis. Unsupported-operation fallback must not replay an operation whose returned evidence is partial/unknown/committed. Cause recognition never authorizes retry by exception type or message text. Confirmed accepted send survives acknowledgement persistence failure; post-command bookkeeping and Host effects do not undo canonical success.

Generated codecs are checked by fresh artifact/build owners, not runtime gates. Diagnostic getters, cause cycles, credentials/private paths and inline payloads are handled at the sole codec, keeping primary evidence intact and secondary failures visible. The older 4791 admission record retained only a generic code/category and cannot prove the original reason or absence of external effects; no production replay is used to fill that gap.


Code review evaluates both missed-invalid and rejected-valid behavior. Normal tests prefer owner call counts, canonical outcomes, zero side effects for authority violations, and no resend after accepted/unknown; they do not freeze every advisory field. Existing host-specific checks must be classified and migrated incrementally. A `deferred` label is not sufficient if the real owner is never called without an irreversible-risk justification. This policy applies to all current and future hosts and features.
