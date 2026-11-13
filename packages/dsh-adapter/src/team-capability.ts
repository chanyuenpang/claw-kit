/**
 * Read-only DSH delegation admission. No profile changes, probes, or cached leases.
 *
 * DSH 0.2.2-rc.2 removed teammate creation, messaging and the member roster from
 * `agentTeams`; the service now owns only shared task boards (`isEnabled`,
 * `setEnabled`, `createTask`, `getTask`, `listTasks`, `updateTask`). Every role
 * therefore runs on the `subagents` family: activation through
 * `startActivation` and continuation through `sendMessage`.
 */
export type DshDelegationCapability = {
  /** DSH 0.2.2-rc.2 has no Team carrier for roles; retained as a wire-stable value. */
  selectedRoute: "native" | "unknown";
  ready: boolean;
  reason?: string;
  /** Explicit adapter backend checked for managed roles, not tool closure config. */
  provider?: string;
  /** Managed continuation surface is present; actual starts can still fail. */
  reusable?: boolean;
  /** Optional launch knobs; missing support degrades preferences, not admission. */
  supportsOptions?: boolean;
};

export type DshDelegationCapabilityInput = {
  getService: (name: string) => unknown;
  agent: object;
  role: "foreground" | "finalizer" | "managed";
  provider: string;
  requestedModel?: string | null;
  requestedReasoningEffort?: string | null;
};

type RecordValue = Record<string, unknown>;
type Method = (...args: unknown[]) => unknown;
const record = (value: unknown): RecordValue | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const method = (value: unknown, name: string): Method | undefined => {
  const candidate = record(value)?.[name];
  return typeof candidate === "function" ? candidate as Method : undefined;
};
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

function inspectBackend(subagents: unknown, input: DshDelegationCapabilityInput): { reason?: string; reusable: boolean; supportsOptions?: boolean } {
  const no = (reason: string) => ({ reason, reusable: false });
  if (!text(input.provider)) return no("INVALID_PROVIDER");
  if (!method(subagents, "startActivation")) return no("NATIVE_START_UNAVAILABLE");
  // Provider metadata selects reuse only; the owner validates the real call.
  let provider: unknown;
  try { provider = method(subagents, "getProvider")?.call(subagents, input.provider); }
  catch { provider = undefined; }
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
export async function resolveDshDelegationCapability(input: DshDelegationCapabilityInput): Promise<DshDelegationCapability> {
  let snapshot: DshDelegationCapability = { selectedRoute: "unknown", ready: false };
  const fail = (reason: string): DshDelegationCapability => ({ ...snapshot, ready: false, reason });
  try {
    if (!text(input.provider)) return fail("INVALID_PROVIDER");
    snapshot = { selectedRoute: "native", ready: false, provider: input.provider };
    const backend = inspectBackend(input.getService("subagents"), input);
    if (input.role === "finalizer") snapshot = { ...snapshot, supportsOptions: backend.supportsOptions === true };
    snapshot = { ...snapshot, reusable: backend.reusable };
    if (backend.reason) return fail(backend.reason);
    return { ...snapshot, ready: true };
  } catch {
    return fail("NATIVE_PROVIDER_INSPECTION_FAILED");
  }
}
