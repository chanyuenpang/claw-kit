const LAYERS = new Set(["team", "personal"]);
/**
 * Browser-facing config bridge. The browser identifies a registry record only;
 * path resolution, claw-project validation, and CLI execution stay on the Host.
 */
export async function handleProjectConfigRpc(endpoint, payload, registry, runConfig) {
    try {
        if (endpoint === "list") {
            asObject(payload);
            const items = (await registry.list()).flatMap((workspace) => {
                if (typeof workspace.path !== "string" || typeof workspace.id !== "string")
                    return [];
                return [{ workspaceId: workspace.id, title: typeof workspace.title === "string" ? workspace.title : workspace.id }];
            });
            return { ok: true, value: { items } };
        }
        const request = asObject(payload);
        const workspaceId = requiredString(request, "workspaceId");
        const workspace = typeof registry.get === "function"
            ? registry.get(workspaceId)
            : (await registry.list()).find((candidate) => candidate.id === workspaceId);
        if (!workspace?.path)
            return failure("WORKSPACE_NOT_REGISTERED", "The requested workspace is not registered.");
        if (endpoint === "get") {
            return invoke(["config", "get", "--layer", layer(request), "--key", requiredString(request, "key")], workspace.path, runConfig);
        }
        if (endpoint === "set") {
            return invoke([
                "config", "set", "--layer", layer(request), "--key", requiredString(request, "key"),
                "--value", JSON.stringify(request.value), "--revision", requiredString(request, "revision"),
            ], workspace.path, runConfig);
        }
        if (endpoint === "unset") {
            return invoke([
                "config", "unset", "--layer", layer(request), "--key", requiredString(request, "key"),
                "--revision", requiredString(request, "revision"),
            ], workspace.path, runConfig);
        }
        return failure("ENDPOINT_NOT_FOUND", "Unknown claw project configuration endpoint.");
    }
    catch (error) {
        return failure("PROJECT_CONFIG_REQUEST_INVALID", error instanceof Error ? error.message : String(error));
    }
}
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Request payload must be an object.");
    return value;
}
function requiredString(source, key) {
    if (typeof source[key] !== "string" || !String(source[key]).trim())
        throw new Error(`${key} must be a non-empty string.`);
    return String(source[key]);
}
function layer(source) {
    const value = requiredString(source, "layer");
    if (!LAYERS.has(value))
        throw new Error("layer must be team or personal.");
    return value;
}
async function invoke(argv, cwd, runConfig) {
    const result = await runConfig(argv, cwd);
    const text = result.text.trim();
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && "ok" in parsed) {
            if (parsed.ok === true)
                return { ok: true, value: parsed };
            if (parsed.ok === false) {
                const error = parsed.error;
                return failure(typeof error?.code === "string" ? error.code : "PROJECT_CONFIG_COMMAND_FAILED", typeof error?.message === "string" ? error.message : "claw config failed.");
            }
        }
        return failure("PROJECT_CONFIG_COMMAND_FAILED", result.errText || "claw config returned no trusted result envelope.");
    }
    catch {
        return failure("PROJECT_CONFIG_COMMAND_FAILED", result.errText || "claw config returned invalid JSON.");
    }
}
function failure(code, message) {
    return { ok: false, error: { code, message, details: {} } };
}
//# sourceMappingURL=project-config-rpc.js.map