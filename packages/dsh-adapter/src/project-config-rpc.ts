import { serializeFailure } from "../lib/errors.js";

export type WorkspaceRecord = { id?: string; title?: string; path?: string };
export type WorkspaceRegistry = {
  list(): readonly WorkspaceRecord[] | Promise<readonly WorkspaceRecord[]>;
  get?(id: string): WorkspaceRecord | undefined;
};
export type RunConfig = (argv: string[], cwd: string) => Promise<{ text: string; errText: string }>;

type RpcResult = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: object } };

const LAYERS = new Set(["team", "personal"]);

/**
 * Browser-facing config bridge. The browser identifies a registry record only;
 * path resolution, claw-project validation, and CLI execution stay on the Host.
 */
export async function handleProjectConfigRpc(
  endpoint: string,
  payload: unknown,
  registry: WorkspaceRegistry,
  runConfig: RunConfig,
): Promise<RpcResult> {
  try {
    if (endpoint === "list") {
      asObject(payload);
      const items = (await registry.list()).flatMap((workspace) => {
        if (typeof workspace.path !== "string" || typeof workspace.id !== "string") return [];
        return [{ workspaceId: workspace.id, title: typeof workspace.title === "string" ? workspace.title : workspace.id }];
      });
      return { ok: true, value: { items } };
    }

    const request = asObject(payload);
    const workspaceId = requiredString(request, "workspaceId");
    const workspace = typeof registry.get === "function"
      ? registry.get(workspaceId)
      : (await registry.list()).find((candidate) => candidate.id === workspaceId);
    if (!workspace?.path) return failure("WORKSPACE_NOT_REGISTERED", "The requested workspace is not registered.");

    if (endpoint === "get") {
      return await invoke(["config", "get", "--layer", layer(request), "--key", requiredString(request, "key")], workspace.path, runConfig);
    }
    if (endpoint === "set") {
      return await invoke([
        "config", "set", "--layer", layer(request), "--key", requiredString(request, "key"),
        "--value", JSON.stringify(request.value), "--revision", requiredString(request, "revision"),
      ], workspace.path, runConfig);
    }
    if (endpoint === "unset") {
      return await invoke([
        "config", "unset", "--layer", layer(request), "--key", requiredString(request, "key"),
        "--revision", requiredString(request, "revision"),
      ], workspace.path, runConfig);
    }
    return failure("ENDPOINT_NOT_FOUND", "Unknown claw project configuration endpoint.");
  } catch (error) {
    const diagnostic = serializeFailure(error, { fallbackCode: "PROJECT_CONFIG_REQUEST_INVALID", operation: `config.${endpoint}`, origin: "dsh" });
    return { ok: false, error: { ...diagnostic, details: {} } };
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request payload must be an object.");
  return value as Record<string, unknown>;
}

function requiredString(source: Record<string, unknown>, key: string): string {
  if (typeof source[key] !== "string" || !String(source[key]).trim()) throw new Error(`${key} must be a non-empty string.`);
  return String(source[key]);
}

function layer(source: Record<string, unknown>): string {
  const value = requiredString(source, "layer");
  if (!LAYERS.has(value)) throw new Error("layer must be team or personal.");
  return value;
}

async function invoke(argv: string[], cwd: string, runConfig: RunConfig): Promise<RpcResult> {
  const result = await runConfig(argv, cwd);
  // runConfig owns process success/failure. The config CLI returns a key
  // snapshot directly, not the workflow protocol's `ok` envelope.
  try {
    return { ok: true, value: JSON.parse(result.text) as unknown };
  } catch {
    return failure("PROJECT_CONFIG_RESPONSE_INVALID", "配置命令已执行，但返回结果无法解析。请刷新配置确认当前值。");
  }
}

function failure(code: string, message: string): RpcResult {
  return { ok: false, error: { code, message, details: {} } };
}
