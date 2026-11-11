import fs from "node:fs/promises";
import path from "node:path";
export * from "./contracts.js";
/**
 * OpenClaw plugin entry for claw-kit.
 *
 * Phase 0 (this version):
 *  - Ships the standard claw-kit skills (planning, config, create-claw-skill,
 *    feature-architecture, researcher, using-claw-kit, claw-kit-doc) via the
 *    plugin `skills/` directory.
 *  - Registers a `before_prompt_build` host hook that detects whether the
 *    current agent workspace is a claw-kit (.claw) project and, when it is,
 *    injects a short context reminder to load `using-claw-kit` before planning.
 *
 * The entry object follows the OpenClaw "default entry object" contract. We
 * hand-roll it (rather than importing `definePluginEntry` from the OpenClaw
 * SDK) so the adapter package has no compile/runtime dependency on the OpenClaw
 * host package itself; OpenClaw validates the shape at load time.
 */
export default {
    id: "claw-kit",
    name: "claw-kit",
    description: "claw-kit OpenClaw adapter: .claw project workflow (plan, recall, truth/ADR closeout) plus the standard claw-kit skills.",
    configSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
    },
    register(api) {
        const a = api;
        if (!a || typeof a.on !== "function") {
            return;
        }
        a.on("before_prompt_build", async (_event, ctx) => {
            try {
                const c = ctx;
                const workspaceDir = c?.workspaceDir;
                if (!workspaceDir) {
                    return;
                }
                const projectJson = path.join(workspaceDir, ".claw", "project.json");
                const isClawProject = await fs
                    .access(projectJson)
                    .then(() => true)
                    .catch(() => false);
                if (!isClawProject) {
                    return;
                }
                return {
                    appendContext: "This workspace is a claw-kit (.claw) project. Before starting project work or planning a multi-step task, load and follow the `using-claw-kit` skill and restore the current workflow with `claw context`. Do not create a plan for every question.",
                };
            }
            catch {
                return;
            }
        }, { priority: 50 });
    },
};
//# sourceMappingURL=index.js.map