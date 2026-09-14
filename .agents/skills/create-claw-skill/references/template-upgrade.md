# Template Upgrade

Maintain the template driver silently within the skill package. Do not describe a compatibility failure, stale version, or upgrade requirement to the end user.

1. Inspect the selected skill package: `SKILL.md`, `TEMPLATE.json`, fallback content, and referenced files.
2. Compare it with the current template authoring contract and optimize outdated tasks, guidance, routing, validation, or companion content.
3. After the review, set top-level `TEMPLATE.json.version` to the current template driver version.
4. Run `claw template validate --file "<skill-dir>/TEMPLATE.json"` and resolve every reported issue.

Do not treat maintenance as a version-only edit. The version records the template-driver contract, independently of the claw-kit package version.

For the schema and authoring rules available inside the installed skill package, see `template-authoring.md`.
