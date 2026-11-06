# Shared claw-kit skills

`@veewo/claw-skills` is the independent, cross-platform data package for the seven
complete canonical public skills. It contains `skills/`, `skills-manifest.json`,
package metadata and this README. Templates, references and resources stay adjacent.
There are no install/postinstall scripts or executable installers in the artifact.

## Data integrity contract

`skills-manifest.json` keeps schemaVersion 1. Each `skills[id]` is SHA-256 over
sorted recursive entries: update `d:<POSIX-relative-path>\0` before descending into
a directory, or `f:<POSIX-relative-path>\0` followed by the exact file bytes for a
file. Symlinks are not package entries. This preserves already-published hashes.
`sourceHash` is an opaque producer provenance fingerprint: it includes canonical
source paths and the standard input declaration, which are not reconstructed from
the flat npm package. Verify registry SRI and each delivered skill hash; do not
invent a hash-of-the-map algorithm for sourceHash.

The Cindy plugin privately declares its tested minimum in adapter package
metadata (`sharedSkills`), assembled into `node/shared-skills.json`. Its existing
resident startup calls a private Node initializer automatically, independently of
sessions and workflow admission. No new Cindy Host API, app modification/release,
or user-invoked skill installer is required. This is not a bundled skill slot and
has no four-item limit. A valid compatible existing global copy needs no network.

The package publisher owns compatible stable releases. Consumers specify a minimum
tested version, not an exact global snapshot or their own source hash. A newer
compatible global package is not downgraded by an older plugin. Version numbers
alone do not establish compatibility: breaking changes need coordinated releases.

Official skill directories under `~/.agents/skills` are replaced completely, even
if edited, including removal of obsolete resources. No backups, edit conflicts,
ownership receipts, or recovery journals are created. Paths and downloaded bytes
are validated; old installed bytes are not an authorization check. A single hidden
package manifest records successful delivery only after all official directories
are written. Other skill names remain outside the package's scope.

Build a fresh data artifact with:

```
node scripts/shared-skills-artifact.mjs <fresh-output-directory>
```

Pack that directory with `npm pack --ignore-scripts`. Source is private; only the
complete composed artifact removes that flag. Package versions are independent of
the CLI/adapter versions. Changed installable candidates must allocate a new version
before freezing; published versions are never reused for different bytes. Building
or testing source is not publication or proof of installed-host activation.

The plugin initializer uses the existing system Node/npm with a temporary local
prefix and scripts disabled; npm verifies registry/tar integrity, and the trusted
plugin verifies complete skill hashes before replacing official directories. It
serializes writes and reports preparation failure without blocking workflow calls.
Source cache/last-success metadata is not proof that a running engine has reloaded.
It does not wait inside the market installation window or force old sessions to
reload; new-session discovery still needs real-Host verification. Existing
Codex/DSH bundled distributions do not migrate because Cindy uses globals.
