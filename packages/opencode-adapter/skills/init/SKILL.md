---
name: init
description: Use when the user explicitly wants to initialize a non-claw project for claw-kit.
---
# claw-kit init

## Expected flow

1. Confirm the request is about initializing a non-claw project.
2. Run `claw context` from the target project root.
3. Report the startup recovery result.
4. Continue with `using-claw-kit` and the normal flow.

## Guardrails

- `claw context` is the explicit initialization action.
- Report concrete recovery result.
- Do not route into planning until initialization is complete.