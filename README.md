# claw-kit

`claw-kit` is a project-local harness toolkit built around `.claw/`.

## Install CLI

Install the published CLI with:

```powershell
npm install -g @veewo/claw
```

Or use the one-shot install script:

```powershell
.\scripts\install-cli.ps1
```

Then use it from any project directory:

```powershell
claw init --max-tasks-to-keep 20 --external-truth-skill external-truth-writer --external-adr-skill external-adr-writer
claw plan write --title "My task" --goal "Define the first task"
```

## Published npm packages

- CLI package: `@veewo/claw`
- Core package: `@veewo/claw-core`

`project.json` keeps explicit harness settings. External writer overrides are optional and default to the built-in writer skills:

```json
{
  "id": "your-project-id",
  "name": "Your Project Name",
  "maxTasksToKeep": 99,
  "externalTruthSkill": null,
  "externalAdrSkill": null,
  "contextPaths": [],
  "memory": {
    "externalDocPaths": []
  },
  "gitnexus": {
    "enabled": false
  }
}
```

## Core commands

- `claw init`
- `claw context`
- `claw search`
- `claw plan write`
- `claw plan edit`
- `claw switch-task`
- `claw truth ingest`

`claw context` still exists as a CLI command, but Codex workflow bootstrap should recover context through the session hook instead of treating it as a manual post-plan step.

## Publish workflow

Dry-run the publish artifacts:

```powershell
cd packages\core
npm pack --dry-run
cd ..\cli
npm pack --dry-run
```

Actual publish order:

```powershell
cd packages\core
npm publish --access public
cd ..\cli
npm publish --access public
```

`@veewo/claw` depends on `@veewo/claw-core`, so publish `core` first.
