function unavailable() {
    return Object.assign(new Error("NATIVE_START_UNAVAILABLE"), {
        code: "NATIVE_START_UNAVAILABLE", outcome: "known", effect: "none", phase: "before-call",
    });
}
/** One flattened admission spec: no nested `request` and explicit delivery. */
export function nativeActivationSpec(launch, input) {
    return {
        provider: input.provider, label: input.label, signal: input.signal,
        delivery: input.delivery ?? "caller",
        parent: launch.parent, prompt: launch.prompt,
        ...(launch.agentOptions && Object.keys(launch.agentOptions).length ? { agentOptions: launch.agentOptions } : {}),
        ...(launch.childId !== undefined ? { childId: launch.childId } : {}),
        ...(launch.name !== undefined ? { name: launch.name } : {}),
    };
}
export async function startNativeActivation(service, spec) {
    const native = service;
    if (typeof native?.startActivation === "function")
        return native.startActivation(spec);
    throw unavailable();
}
/** Names are 1-32 lower-case letters, digits or hyphens starting with a letter. */
const NAMED = /^[a-z][a-z0-9-]{0,31}$/;
/** Request a stable child name when the label yields one; otherwise let the host mint `agent-N`. */
export function nativeChildName(label, reserved) {
    if (reserved !== undefined)
        return NAMED.test(reserved) && reserved !== "lead" ? reserved : undefined;
    if (!label)
        return undefined;
    const normalized = label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    return NAMED.test(normalized) && normalized !== "lead" ? normalized : undefined;
}
//# sourceMappingURL=native-start.js.map