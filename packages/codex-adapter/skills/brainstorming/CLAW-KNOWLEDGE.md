# brainstorming claw knowledge

## Source contract

- Source skill: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\brainstorming`
- Trigger: use before any creative work, feature creation, behavior changes, or implementation planning.
- Hard gate: no implementation action before the design is presented and approved.
- Terminal handoff: after the spec review gate passes, transition to `writing-plans`.

## Canonical ordered workflow

1. Explore project context.
2. Offer visual companion when upcoming questions are visual.
3. Ask clarifying questions one at a time.
4. Propose 2-3 approaches with a recommendation.
5. Present the design in sections and get approval.
6. Write the design doc under `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
7. Run spec self-review.
8. Ask the user to review the written spec.
9. After approval, invoke `writing-plans`.

## Branches that matter

- Visual companion branch:
  Use only when visual explanation would help.
  The companion offer must be its own message.
  If accepted, read and follow [visual-companion.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/visual-companion.md).
- Scope decomposition branch:
  If the request is too large for a single spec, decompose it first and only brainstorm the first sub-project.
- User review loop:
  If the user asks for spec changes after the written doc, update the spec and repeat self-review before asking for approval again.

## Non-negotiable behavior

- Ask only one clarifying question per message.
- Prefer multiple-choice questions when practical.
- Present 2-3 approaches before settling on one design.
- Do not invoke implementation skills before the brainstorming flow completes.
- The only post-brainstorming skill handoff is `writing-plans`.

## Local helper inventory

- Visual companion guide: [visual-companion.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/visual-companion.md)
- Spec review prompt: [spec-document-reviewer-prompt.md](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/spec-document-reviewer-prompt.md)
- Browser companion runtime assets:
  [scripts/frame-template.html](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/frame-template.html)
  [scripts/helper.js](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/helper.js)
  [scripts/server.cjs](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/server.cjs)
  [scripts/start-server.sh](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/start-server.sh)
  [scripts/stop-server.sh](/D:/Users/chany/Documents/claw-kit/packages/codex-adapter/skills/brainstorming/scripts/stop-server.sh)

## Why this file exists

- The template keeps the visible plan compact.
- This knowledge file preserves the original workflow order, branches, gates, and helper inventory in a claw-friendly reference.
- The fallback document remains the authoritative long-form wording when exact prose matters.
