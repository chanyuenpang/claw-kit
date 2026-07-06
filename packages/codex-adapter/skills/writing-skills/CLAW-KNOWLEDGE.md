# writing-skills claw knowledge

## Source

- Source skill path: `C:\Users\chany\.codex\plugins\cache\openai-curated\superpowers\d6169bef\skills\writing-skills`
- Source description: Use when creating new skills, editing existing skills, or verifying skills work before deployment

## Major sections

- What is a Skill?
- TDD Mapping for Skills
- When to Create a Skill
- Skill Types
- Technique
- Pattern
- Reference
- Directory Structure
- SKILL.md Structure
- Core Pattern (for techniques/patterns)
- Quick Reference
- Implementation
- Common Mistakes
- Real-World Impact (optional)
- Claude Search Optimization (CSO)
- 1. Rich Description Field
- 2. Keyword Coverage
- 3. Descriptive Naming
- 4. Token Efficiency (Critical)
- 4. Cross-Referencing Other Skills
- Flowchart Usage
- Code Examples
- File Organization
- Self-Contained Skill
- Skill with Reusable Tool
- Skill with Heavy Reference
- The Iron Law (Same as TDD)
- Testing All Skill Types
- Discipline-Enforcing Skills (rules/requirements)
- Technique Skills (how-to guides)
- Pattern Skills (mental models)
- Reference Skills (documentation/APIs)
- Common Rationalizations for Skipping Testing
- Bulletproofing Skills Against Rationalization
- Close Every Loophole Explicitly
- Address "Spirit vs Letter" Arguments
- Build Rationalization Table
- Create Red Flags List
- Red Flags - STOP and Start Over
- Update CSO for Violation Symptoms
- RED-GREEN-REFACTOR for Skills
- RED: Write Failing Test (Baseline)
- GREEN: Write Minimal Skill
- REFACTOR: Close Loopholes
- Anti-Patterns
- ❌ Narrative Example
- ❌ Multi-Language Dilution
- ❌ Code in Flowcharts
- ❌ Generic Labels
- STOP: Before Moving to Next Skill
- Skill Creation Checklist (TDD Adapted)
- Discovery Workflow
- The Bottom Line

## Extracted ordered steps

- Heavy reference (100+ lines) - API docs, comprehensive syntax
- Reusable tools - Scripts, utilities, templates
- Encounters problem ("tests are flaky")
- Finds SKILL (description matches)
- Scans overview (is this relevant?)
- Reads patterns (quick reference table)
- Loads example (only when implementing)

## Extracted command examples

- `# ❌ BAD: Document all flags in SKILL.md`
- `search-conversations supports --text, --both, --after DATE, --before DATE, --limit N`
- `# ✅ GOOD: Reference --help`
- `search-conversations supports multiple modes and filters. Run --help for details.`
- `wc -w skills/path/SKILL.md`
- `# getting-started workflows: aim for <150 each`
- `# Other frequently-loaded: aim for <200 total`
- `./render-graphs.js ../some-skill           # Each diagram separately`

## How to use this knowledge

- Use the claw template for the lightweight workflow skeleton.
- Use this knowledge file for condensed phase names, checklists, and command anchors.
- Use `SUPERPOWERS-FALLBACK.md` plus any copied helper folders for the full original wording, examples, and branch details.
