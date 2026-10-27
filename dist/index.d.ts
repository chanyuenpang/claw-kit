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
declare const _default: {
    id: string;
    name: string;
    description: string;
    configSchema: {
        type: string;
        additionalProperties: boolean;
        properties: {};
    };
    register(api: unknown): void;
};
export default _default;
