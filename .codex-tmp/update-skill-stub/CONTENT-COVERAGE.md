# update content coverage

## Source to converted-home mapping

- Trigger and routing rules: TODO.
- Direct entry: `SKILL.md` routes to `claw plan create --template update`.
- Skill-local template: `TEMPLATE.json` with id `update`.
- Batch/mixed entry: `SKILL.md` includes the standard subplan route for refresh the published CLI and the current host plugin install surface after a newer version is detected.
- Ordered workflow steps: TODO.
- Branch conditions: TODO.
- Tool constraints and helper files: TODO.
- Non-template supplement material kept in `SKILL.md`: TODO.
- Optional skill-local references: TODO if the source needs them.
- Verification gates: TODO.
- Long-form source wording: `non-claw-fallback.md`.

## Coverage checklist

- [ ] Important source triggers are represented.
- [ ] Important workflow steps are represented.
- [ ] Important branch behavior is represented.
- [ ] Required tools, commands, helper files, and links are represented.
- [ ] Information that does not fit template structure stays in `SKILL.md` or optional skill-local references.
- [ ] Verification requirements are represented.
- [ ] Anything too long for the template is preserved in `SKILL.md`, optional skill-local references, or fallback.
