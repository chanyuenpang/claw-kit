# @veewo/claw

Publishable `claw` CLI for `.claw` project bootstrap, planning, search, truth ingestion, and completion refresh.

Install:

```bash
npm install -g @veewo/claw
```

Then run:

```bash
claw init
claw plan write --title "My task" --goal "Define the first task"
```

Codex startup workflow should rely on the session hook/bootstrap to recover startup state instead of treating any extra manual recovery step as required after plan creation.

Repository:

- [claw-kit](https://github.com/chanyuenpang/claw-kit)
