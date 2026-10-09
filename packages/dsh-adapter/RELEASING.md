# Releasing the DSH adapter

## Versions and local candidates

The source/display version is CLI-base.N (four segments). npm uses the existing exact mapping CLI-base-rc.N; it is the same in testing and formal publication, not a separate beta version. Never give npm a raw four-segment version.

Every new installable candidate increments its normal formal target number, including local unpublished allocations. DSH-only increments its fourth segment; CLI+Codex+DSH preparation allocates a new CLI baseline and records the selected matching adapters in one same-source candidate. No -beta suffix or same-version new bytes are allowed.

~~~text
npm run beta:prepare -- --artifacts dsh
# Review and commit the prepared version/dependency changes on local main.
npm run beta:pack -- --candidate <preparing-directory>
npm run beta:verify -- --candidate <directory>
~~~

For the combined set use --artifacts cli,codex,dsh. A failed same-input unfinished preparation may beta:resume; frozen candidates are reused, never rebuilt. Preparation does not push, publish, tag, install, restart or start a trial. Existing old same-version beta directories remain historical and are never overwritten.

## Promotion: upload tested original bytes

After authorized installation/version confirmation and seven-day trial, select the exact frozen candidate:

~~~text
npm run publish:dsh-plugin -- --candidate <directory>
npm run publish:dsh-plugin -- --candidate <directory> --publish
~~~

The first command is read-only artifact verification. --publish requires clean local main at the tested sourceRevision and no remote divergence, then sends the candidate’s original tgz with --ignore-scripts. It never builds, tests, exports, changes versions or repacks workspace source. Real registry retrieval must match the candidate SHA-256.

An exact-resource receipt records attempted/accepted/unknown/verified outside the immutable candidate. An accepted or unknown upload is only reconciled by exact registry download; it is not automatically resent. Metadata/read failures are not proof of no upload. A conflicting coordinate remains blocked locally rather than authorizing different bytes.

After verified npm retrieval, the release owner completes the authorized source push, immutable vdsh-<four-segment-version> tag and verification. Never repoint tags; require main == origin/main and a clean worktree at completion. The npm package remains @veewo/dsh-claw-kit with loader id claw-kit, never a dev-renamed alias.

## Profile delivery is separate from activation

For an explicitly authorized known non-Electron profile, install the exact published version through dsh plugin --profile <profile> add @veewo/dsh-claw-kit@<npm-version>. The Electron-managed desktop profile rejects that global CLI route: use its plugin_manager install_bundle service or Plugins page instead; never write profile files directly.

Ask for the profile when required and unknown. Package-only work does not authorize installation. Verify the installed bundle and compatible CLI; installation is not activation. Never restart a running Host without separate explicit authorization. Read the canonical desktop boundary in skills/update/references/desktop-profile-write-boundary.md.
