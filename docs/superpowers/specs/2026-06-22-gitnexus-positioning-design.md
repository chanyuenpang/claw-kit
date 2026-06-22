# GitNexus Positioning Design

## Goal

Clarify how `claw-kit` relates to GitNexus in public-facing docs, while also surfacing four durable advantages:

- plan before execute helps agents carry complex or longer-running tasks more cleanly
- `claw-kit` can work alongside other harnesses or skills
- truth and ADR are maintained as searchable project knowledge
- canonical plus personal override config supports team collaboration

## Scope

This round updates wording only in:

- `README.md`
- `packages/cli/README.md`
- `docs/project-json-reference.md`

It also removes the publish-flow section from the root `README.md` and leaves release details in dedicated docs.

## Non-Goals

- changing product behavior
- changing plugin/runtime integration logic
- expanding GitNexus into a required dependency
- rewriting release docs outside their existing dedicated documentation

## Positioning Decisions

### GitNexus relationship

Use the "recommended 1" framing:

- `claw-kit` is for project-level workflow, planning, knowledge capture, and closeout
- GitNexus can strengthen code investigation and relationship tracing
- GitNexus is useful, but not required

This framing should stay intentionally modest. It should explain the relationship without making `claw-kit` sound dependent on GitNexus.

### Separate advantage: works with other harnesses and skills

Keep this as an independent product advantage rather than mixing it into the GitNexus paragraph.

The docs should communicate:

- `claw-kit` is not tied to one host or one investigation tool
- it can be paired with other harnesses, external skills, and adjacent tooling
- this flexibility is part of its value as a project-level workflow layer

### Separate advantage: plan structure helps with longer-running work

Keep this as another independent product advantage rather than burying it inside the GitNexus explanation.

The docs should communicate:

- `claw-kit` gives work a project-level plan structure instead of leaving long tasks in loose chat state
- that structure helps agents carry multi-step or longer-running work more steadily across execution and closeout
- this is a workflow advantage, not just a documentation feature

### Separate advantage: truth and ADR stay maintained and searchable

Keep this explicit in the public docs rather than assuming people will infer it from command names alone.

The docs should communicate:

- truth and ADR are not just one-off outputs; they become durable project knowledge
- `claw-kit` maintains that knowledge as part of the workflow
- project recall can search over that retained truth and ADR context

### Separate advantage: canonical plus personal config supports team collaboration

Keep this tied to the `project.json` / `project-override.json` model.

The docs should communicate:

- teams can share canonical workflow behavior through `.claw/project.json`
- individuals can keep runtime-only preferences in `.claw/project-override.json`
- this split makes the workflow easier to use in collaborative repos without forcing every personal choice into shared config

### README cleanup

The root `README.md` should not carry step-by-step publish or maintainer release procedure.

Instead:

- keep the README focused on what the project is, what it helps with, and where to start
- leave release workflow details in `DISTRIBUTION.md` and other dedicated docs

## Intended Content Changes

### `README.md`

- add or revise short public-facing positioning copy that explains:
  - what `claw-kit` owns
  - how GitNexus can complement it
  - that GitNexus is optional
- add a separate advantage line or section for working with other harnesses or skills
- add a separate advantage line or section for the plan structure being better suited to longer-running tasks
- make truth/ADR retention and search value more explicit
- surface the canonical-plus-personal config split as a collaboration advantage
- remove the publish workflow section and replace it with a short documentation pointer if needed

### `packages/cli/README.md`

- explain the practical boundary:
  - use `claw` for project workflow and recall
  - use GitNexus when deeper code investigation is useful
- keep the wording aligned with the root README
- do not imply GitNexus is mandatory for CLI use
- surface the long-running-task advantage in a workflow-oriented sentence if it fits naturally
- make the truth/ADR retention value explicit if it fits naturally

### `docs/project-json-reference.md`

- clarify that `gitnexus.enabled` is an optional integration switch
- explain that projects can use `claw-kit` without enabling GitNexus
- keep config semantics compact and factual rather than turning the reference page into marketing copy
- if helpful, tie the config page back to the idea that project config and plan structure support longer-running work
- make the shared-versus-personal config split read as a real collaboration advantage, not only a schema fact

## Writing Guidelines

- prefer concise GitHub-facing language
- keep GitNexus wording accurate and non-dependent
- do not duplicate long explanations across all three files
- preserve the current repo-relative link style in public docs

## Verification

After editing:

- inspect the resulting diffs for the three target docs
- confirm the root README no longer contains the publish workflow section
- confirm the GitNexus wording is present and consistent across the three target docs
- confirm the “works with other harnesses or skills” advantage appears as a separate point rather than inside the GitNexus explanation
- confirm the long-running-task/plan-structure advantage appears as a separate point rather than being folded into the GitNexus paragraph
- confirm truth/ADR retention and search value is explicit
- confirm the shared-plus-personal config split is visible as a collaboration advantage
