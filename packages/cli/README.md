# @veewo/claw

Publishable `claw` CLI for `.claw` project bootstrap, planning, search, truth ingestion, and completion refresh.

Install:

```bash
npm install -g @veewo/claw
```

Then run:

```bash
claw init
claw plan write --task my-task --title "My task" --goal "Define the first task"
```

`claw context` remains available as a command, but Codex startup workflow should rely on the session hook/bootstrap to recover context instead of treating it as a required manual step after plan creation.

Repository:

- [claw-kit](https://github.com/chanyuenpang/claw-kit)
