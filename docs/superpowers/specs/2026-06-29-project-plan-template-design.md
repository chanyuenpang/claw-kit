# Project Plan Template Loading Design

## Goal

Make `claw plan create` and `claw subplan create` capable of loading project-defined plan templates from `.claw/templates`, and allow `.claw/project.json` plus `.claw/project-override.json` to choose the default template name for the current project.

## Scope

This round updates:

- core template resolution
- project config normalization and validation
- CLI help and command behavior around default template selection
- user-facing docs for project template setup
- regression coverage in core and CLI tests

## Non-Goals

- supporting TypeScript template execution
- supporting arbitrary template file paths configured in `project.json`
- introducing a second-level template directory such as `.claw/templates/plans`
- turning templates into callback functions or a richer runtime plugin API
- changing the existing internal seed template structure beyond what project loading requires

## Decisions

### Template directory is fixed to `.claw/templates`

Project-owned templates live directly under `.claw/templates`.
This round does not add a `plans/` subdirectory or a configurable template search root.

### Project config stores only the default template name

`project.json` and `project-override.json` should declare only the default template name, not a file path.
That keeps canonical project config portable and lets the runtime resolve files from the fixed `.claw/templates` directory.

Recommended field:

```json
{
  "defaultPlanTemplate": "team-default"
}
```

### Supported project template file formats are `json`, `js`, `mjs`, and `cjs`

Project templates can be authored as:

- `.claw/templates/<name>.json`
- `.claw/templates/<name>.js`
- `.claw/templates/<name>.mjs`
- `.claw/templates/<name>.cjs`

TypeScript files are intentionally out of scope for the first version.

### Template resolution uses deterministic precedence

For `plan create` and `subplan create`, template selection should work in this order:

1. explicit `--template <name>`
2. `project-override.json` or `project.json` merged `defaultPlanTemplate`
3. built-in `default`

Once the template name is chosen, resolution should prefer a project template with that name from `.claw/templates`.
If no project file exists for that name, the runtime should fall back to the built-in template registry.

### JS templates export data, not behavior

JS-backed project templates should export the same shape as the current seed template object.
The runtime should load the module and read the exported object, but it should not support executable hooks, helper callbacks, or host-provided runtime APIs in this round.

## Architecture

### Core template loader

`packages/core/src/plan-templates.ts` should become the single resolution entrypoint for:

- built-in template registry
- project template directory lookup
- extension-based file loading
- final validation and error reporting

The loader should accept enough project context to inspect `.claw/templates`, rather than only a template name string.

### Project config integration

`packages/core/src/types.ts`, `packages/core/src/context.ts`, and `packages/core/src/project-check.ts` should learn one new flat config field: `defaultPlanTemplate`.

That field should:

- be normalized as `string | null`
- participate in `project.json` plus `project-override.json` deep merge
- be preserved by protocol repair
- be validated as an explicitly present string-or-null canonical field

### Plan creation flow

`packages/core/src/plan.ts` should stop assuming that the effective template name is only whatever the CLI passes.
Instead, it should derive an effective template name from:

- the explicit CLI argument when present
- otherwise the normalized project config default
- otherwise the built-in `default`

That effective name should then go through the unified template loader.

### CLI surface

The CLI contract stays simple:

- `--template <name>` remains optional
- help text stops saying the default is always `default`
- docs explain that the default can come from project config

No new CLI flags are needed for the first version.

## Error Handling

The loader should fail clearly when:

- a project template file exists but does not export a valid seed template shape
- multiple files for the same template name exist and the chosen precedence would be ambiguous
- a requested template name is neither found in `.claw/templates` nor in the built-in registry

Error messages should point to the requested template name and, when relevant, the project template path that failed.

## Testing

Add targeted regression coverage for:

- loading a project JSON template from `.claw/templates`
- loading a project JS template from `.claw/templates`
- using `defaultPlanTemplate` from `.claw/project.json`
- overriding `defaultPlanTemplate` from `.claw/project-override.json`
- explicit `--template` overriding the configured project default
- falling back to the built-in `default` template when no project override exists
- invalid project template export shape
- missing requested template name

## Verification

After implementation:

- a project can add templates directly under `.claw/templates`
- `plan create` and `subplan create` both honor project template lookup
- `project-override.json` can change the default template name without modifying canonical `project.json`
- JSON and JS project templates both work
- the built-in `default` template still works for projects with no custom templates
