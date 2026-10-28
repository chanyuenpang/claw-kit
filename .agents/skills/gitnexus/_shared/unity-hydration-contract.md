# Unity Hydration Contract

When querying Unity resource evidence via `query` or `context`:

1. Call with `unity_resources: "on"` and `unity_hydration_mode: "compact"` (fast path).
2. Inspect `hydrationMeta` in the response:
   - `needsParityRetry: true` → rerun the same call with `unity_hydration_mode: "parity"`
   - `isComplete: true` → keep compact result
3. Treat `parity` as the completeness path for advanced verification only.

CLI equivalents: `--unity-resources on --unity-hydration compact` (or `parity`).

Build-time `unity-resource-analysis-failed` means some resource facts are incomplete.
Inspect the metadata failure paths and repair/reindex before relying on absent facts.
Query hydration still obeys its existing budgets and strict fallback/parity rules;
resource parsing success alone does not establish runtime closure.
