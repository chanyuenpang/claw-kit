# Doc updater fallback

Use the supplied finalization evidence and resulting canonical Truth/ADR state
to update only existing documents inside the frozen external documentation
paths. Do not create, move, rename, standardize, or otherwise expand the
external documentation corpus.

Inspect candidate documents before editing. Distinguish current-state claims
from requirements, history, examples, and future design; update only safely
resolved stale or conflicting current-state claims. Preserve each document's
language, structure, conventions, and unrelated user edits.

Verify the affected corpus with focused and exact identifier searches. It is a
valid no-edit result when no existing document is affected or an ambiguity
cannot be resolved safely. Return changed paths or the evidence-backed no-edit
reason.
