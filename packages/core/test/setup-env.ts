// Tests must assert against the bundled workflow-guidance config. The host
// plugin (e.g. opencode) may inject CLAW_GUIDANCE_CONFIG pointing at a
// host-flavored overlay; clear it so tests see the canonical defaults.
delete process.env.CLAW_GUIDANCE_CONFIG;
