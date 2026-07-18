# create-claw-skill fallback

Use this plan-independent workflow when `create-claw-skill` contributes part of a stage owned by another workflow, or when the claw CLI/template is unavailable:

1. Inspect the source skill or distill the idea into its trigger, ordered workflow, tools, constraints, real branches, and verification.
2. Scaffold with `node <create-claw-skill-dir>/scripts/create-claw-skill-stub.mjs --skill-name <skill-name> --out <target-skill-package>`.
3. Replace the generated TODOs, preserve source behavior in the template, fallback document, and any necessary focused references, then keep the entry limited to task-ownership routing.
4. When the claw CLI is available, run `claw template validate --file <target-skill-package>/TEMPLATE.json`; always validate the skill structure and complete the content coverage mapping.

Do not add `guidance.onDone.choices` unless the choice changes the immediate downstream task or route.
