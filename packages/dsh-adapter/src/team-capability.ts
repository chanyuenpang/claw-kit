/** Read-only DSH delegation admission. No profile changes, probes, or cached leases. */
export type DshDelegationCapability = {
  selectedRoute: "team" | "native" | "unknown";
  ready: boolean;
  reason?: string;
  teamId?: string;
  leadId?: string;
  /** Explicit adapter backend checked for managed roles, not Team tool closure config. */
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

type ToolView = { available: boolean; definitions: Map<string, unknown>; reason?: string };
const TEAM_CORE = ["spawn_teammate", "send_message", "list_agents", "wait_agent"];
const TEAM_TASKS = ["team_task_create", "team_task_list", "team_task_get", "team_task_update"];

function inspectTools(tools: unknown, agent: object, foreground: boolean): ToolView {
  const definitions = new Map<string, unknown>();
  const get = method(tools, "get");
  const schemas = method(tools, "schemas");
  if (!get && !schemas) return { available: false, definitions };
  // Finalizers use business services; model wait/list/task operations are not
  // execution dependencies. Unique Team names still reveal partial exposure.
  const names = foreground ? [...TEAM_CORE, ...TEAM_TASKS, "subagent"]
    : ["spawn_teammate", "send_message", ...TEAM_TASKS];
  if (get) {
    try {
      for (const name of names) {
        const definition = get.call(tools, name, agent);
        if (definition !== undefined) definitions.set(name, definition);
      }
    } catch { return { available: false, definitions, reason: "SCOPED_TOOL_INSPECTION_FAILED" }; }
  } else {
    let visible: unknown;
    try { visible = schemas!.call(tools, agent); }
    catch { return { available: false, definitions, reason: "SCOPED_TOOL_INSPECTION_FAILED" }; }
    if (!Array.isArray(visible)) return { available: false, definitions, reason: "SCOPED_TOOL_SCHEMAS_INVALID" };
    for (const definition of visible) {
      const name = text(record(definition)?.name);
      if (!name) return { available: true, definitions, reason: "SCOPED_TOOL_SCHEMAS_INVALID" };
      if (!names.includes(name)) continue;
      if (definitions.has(name)) return { available: true, definitions, reason: "SCOPED_TOOL_SCHEMAS_AMBIGUOUS" };
      definitions.set(name, definition);
    }
  }
  return { available: true, definitions };
}

function teamExposed(view: ToolView): boolean {
  if (view.definitions.has("spawn_teammate")) return true;
  const parameters = record(record(view.definitions.get("send_message"))?.parameters);
  const properties = record(parameters?.properties) ?? parameters;
  return properties !== undefined && Object.hasOwn(properties, "target");
}

function surfaceReason(view: ToolView, team: boolean, foreground: boolean): string | undefined {
  // Tool schemas are route hints, not business authorization. The actual Team
  // or subagent method owns argument and permission validation.
  return undefined; // A catalog is a transport hint, never the Host permission owner.
}

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
 * Current-Agent scoped Team tool exposure selects Team, not profile inventory
 * or chat declarations. No Team surface selects native, even if a residual
 * agentTeams service exists. Partial/invalid exposure is diagnosed, not used.
 * Foreground readiness checks the caller's dispatch surface, not the private
 * provider selected inside the host tool. New background finalizers use the
 * native service family; model/effort hints are resolved separately as soft
 * preferences, not an exact-match permission gate.
 * Call again immediately before admission; this snapshot is not authorization
 * for replaying or switching an already admitted job.
 */
export async function resolveDshDelegationCapability(input: DshDelegationCapabilityInput): Promise<DshDelegationCapability> {
  let snapshot: DshDelegationCapability = { selectedRoute: "unknown", ready: false };
  const fail = (reason: string): DshDelegationCapability => ({ ...snapshot, ready: false, reason });
  let stage = "SCOPED_TOOL_INSPECTION_FAILED";
  try {
    // New background finalizers use the native service family even when Team
    // tools are mounted. Foreground Team authorization remains unchanged.
    const view: ToolView = input.role === "finalizer"
      ? { available: true, definitions: new Map() }
      : inspectTools(input.getService("tools"), input.agent, input.role === "foreground");
    const team = teamExposed(view);
    snapshot = { selectedRoute: team ? "team" : "native", ready: false };
    const surface = surfaceReason(view, team, input.role === "foreground");
    if (surface) return fail(surface);
    if (team) {
      stage = "TEAM_SERVICE_UNAVAILABLE";
      const service = input.getService("agentTeams");
      const tryMembership = method(service, "tryMembership");
      if (!method(service, "listMembers") || !method(service, "spawnTeammate") || !method(service, "sendMessage")) {
        return fail("TEAM_SERVICE_UNAVAILABLE");
      }
      stage = "TEAM_MEMBERSHIP_UNAVAILABLE";
      let membership: Record<string, unknown> | undefined;
      try { membership = record(tryMembership?.call(service, input.agent)); } catch { /* owner dispatch will expose permission failures */ }
      const leadId = text(record(input.agent)?.id);
      const teamId = text(membership?.id);
      snapshot = { ...snapshot, ...(teamId ? { teamId } : {}), ...(leadId ? { leadId } : {}) };
      if (input.role !== "foreground") snapshot = { ...snapshot, provider: input.provider, reusable: true };
    }
    if (!team && input.role !== "foreground") {
      stage = "NATIVE_PROVIDER_INSPECTION_FAILED";
      snapshot = { ...snapshot, provider: input.provider };
      const backend = inspectBackend(input.getService("subagents"), input);
      if (input.role === "finalizer") snapshot = { ...snapshot, supportsOptions: backend.supportsOptions === true };
      snapshot = { ...snapshot, reusable: backend.reusable };
      if (backend.reason) return fail(backend.reason);
    }
    return { ...snapshot, ready: true };
  } catch {
    return fail(stage);
  }
}
