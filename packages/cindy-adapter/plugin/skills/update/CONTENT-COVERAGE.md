# Cindy update content coverage

- Cindy-owned platform update implementation, with CLI and Cindy plugin treated as one update unit: `SKILL.md`, `TEMPLATE.json`
- Trigger and claw entry routes: `SKILL.md`
- Template compatibility: `TEMPLATE.json` declares the current claw CLI version
- Published-version gate and ordered CLI/Cindy refresh: `TEMPLATE.json`
- Stable `vcindy-*` GitHub Release discovery, numeric version ordering, and matching `.cindy` asset requirement: all three workflow files
- Immutable asset URL, embedded manifest, installed plugin, restart, and loaded-version verification: `TEMPLATE.json`, `non-claw-fallback.md`
- No platform choice or cross-host route: `SKILL.md`, template rules
- No-.claw execution: `non-claw-fallback.md`


