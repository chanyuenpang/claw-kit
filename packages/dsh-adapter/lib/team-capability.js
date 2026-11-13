const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
const method = (value, name) => {
    const candidate = record(value)?.[name];
    return typeof candidate === "function" ? candidate : undefined;
};
const text = (value) => typeof value === "string" && value.trim() ? value : undefined;
function inspectBackend(subagents, input) {
    const no = (reason) => ({ reason, reusable: false });
    if (!text(input.provider))
        return no("INVALID_PROVIDER");
    if (!method(subagents, "startActivation"))
        return no("NATIVE_START_UNAVAILABLE");
    // Provider metadata selects reuse only; the owner validates the real call.
    let provider;
    try {
        provider = method(subagents, "getProvider")?.call(subagents, input.provider);
    }
    catch {
        provider = undefined;
    }
    const reusable = Boolean(method(subagents, "sendMessage") && method(provider, "prepareContinuable"));
    return { reusable, supportsOptions: record(record(provider)?.capabilities)?.agentOptions === true };
}
/**
 * Route all roles through the `subagents` family. `agentTeams` is intentionally
 * not consulted: rc.2 owns no member or message operation there, and tool
 * schemas are transport hints rather than business authorization.
 * Call again immediately before admission; this snapshot is not authorization
 * for replaying or switching an already admitted job.
 */
export async function resolveDshDelegationCapability(input) {
    let snapshot = { selectedRoute: "unknown", ready: false };
    const fail = (reason) => ({ ...snapshot, ready: false, reason });
    try {
        if (!text(input.provider))
            return fail("INVALID_PROVIDER");
        snapshot = { selectedRoute: "native", ready: false, provider: input.provider };
        const backend = inspectBackend(input.getService("subagents"), input);
        if (input.role === "finalizer")
            snapshot = { ...snapshot, supportsOptions: backend.supportsOptions === true };
        snapshot = { ...snapshot, reusable: backend.reusable };
        if (backend.reason)
            return fail(backend.reason);
        return { ...snapshot, ready: true };
    }
    catch {
        return fail("NATIVE_PROVIDER_INSPECTION_FAILED");
    }
}
//# sourceMappingURL=team-capability.js.map