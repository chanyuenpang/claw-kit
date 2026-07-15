# update content coverage

## Source to converted-home mapping

- Trigger and routing rules: `SKILL.md`
- Direct entry: `SKILL.md` routes to `claw plan create --template update`.
- Skill-local template: `TEMPLATE.json` with id `update`.
- Batch/mixed entry: `SKILL.md` includes the standard subplan route for refreshing the published CLI and the current host plugin install surface after a newer version is detected.
- Ordered workflow steps: `TEMPLATE.json`
- Branch conditions: `TEMPLATE.json`
- Tool constraints and helper files: `TEMPLATE.json`, `non-claw-fallback.md`
- Non-template supplement material kept in `SKILL.md`: installation-only positioning and the paired-surface completion rule.
- Optional skill-local references: none.
- Verification gates: `TEMPLATE.json`
- Long-form source wording: `non-claw-fallback.md`

## Coverage checklist

- [x] Important source triggers are represented.
- [x] Important workflow steps are represented.
- [x] Important branch behavior is represented.
- [x] Required tools, commands, helper files, and links are represented.
- [x] Information that does not fit template structure stays in `SKILL.md` or optional skill-local references.
- [x] Verification requirements are represented.
- [x] Anything too long for the template is preserved in `SKILL.md`, optional skill-local references, or fallback.
