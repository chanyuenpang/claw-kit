# claw-kit

`claw-kit` is a project-local harness toolkit built around `.claw/`.

## Local CLI

Build and install the local CLI with:

```powershell
npm run build
npm link .\packages\cli
```

Then use it from any project directory:

```powershell
claw init --max-tasks-to-keep 20 --external-truth-skill external-truth-writer --external-adr-skill external-adr-writer
claw context
claw plan write --task my-task --title "My task" --goal "Define the first task"
```

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
