# Shared claw-kit skills

`@veewo/claw-skills` is an independent npm artifact assembled from the existing
seven canonical public packages selected by the standard skill declaration.
It contains each complete directory, including references, templates and binary
resources. No install/postinstall scripts run and no global files are changed by
installing the npm package alone.

Build a fresh artifact with:

```
node scripts/shared-skills-artifact.mjs <fresh-output-directory>
```

Pack that directory with `npm pack --ignore-scripts`. This is not publication.
The source package is private; only the complete composed artifact removes that
flag. The generic installer lives in this package and is copied into the Cindy
runtime at artifact assembly, without any bundled skill files.
The current package version is 0.2.52; 0.2.51 was reserved by an unpublished
candidate before source reconciliation. Publication is a separate authorized step.
Never publish different bytes under the same version. Future skill changes must
increment this package version and rebuild the corresponding plugin candidate.
This package is not automatically included in existing platform release batches.

Cindy's composed plugin contains an exact package version, canonical source hash,
and per-skill content hashes in `node/shared-skills-contract.json`. Its explicit
`install_skills` tool fetches only that version from https://registry.npmjs.org,
with npm lifecycle scripts disabled, then verifies the complete installed bytes.
The registry's tarball integrity is also checked by npm. Neither startup nor a
normal workflow operation contacts the registry or follows `latest`.

The reusable `installer.cjs` exports `install({ packageRoot, homeDir, expected })`,
`downloadAndInstall({ homeDir, expected })`, and `status({ homeDir, expected })`.
Installation flows can call the same API with the frozen plugin contract; tests
and local candidate installers can use a detached package and an isolated home.
`homeDir` is a library argument, never an agent-provided Cindy tool argument.

Skills are installed in `~/.agents/skills/<original-skill-name>`. Ownership receipts,
transaction stages and retained recovery backups live in
`~/.agents/.claw-kit-skills`, outside discovery. An exact repeat is a no-op. An
explicit retry recovers an interrupted transaction before attempting installation.
Existing unowned directories, modified owned files, links and duplicate skill
entries are preserved and reported. Do not manually remove a live installation
lock. If a crash left an incomplete lock, verify no installer is running before
repairing it. Backups are retained for inspection; no automatic destructive
cleanup or adoption of existing user skills is performed.

Migration order: update the Cindy plugin through its normal marketplace flow;
let Cindy remove its old approved `claw-kit--<skill>` projections; call
`skills_status`, then explicitly call `install_skills`; open a new session and
verify skill discovery. If old registrations persist, restart Cindy or repair
them through Cindy's plugin manager. The installer does not delete host-owned
links. Duplicate user copies require an explicit user decision.

An installed/compatible package does not prove an active session loaded it.
Results report `loadedInCurrentSession: "unknown"`. New sessions should pick up
the shared root through Cindy's existing engine integration; restart Cindy if
the skills remain absent. This must be verified in the real host for both Codex
and non-Codex engines. The claw-kit Codex plugin distribution is unchanged.

Mutation boundaries are limited to the installer: path containment and ordinary
file checks protect against writing through links; ownership markers, receipts
and content hashes protect user data; the exclusive lock protects one install
transaction from another; the pinned manifest protects the selected package
identity. Their evidence comes from the actual target files and frozen contract,
not a capability catalog. False positives stop only that installation and retain
all files; deferring these checks until after replacement could lose user data
or mix installations. Workflow calls never depend on these checks. A concurrent
external edit during recovery is retained and reported as a recovery conflict;
do not discard its backup or journal until that conflict has been resolved.
