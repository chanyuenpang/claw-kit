# Cindy plugin release handoff

The Cindy plugin is published from the independent
`chanyuenpang/claw-kit-cindy-adapter` repository, not this superproject.

- Its marketplace manifest is `.agents/plugins/marketplace.json` and its only
  entry, `claw-kit-cindy`, points to `./plugin`.
- Its release scope is limited to its `package.json`, `plugin/ghost.json`, and
  Cindy plugin payload. The adapter repository owns `vcindy-<version>` tags.
- The independent repository owns distribution, not the release line: both
  manifests must use `<cli-base>.<fourth>`. Resolve `cli-base` from the
  authorized batch candidate, or from the published `@veewo/claw` version for
  a Cindy-only release. Increment only `<fourth>` within that exact CLI base;
  never reuse an older Cindy prefix.
- Users configure Cindy with the adapter repository URL, without a pinned ref.
- Run its focused tests before tagging; do not publish an archive or GitHub
  Release for marketplace installation.
- Verify that the public skill manifest omits the Cindy `update` entry and that
  the portable `claw-kit-doc` reference contains the manual update route.

The `packages/cindy-adapter` path in this repository is only the pinned
submodule checkout. Updating that pointer is a separate, reviewable main-repo
change and is not part of an adapter-only release.
