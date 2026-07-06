# Template Guidance Routing Design

## Goal

Extend project-owned plan templates so they can carry task-level guidance routing rules, while keeping the runtime `plan.json` lightweight for agents.

This round adds a template-aware completion flow that can restore route-like skill behavior through explicit `choice`-based task completion instead of a general scripting system.

## Scope

This round defines:

- a plan-like template authoring shape that allows template-only guidance fields inside tasks
- a template-level `configOverride` surface for task-scoped workflow overrides
- a compile step that strips template-only routing fields out of the agent-facing `plan.json`
- runtime lookup of template guidance through `templateId`
- a dedicated `claw task done` entrypoint with explicit `choice` handling
- done-transition validation for generic edit and patch flows
- error contracts for missing or invalid completion choices

## Non-Goals

- changing canonical `PlanTask.id` from numeric ids to string keys
- exposing template-only guidance routing fields to the agent-facing `plan.json`
- introducing a general-purpose action DSL such as `deleteTask`
- auto-inferring complex semantic routes from free-form task output
- restoring or reconstructing the non-claw skill through a reverse compiler
- versioning or hashing templates for long-lived replay safety
- allowing templates to rewrite broad project infrastructure config such as `contextPaths`, embedding settings, or GitNexus behavior
- mutating plan structure implicitly as a side effect of route choice in the first version

## Decisions

### Templates become a plan-like superset

Project templates should be authored in a shape that is intentionally close to `plan.json`.
The goal is to make template authoring feel like writing a real plan, not a separate orchestration language.

That means:

- top-level fields such as `configOverride`, `goal`, `tasks`, `references`, `rules`, and `keyDecisions` remain natural in the template
- task objects remain the main place where task-specific routing guidance is authored
- template-only control fields are compiled away before the agent sees the runtime plan

### Template-level `configOverride` is task-scoped

Templates may define a top-level `configOverride` block.
This block does not modify `.claw/project.json` or `.claw/project-override.json`.
It only changes the effective workflow configuration used while this template-created plan runs.

Recommended shape:

```json
{
  "templateId": "create-claw-skill",
  "configOverride": {
    "goalMode": false,
    "truthDispatch": "final_only"
  }
}
```

This should be treated as a task-scoped runtime override, not as a persistent project-config mutation.
The runtime should accept this field only from the template definition itself, not from `claw plan create` flags or other ad hoc plan-creation input.

### `configOverride` stays narrow in the first version

The first version should allow only a small workflow-focused whitelist of override fields:

- `goalMode`
- `truthDispatch`
- `externalPlanningSkill`
- `externalTruthSkill`
- `externalAdrSkill`

The first version should not allow broader project-environment overrides such as:

- `contextPaths`
- `memory`
- embedding configuration
- `gitnexus`

This keeps templates focused on workflow behavior instead of turning them into task-level project-environment rewrites.

### Task ids stay numeric

Canonical plan tasks continue to use numeric `id` values.
This round does not introduce string task ids or task keys into the canonical plan contract.

Any template-time routing metadata should be indexed by numeric task id after compile time.

### Task-level guidance routing lives inside template tasks

Template tasks may include template-only guidance fields.
These fields belong next to the task they affect, rather than in a detached top-level routing map.

Recommended shape:

```json
{
  "title": "create-claw-skill",
  "status": "process.discussing",
  "goal": {
    "text": "Compile an existing skill into a claw-aware skill template."
  },
  "tasks": [
    {
      "id": 1,
      "title": "Analyze the source skill",
      "detail": "Identify whether the skill is mostly linear or route-heavy.",
      "status": "pending",
      "guidance": {
        "onDone": {
          "choices": {
            "simple": {
              "summary": "Continue with the lightweight wrapping route.",
              "nextsteps": [
                "Keep the new template minimal.",
                "Preserve the original skill as the non-claw fallback."
              ]
            },
            "routing": {
              "summary": "Continue with the route-aware wrapping route.",
              "nextsteps": [
                "Add task-level guidance choices to the template.",
                "Preserve the original skill as the non-claw fallback."
              ]
            }
          }
        }
      }
    }
  ],
  "references": [],
  "rules": []
}
```

### Template-only guidance fields are not part of runtime plan truth

The runtime `plan.json` should remain clean and lightweight.
It should not include template-only `guidance` routing fields.

The compile step should:

- keep the normal plan fields
- strip template-only guidance routing fields from tasks
- persist the chosen template id into the runtime plan so the runtime can load the template again later

### Route choices are explicit, not inferred

When a template defines `guidance.onDone.choices` for a task, completing that task is a route selection event, not a plain status write.

That route must be chosen explicitly by the caller through a `choice` value.
The runtime should not guess the route from prose, and it should not silently choose one unless a future version adds an explicit `defaultChoice` contract.

### Guidance does not require choices

`guidance.onDone` must work even when a task has no route choices.
`choices` add branching; they are not a prerequisite for template-defined guidance.

Recommended shape:

```json
{
  "guidance": {
    "onDone": {
      "default": {
        "mergeMode": "override",
        "summary": "Use the template-specific completion contract.",
        "nextsteps": [
          "Continue with the next template-defined task."
        ]
      }
    }
  }
}
```

This allows default template tasks and other linear task templates to adjust completion guidance without inventing fake branches.

### Route choice becomes runtime task state

When a route-aware task is completed, the chosen route should be written into the runtime plan as `task.choiceId`.

Recommended runtime shape:

```json
{
  "id": 1,
  "title": "Analyze the source skill",
  "status": "done",
  "choiceId": "routing"
}
```

This makes the route decision part of execution state instead of leaving it as a transient command argument.

### Runtime plan records `templateId`

The runtime `plan.json` should record which template produced the plan.

Recommended shape:

```json
{
  "templateId": "create-claw-skill"
}
```

At runtime, guidance lookup should use:

- `plan.templateId`
- `task.id`
- `task.choiceId` when present

This round assumes plans are created and executed close together in time, so runtime lookup should use the current template content for that `templateId`.
This round does not add template versioning or content-hash validation.

### Runtime plan records the effective template override

The runtime `plan.json` should also record the template-scoped override that was actually applied for this plan.
This makes task behavior easier to audit and explain during execution and handoff.

Recommended shape:

```json
{
  "templateId": "create-claw-skill",
  "configOverride": {
    "goalMode": false,
    "truthDispatch": "final_only"
  }
}
```

This runtime field is a snapshot of the task-scoped override, not a replacement for canonical project config files.

### Non-claw fallback remains the original skill

The non-claw fallback should stay simple:

- keep the original skill text as-is
- route claw-capable users into the new plan-template entrypoint
- route non-claw users back to the original skill surface

This round does not attempt to reconstruct the original skill from compiled template metadata.

### Route choices only control guidance in the first version

In the first version, a route choice affects the returned guidance contract, not the underlying plan structure.

Template-defined `guidance.onDone.default` and `guidance.onDone.choices.<choiceId>` should also be able to affect returned guidance without any route choice at all.

Allowed first-version effects:

- `summary`
- `nextsteps`
- `notes`
- `recommendedCommands`
- optional `nextTask` recommendation
- optional route-level truth-delegation suppression

Disallowed first-version effects:

- deleting tasks
- implicitly appending arbitrary tasks
- rewriting unrelated task statuses
- hidden broad plan mutation

### Guidance merge behavior is explicit

Template-defined `guidance.onDone.default` and `guidance.onDone.choices.<choiceId>` should declare how they interact with the default workflow guidance.

Recommended field:

```json
{
  "mergeMode": "override"
}
```

Supported values:

- `override`
- `replace`

Semantics:

- `override`: start from the default workflow guidance, append list-shaped fields such as `nextsteps` and `recommendedCommands`, and replace any explicitly repeated scalar fields such as `summary`, `notes`, or `nextTask`
- `replace`: discard the default workflow guidance content entirely and use only the template-defined guidance payload

This keeps template authors from having to guess whether omitted fields are inherited or removed.

### Truth delegation can be suppressed at the route level

Template-defined completion guidance should be able to suppress the default per-task truth delegation even when the effective project truth-dispatch mode is still `per_task`.

Recommended field:

```json
{
  "delegateTruth": false
}
```

This field belongs to the route payload itself, so it works for:

- `guidance.onDone.default`
- `guidance.onDone.choices.<choiceId>`

This is especially useful for template-owned skeleton tasks whose completion should advance workflow state but should not create truth deposition work by default.

## Architecture

### Template authoring surface

Project templates continue to live under `.claw/templates` and remain the authoring surface.

The template loader should accept a plan-like superset that contains:

- optional top-level `configOverride`
- existing seed-plan fields
- optional task-level `guidance` fields reserved for template-only routing behavior

Validation should reject malformed template-only guidance fields instead of silently dropping them.
Validation should also reject unsupported `configOverride` keys.

### Effective config precedence

Template overrides should participate in effective runtime config resolution with a clear precedence.

Recommended order:

1. template `configOverride`
2. `.claw/project-override.json`
3. `.claw/project.json`
4. built-in defaults

This keeps task-local workflow behavior anchored in the template instead of allowing `claw plan create` callers to inject ad hoc config overrides at plan creation time.

### Runtime plan fields

Plan creation should produce two outputs:

1. the normal runtime `plan.json`
2. a template-aware runtime state that includes `templateId` and the applied `configOverride`

Suggested conceptual shape:

```json
{
  "title": "create-claw-skill",
  "templateId": "create-claw-skill",
  "configOverride": {
    "goalMode": false,
    "truthDispatch": "final_only"
  },
  "status": "process.active",
  "goal": {
    "text": "Compile an existing skill into a claw-aware skill template."
  },
  "tasks": [
    {
      "id": 1,
      "title": "Analyze the source skill",
      "status": "done",
      "choiceId": "routing"
    },
    {
      "id": 2,
      "title": "Compile the claw template",
      "status": "pending"
    }
  ]
}
```

The runtime should reload the template by `templateId` whenever it needs to interpret `guidance.onDone` behavior.
This keeps the template as the single source of route definitions and keeps execution history in the normal plan state.
The runtime should use the stored `configOverride` snapshot when computing effective workflow behavior for this plan.

### Runtime guidance lookup

When the runtime needs to return route-aware guidance, it should:

1. load the current `plan.json`
2. compute effective config using the stored runtime override
3. read `plan.templateId`
4. load the matching template
5. find the matching template task by numeric `task.id`
6. inspect that task's `guidance.onDone`
7. if `task.choiceId` exists, use it to select the matching route
8. return the resulting workflow guidance

This round does not require a sidecar metadata file.

### Dedicated task completion entrypoint

Introduce a dedicated task-completion command:

```powershell
claw task done --task <task-name> --id <task-id>
claw task done --task <task-name> --id <task-id> --choice <choice-id>
```

This command should:

- load the current plan
- mark the target task as `done`
- write `choiceId` into the task when `--choice` is supplied
- load the template through `plan.templateId`
- enforce the `choice` contract when `guidance.onDone.choices` exists
- return the resulting workflow guidance for the chosen route

This command is not just a convenience wrapper.
It is the canonical completion entrypoint for template-aware route selection.

### Generic edit and patch validation

Generic plan-editing flows must not bypass the choice contract.

Any write operation that changes a task from a non-`done` status to `done` should be treated as a done transition, even if the caller used a broad patch or a generic edit command.

The validation flow should be:

1. load the previous plan
2. apply the requested edit or patch in memory
3. compare the previous and candidate plans
4. collect every task whose status changed from non-`done` to `done`
5. load the template through `plan.templateId`
6. validate each done transition against template `guidance.onDone.choices` and candidate `task.choiceId`
7. reject the entire write if any required choice is missing or invalid

This keeps the route contract centered on done transitions rather than on one specific CLI surface.

### Choice input for generic edits

Generic edit or patch flows may complete more than one task at once.
Those flows therefore need a task-level choice map, not only a single choice string.

Conceptually:

```powershell
claw plan edit --task <task-name> --task-id 3 --task-status done --task-choice 3=routing
claw plan edit --task <task-name> --patch .\candidate-plan.json --task-choice 3=routing --task-choice 5=simple
```

The exact flag spelling can be finalized during implementation, but the runtime contract should support per-task choice binding for generic write flows.

## Command Contract

### `claw task done`

Required behavior:

- if the target task has no `guidance.onDone.choices`, allow completion with no `choice`
- if the target task defines `onDone.choices`, require `--choice`
- if `--choice` is valid, return the corresponding route-specific guidance
- if `--choice` is supplied for a task that has no route choices, reject the request

### `claw plan edit`

Required behavior:

- allow normal edits for non-completion changes
- trigger done-transition validation whenever any task becomes `done`
- require task-level choice input for every done transition that needs one
- reject the whole write if any required choice is missing or invalid

### Patch-oriented flows

Patch-oriented flows should follow the same validation path as other edits.
They should not gain an escape hatch just because the status change happened inside a JSON patch body.

## Error Handling

The runtime should fail clearly with structured errors.

Recommended errors:

- `TEMPLATE_CONFIG_OVERRIDE_INVALID`
  - the template declares an unsupported or malformed `configOverride`
- `TASK_DONE_CHOICE_REQUIRED`
  - a task defines `guidance.onDone.choices` but the resulting done task has no `choiceId`
- `TASK_DONE_CHOICES_REQUIRED`
  - a generic edit or patch completed multiple route-aware tasks without all required `choiceId` values
- `TASK_DONE_CHOICE_INVALID`
  - a supplied choice id is not valid for that task
- `TASK_DONE_CHOICE_UNEXPECTED`
  - a choice was supplied for a task that does not define route choices

Error payloads should include, when relevant:

- `taskId`
- `availableChoices`
- `recommendedCommand`

Recommended shape:

```json
{
  "code": "TASK_DONE_CHOICE_REQUIRED",
  "message": "Task 3 requires --choice because this template defines multiple onDone routes.",
  "taskId": 3,
  "availableChoices": [
    {
      "id": "simple",
      "label": "Simple route"
    },
    {
      "id": "routing",
      "label": "Routing-aware route"
    }
  ],
  "recommendedCommand": "claw task done --task create-claw-skill --id 3 --choice simple"
}
```

## Testing

Add targeted regression coverage for:

- accepting supported template `configOverride` fields
- rejecting unsupported template `configOverride` fields such as `contextPaths`
- applying template `configOverride` to effective workflow behavior
- writing the applied `configOverride` snapshot into the runtime `plan.json`
- compiling a template with task-level `guidance.onDone.choices`
- stripping template-only guidance fields out of the runtime `plan.json`
- writing `templateId` into the runtime `plan.json`
- persisting `task.choiceId` for route-aware completions
- `claw task done` succeeding for tasks with no route choices
- `claw task done` requiring `--choice` for route-aware tasks
- `claw task done` rejecting invalid choice ids
- `claw plan edit --task-status done` triggering the same choice validation
- patch-based done transitions triggering the same choice validation
- multi-task done transitions requiring per-task choices
- route choices returning the expected route-specific workflow guidance

## Verification

After implementation:

- a project template can be authored in a plan-like shape with task-level guidance routing fields
- a project template can declare a task-scoped `configOverride` for workflow behavior
- `claw plan create` compiles that template into a clean runtime `plan.json` that records `templateId`
- the runtime plan also records the applied `configOverride` snapshot for that task
- agents still see a lightweight runtime plan without template-only guidance routing fields
- route-aware task completion records `task.choiceId` as execution state
- `claw task done` can drive route-aware task completion through explicit choices
- generic edit and patch flows cannot bypass route-aware done-transition validation
- runtime guidance can be reconstructed from `templateId`, numeric `task.id`, and `task.choiceId`
- route-aware templates can preserve original skill branching intent without requiring a full scripting engine
