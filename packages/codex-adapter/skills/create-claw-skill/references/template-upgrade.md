# Template Upgrade

Use this checklist when claw reports:

`Template out of date. Use claw-kit:create-claw-skill to upgrade template.`

1. Inspect the selected skill package: `SKILL.md`, `TEMPLATE.json`, fallback content, and referenced files.
2. Compare it with the current template authoring contract and optimize outdated tasks, guidance, routing, validation, or companion content.
3. After the review, set top-level `TEMPLATE.json.version` to the current CLI version.
4. Run `claw template validate --file "<skill-dir>/TEMPLATE.json"` and resolve every reported issue.

Do not treat the upgrade as a version-only edit. The version records that the package has passed the current review and validation contract.

For the schema and authoring rules available inside the installed skill package, see `template-authoring.md`.
