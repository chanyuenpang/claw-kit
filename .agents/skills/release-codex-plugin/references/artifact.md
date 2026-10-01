# Codex plugin release contract

- Scope: Codex runtime source, its declared canonical skill inputs, and marketplace packaging metadata. The raw adapter source is not a complete installed plugin.
- Bump only the adapter fourth segment; keep CLI/core and other adapters unchanged.
- Keep `.codex-plugin/plugin.json` equal to the adapter package version.
- Validate canonical inputs with `npm run check:skill-sources`, assemble the flat
  plugin/marketplace artifacts, and run `npm run check:template-versions` to
  verify every built-in skill package with `TEMPLATE.json` matches
  `TEMPLATE_DRIVER_VERSION`, verify the exported marketplace payload,
  and review the complete diff.
- Require clean `main`, `HEAD == origin/main`, `npm run verify:release`, tag
  `vcodex-<version>`, and a GitHub Release.
- Export the complete Git tree with `npm run export:codex-marketplace -- --out-dir <isolated-output>`.
  Publish that composed tree only to an explicitly authorized artifact Git target/ref;
  do not assume a raw source main/tag is installable or recreate source skill copies.
  The official repository uses its existing immutable `vcodex-<version>` artifact
  tag namespace, not a new publication branch. Record the reviewed main source and
  separate composed artifact commit; never move main to an artifact-only tree.
  Local export authorizes no upload; ask before using a different repository/ref. Do not attach a ZIP or publish npm packages.
- Refresh the maintainer installation only when separately requested, after the
  GitHub source is verified. That refresh must remove every local claw-kit
  marketplace registration, plugin identity, hook configuration, and cache
  tree; then update from the published GitHub source, enable only
  `claw-kit@claw-kit`, and verify the official source/cache manifests. Do not
  retain or enable a local claw-kit identity for normal Codex use.
