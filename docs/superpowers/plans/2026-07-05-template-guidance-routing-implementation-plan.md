# Template Guidance Routing Implementation Plan

## Goal

Translate the finalized template-guidance-routing design into a concrete implementation sequence for `claw-kit` core and CLI work.

This plan assumes the design decisions already settled in:

- `guidance.onDone` as the template task routing field
- `guidance.onDone.default` works even without `choices`
- route guidance supports `mergeMode: "override" | "replace"`
- route guidance may set `delegateTruth: false`
- `templateId` and `configOverride` persisted in runtime `plan.json`
- `task.choiceId` persisted in runtime task state
- `configOverride` sourced only from the template, not from ad hoc plan-create input
- one merged effective-config object used by workflow guidance and validation

## Scope

This implementation-prep round covers:

- exact type additions
- runtime helper boundaries
- plan-create integration points
- route-aware task-completion and done-transition validation touchpoints
- CLI contract additions
- regression test areas

This round does not implement the feature yet.

## Recommended implementation order

### 1. Extend core types

Update [packages/core/src/types.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/types.ts) with the new runtime fields and template override contract.

Recommended additions:

```ts
export type TemplateConfigOverride = {
  goalMode?: boolean;
  truthDispatch?: "per_task" | "final_only";
  externalPlanningSkill?: string | null;
  externalTruthSkill?: string | null;
  externalAdrSkill?: string | null;
};

export type PlanTask = {
  id: number;
  title: string;
  detail?: string;
  status: PlanTaskStatus;
  choiceId?: string;
  ...
};

export type PlanDocument = {
  title: string;
  templateId?: string;
  configOverride?: TemplateConfigOverride;
  status: PlanStatus;
  ...
};
```

Also add template-authoring types in the template loader layer for:

- top-level `configOverride`
- task-level `guidance.onDone`
- `guidance.onDone.default`
- route-choice entries
- `mergeMode`
- `delegateTruth`

Keep those template-only types out of the runtime `PlanDocument` contract.

### 2. Add a single effective-config merge helper

Create one shared helper in core that merges project config with the plan-scoped override.

Recommended shape:

```ts
resolvePlanEffectiveConfig(projectConfig, plan): ProjectConfig
```

Responsibilities:

- start from the already-resolved project config
- apply `plan.configOverride` if present
- return one merged object for downstream readers

Use this helper everywhere instead of reading `plan.configOverride` ad hoc.

Primary call sites:

- [packages/core/src/workflow-guidance.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/workflow-guidance.ts)
- [packages/core/src/plan.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/plan.ts)
- any future task-done helper
- done-transition validation

### 3. Extend template parsing and validation

Update [packages/core/src/plan-templates.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/plan-templates.ts) so project templates can declare:

- `configOverride`
- task-level `guidance.onDone`

Validation rules:

- reject unsupported `configOverride` keys
- reject malformed `guidance.onDone`
- reject malformed `mergeMode`
- reject malformed `delegateTruth`
- reject malformed choice ids or empty route payloads

The loader should keep the template as the authoritative route-definition source, but runtime `plan.json` must stay free of template-only guidance fields.

### 4. Update plan creation flow

Update [packages/core/src/plan.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/plan.ts) `createSeedPlan(...)` flow so that plan creation:

- records `templateId`
- records the template-provided `configOverride` snapshot in the runtime plan
- strips task-level `guidance` fields before the runtime plan is normalized and saved

Important constraint:

- `configOverride` must come from the loaded template only
- `PlanWriteInput` should not gain a general-purpose `configOverride` injection field

### 5. Add route-aware task completion logic

Introduce a small shared core helper for route-aware task completion.

Recommended responsibilities:

- locate the target task
- change status to `done`
- write `choiceId` when supplied
- reload the template via `plan.templateId`
- validate `choiceId` against template `guidance.onDone.choices`
- return the updated plan plus route-aware workflow guidance

This helper should become the shared path behind:

- new `claw task done`
- `plan edit --task-id ... --task-status done`
- any generic edit flow that produces done transitions

### 6. Enforce done-transition validation in generic edits

Update `editPlan(...)` in [packages/core/src/plan.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/plan.ts) so it validates resulting plan state, not just explicit CLI intent.

Recommended flow:

1. clone the previous plan
2. apply patch / task-status changes
3. collect tasks that changed from non-`done` to `done`
4. if none, continue normally
5. if any exist, load template via `templateId`
6. for each done transition:
   - require `choiceId` if template defines `guidance.onDone.choices`
   - reject `choiceId` if the task has no route choices
   - reject invalid `choiceId`

This keeps the contract centered on done transitions instead of on one command surface.

### 7. Extend CLI contract

Add a dedicated CLI entrypoint:

```powershell
claw task done --task <task-name> --id <task-id>
claw task done --task <task-name> --id <task-id> --choice <choice-id>
```

For generic edit or patch flows, add a task-choice map contract such as:

```powershell
claw plan edit --task <task-name> --task-id 3 --task-status done --task-choice 3=routing
claw plan edit --task <task-name> --patch .\candidate-plan.json --task-choice 3=routing --task-choice 5=simple
```

CLI parsing should convert these inputs into core-friendly task choice bindings instead of duplicating validation logic in the CLI layer.

### 8. Update workflow guidance builders

Update [packages/core/src/workflow-guidance.ts](/D:/Users/chany/Documents/claw-kit/packages/core/src/workflow-guidance.ts) to consume the merged effective config from the shared helper.

The workflow-guidance builder should not care whether a value came from:

- `.claw/project.json`
- `.claw/project-override.json`
- template `configOverride`

It should only consume the effective result.

For the first version, route-aware `guidance.onDone` should only alter returned workflow guidance, not mutate plan shape beyond persisted `choiceId`.

Recommended guidance behavior:

- `guidance.onDone.default` can affect returned guidance even when no `choiceId` exists
- `mergeMode: "override"` appends list-shaped fields and replaces repeated scalar fields
- `mergeMode: "replace"` discards the default workflow-guidance payload and uses the template-defined payload
- `delegateTruth: false` suppresses the default per-task truth delegate for that completion route

### 9. Add regression tests

Primary test surfaces:

- [packages/core/test/core.test.ts](/D:/Users/chany/Documents/claw-kit/packages/core/test/core.test.ts)
- relevant CLI test files under [packages/cli/test](/D:/Users/chany/Documents/claw-kit/packages/cli/test)

Recommended test groups:

- template parsing accepts supported `configOverride` fields
- template parsing rejects unsupported `configOverride` fields like `contextPaths`
- plan creation writes `templateId`
- plan creation writes `configOverride`
- runtime plan omits template-only task `guidance`
- route-aware completion writes `task.choiceId`
- default task guidance works even without route choices
- `mergeMode: "override"` merges with default workflow guidance
- `mergeMode: "replace"` replaces default workflow guidance
- `delegateTruth: false` suppresses default per-task truth delegation for that route
- route-aware completion fails without required choice
- route-aware completion fails with invalid choice
- generic patch/edit done transitions trigger the same validation
- workflow guidance respects merged effective config from plan override

## Suggested implementation phases

### Phase 1: data model and template parsing

- `types.ts`
- `plan-templates.ts`
- basic tests for parsing and normalization

### Phase 2: runtime plan creation and effective-config merge

- `plan.ts`
- shared effective-config helper
- workflow-guidance integration

### Phase 3: task completion and done-transition validation

- new task-done helper
- generic edit validation
- CLI surface for `claw task done` and `--task-choice`

### Phase 4: verification and polish

- regression tests
- CLI help text
- docs updates if command surface changes need user-facing reference updates

## Completion check for implementation prep

Implementation work is prepared when:

- the code touchpoints are explicit
- the runtime merge strategy is fixed
- the command contract additions are identified
- the test matrix is concrete enough to implement without reopening the design question
