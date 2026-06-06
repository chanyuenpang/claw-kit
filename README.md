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
claw init
claw context
claw plan write --task my-task --title "My task" --goal "Define the first task"
```

## Core commands

- `claw init`
- `claw context`
- `claw search`
- `claw plan write`
- `claw plan edit`
- `claw switch-task`
- `claw truth ingest`
