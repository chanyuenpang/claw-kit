# create-claw-skill fallback

Use this plan-independent workflow when `create-claw-skill` contributes part of a stage owned by another workflow, or when the claw CLI/template is unavailable:

1. Inspect the source skill or distill the idea into its trigger, ordered workflow, tools, constraints, real branches, verification, and lifecycle handoff. If an existing `TEMPLATE.json` has no `version` or a version older than the current CLI, review and optimize the full package against the current contract instead of only bumping the field. Use `guidance.onPlanStart` only for a genuine discussion-to-execution delivery point; `claw plan start` is optional global syntax sugar, not a required template step.
2. Scaffold with `node <create-claw-skill-dir>/scripts/create-claw-skill-stub.mjs --skill-name <skill-name> --out <target-skill-package>`.
3. Replace the generated TODOs, preserve source behavior in the template, fallback document, and any necessary focused references, then keep the entry limited to task-ownership routing. Set the top-level template `version` to the current CLI version only after this review is complete.
4. When the claw CLI is available, run `claw template validate --file <target-skill-package>/TEMPLATE.json` and confirm the returned version equals the CLI version; always validate the skill structure and complete the content coverage mapping. For every task reported in `choiceRequiredTasks`, exercise live guidance and confirm `completionChoices` is the only valid-id list, `commandHints` contains one `claw task done --id <id> --choice <choice>` template, and `nextsteps` does not repeat the ids.

Do not add `guidance.onDone.choices` unless the choice changes the immediate downstream task or route.
Do not add `guidance.onPlanStart` to an executable template that can start directly in `process.active`; without it, use ordinary task guidance and plan/task mutations.
Do not describe the CLI input as `choiceId`: that is the persisted plan field. Agents select a route with `--choice`.
For independently owned subplans on Goal Mode hosts, require the returned handoff to complete the active parent goal before the child plan creates its own goal; never overwrite the parent goal.

For the concise out-of-date upgrade route, follow `references/template-upgrade.md`.
