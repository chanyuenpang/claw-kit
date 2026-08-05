# Updating claw-kit by host

Select the section for the active host. Do not ask the user to choose when the
loaded adapter already proves the host.

## Codex

Use the Codex adapter's namespaced `update` skill for an authorized update. It
updates the published global `@veewo/claw` CLI and the official
`chanyuenpang/claw-kit` Codex marketplace plugin as one unit.

Verify all of these separately:

- the published CLI version and a real `claw --version` invocation;
- the enabled official identity `claw-kit@claw-kit`;
- any local development identity such as `claw-kit@claw-kit-local` is disabled;
- the marketplace source, installed manifest, and active cache agree;
- a restarted/new Codex task loads the refreshed plugin when runtime adoption
  is part of the request.

Do not use Cindy's marketplace steps or unpublished workspace files.

## Cindy

Cindy intentionally does not expose a claw-kit `update` skill. Guide the user
through the Cindy interface:

<!-- cindy-update-steps: plugins,market,installed-markets,return-plugins,update-claw-kit -->

1. Open the **Plugins** page.
2. Click **Market** in the upper-right corner.
3. Open **Installed Markets** and refresh the claw-kit market source.
4. Return to the **Plugins** page.
5. Update **claw-kit** from its plugin entry.

Refreshing the installed market updates available source metadata. It does not
install the plugin update; the user must return to the plugin page and accept
the claw-kit update separately. Do not download or open a `.cindy` archive.

## OpenCode

Use the OpenCode adapter's `update` skill for an authorized update. Refresh the
published global CLI together with the installed OpenCode plugin, skill copies,
agent definitions, and plugin shim. Inside the claw-kit repository,
`npm run install:opencode-plugin` is the maintained installation path.

Verify the global CLI, plugin payload, discovery-directory skills, agent files,
workflow guidance, and the new-session/restart boundary. Do not edit installed
copies directly or report success from only one refreshed surface.

## OpenClaw

The OpenClaw adapter is a native skill-bearing plugin declared by
`packages/openclaw-adapter/openclaw.plugin.json` and released through
`vopenclaw-*`. For a managed installation, use OpenClaw's plugin lifecycle:

```text
openclaw plugins update claw-kit
```

Then verify that the `claw-kit` plugin is enabled, its installed manifest and
source version agree, and a new or refreshed session discovers
`claw-kit-doc`. If the adapter is linked from a local path, refresh that owning
source instead of pretending a managed update changed it.

Do not substitute the Codex, Cindy, or OpenCode updater or treat a downloaded
release source as installed runtime proof.
