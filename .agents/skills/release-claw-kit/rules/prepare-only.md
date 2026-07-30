# Prepare-only rule

- Use when the user asks to package, build, export, or dry-run without explicitly asking to publish.
- Select one artifact family and run only its version alignment, build/export, focused checks, and package dry-run.
- Do not commit, push, tag, create a GitHub release, publish npm packages, or refresh an installed plugin.
- Report the exact local artifact path and version, plus any checks that were not run because delivery was not requested.
