# OpenClaw Workflow Reference

This reference distills the built-in workflow definitions from `OpenClaw-dev`.

## Engineering

- description: software development, bug fixing, feature work
- stages: `research -> implement -> verify -> commit`
- atomicity rules:
  - research and implement must not be merged
  - verify must be separate
  - finish or commit should be separate

## Discussion

- description: exploratory discussion, brainstorming, decision-making
- stages: `discuss -> summarize -> decide`
- atomicity rules:
  - discussion and decision can coexist
  - summary should still be explicit

## Documentation

- description: docs, guides, specs, technical writing
- stages: `research -> write -> review`
- atomicity rules:
  - write and review must not be merged
  - small-scope documentation work can merge research with writing

## Ops

- description: deployment, migrations, environment setup, operational changes
- stages: `prepare -> execute -> verify -> rollback-plan`
- atomicity rules:
  - execute and verify must not be merged
  - rollback or recovery strategy should be explicit
  - destructive operations should stay isolated

## Research

- description: investigation and analysis without implementation
- stages: `explore -> analyze -> summarize`
- atomicity rules:
  - flexible stage merging is acceptable
  - conclusion or summary should still be explicit

## Completion strategy

- root plans: require user confirmation before `end.completed`
- subplans: are auto-completable when all tasks are done

## Claw Kit default harness chain

- `prepare.requirements`
- confirm route
- create tasks
- `process.active`
- process one task
- dispatch `truth-writer`
- process next task
- dispatch `truth-writer`
- continue until all tasks are done
- complete retrospective
- dispatch `adr-writer`
- `claw plan done`
