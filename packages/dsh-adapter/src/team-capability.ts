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

function inheritedRequestReason(input: DshDelegationCapabilityInput): string | undefined {
  const options = record(record(input.agent)?.options);
  for (const [requested, field, label] of [
    [input.requestedModel, "model", "MODEL"],
    [input.requestedReasoningEffort, "reasoningEffort", "REASONING_EFFORT"],
  ] as const) {
    if (requested === undefined || requested === null) continue;
    if (!text(requested)) return "INVALID_REQUESTED_" + label;
    const inherited = text(options?.[field]);
    if (inherited === undefined) return "TEAM_" + label + "_INHERITANCE_UNKNOWN";
    if (requested !== inherited) return "TEAM_" + label + "_OVERRIDE_UNSUPPORTED";
  }
  return undefined;
}

/** Accept JSON-schema parameters or the DSH definition's parameter-spec shape. */
function hasParameters(definition: unknown, names: readonly string[]): boolean {
  const parameters = record(record(definition)?.parameters);
  if (!parameters) return false;
  const properties = record(parameters.properties) ?? parameters;
  return names.every((name) => record(properties[name])?.type === "string");
}

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
    for (const name of names) {
      const definition = get.call(tools, name, agent);
      if (definition !== undefined) definitions.set(name, definition);
    }
  } else {
    const visible = schemas!.call(tools, agent);
    if (!Array.isArray(visible)) return { available: true, definitions, reason: "SCOPED_TOOL_SCHEMAS_INVALID" };
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
  if (["spawn_teammate", ...TEAM_TASKS].some((name) => view.definitions.has(name))) return true;
  const parameters = record(record(view.definitions.get("send_message"))?.parameters);
  const properties = record(parameters?.properties) ?? parameters;
  return properties !== undefined && Object.hasOwn(properties, "target");
}

function surfaceReason(view: ToolView, team: boolean, foreground: boolean): string | undefined {
  const lookup = (name: string) => view.definitions.get(name);
  if (team && !foreground) {
    // A valid exact-Agent spawn interface is the enablement signal only.
    // Dispatch/list/reuse are subsequently verified on agentTeams itself.
    return hasParameters(lookup("spawn_teammate"), ["name", "description", "prompt"])
      ? undefined : "TEAM_FINALIZER_SIGNAL_INVALID";
  }
  for (const definition of view.definitions.values()) {
    if (!record(definition) || !record(record(definition)?.parameters)) return "SCOPED_TOOL_SCHEMAS_INVALID";
  }
  if (!team) {
    if (!foreground) return undefined;
    if (!view.available) return "SCOPED_TOOLS_UNAVAILABLE";
    return hasParameters(lookup("subagent"), ["prompt", "description"])
      ? undefined : "NATIVE_FOREGROUND_TOOLS_UNAVAILABLE";
  }
  if (!hasParameters(lookup("spawn_teammate"), ["name", "description", "prompt"]) ||
      !hasParameters(lookup("send_message"), ["target", "message"])) return "TEAM_FOREGROUND_TOOL_SCHEMA_MISMATCH";
  const required = [...TEAM_CORE, ...TEAM_TASKS];
  if (required.some((name) => !record(lookup(name)))) return "TEAM_FOREGROUND_TOOLS_UNAVAILABLE";
  return undefined;
}

function inspectBackend(subagents: unknown, input: DshDelegationCapabilityInput, team: boolean): { reason?: string; reusable: boolean } {
  const no = (reason: string) => ({ reason, reusable: false });
  const getProvider = method(subagents, "getProvider");
  if (!getProvider) return no("NATIVE_PROVIDER_CATALOG_UNAVAILABLE");
  if (!text(input.provider)) return no("INVALID_PROVIDER");
  const provider = getProvider.call(subagents, input.provider);
  if (!record(provider)) return no("PROVIDER_UNAVAILABLE");
  if (record(provider)?.name !== input.provider) return no("PROVIDER_IDENTITY_MISMATCH");
  if (record(provider)?.inheritsParentContext !== false) return no("PROVIDER_FRESH_CONTEXT_UNSUPPORTED");
  const reusable = Boolean(method(subagents, "startContinuable") && method(subagents, "sendMessage") && method(provider, "prepareContinuable"));
  if (team && !reusable) return no("PROVIDER_CONTINUABLE_UNSUPPORTED");
  if (!team && (!method(subagents, "start") || !method(provider, "start"))) return no("NATIVE_START_UNAVAILABLE");
  const options = record(record(input.agent)?.options);
  const needsOverrides = (input.requestedModel != null && input.requestedModel !== options?.model) ||
    (input.requestedReasoningEffort != null && input.requestedReasoningEffort !== options?.reasoningEffort);
  if (!team && needsOverrides && record(record(provider)?.capabilities)?.agentOptions !== true) return no("NATIVE_MODEL_OPTIONS_UNSUPPORTED");
  return { reusable };
}

/**
 * Current-Agent scoped Team tool exposure selects Team, not profile inventory
 * or chat declarations. No Team surface selects native, even if a residual
 * agentTeams service exists. Partial/invalid exposure is diagnosed, not used.
 * Foreground readiness checks the caller's dispatch surface, not the private
 * provider selected inside the host tool. Finalizers require only the scoped
 * spawn signal plus exact Team business services and the explicit backend.
 * Call again immediately before admission; this snapshot is not authorization
 * for replaying or switching an already admitted job.
 */
export async function resolveDshDelegationCapability(input: DshDelegationCapabilityInput): Promise<DshDelegationCapability> {
  let snapshot: DshDelegationCapability = { selectedRoute: "unknown", ready: false };
  const fail = (reason: string): DshDelegationCapability => ({ ...snapshot, ready: false, reason });
  let stage = "SCOPED_TOOL_INSPECTION_FAILED";
  try {
    const view = inspectTools(input.getService("tools"), input.agent, input.role === "foreground");
    if (view.reason) return fail(view.reason);
    const team = teamExposed(view);
    snapshot = { selectedRoute: team ? "team" : "native", ready: false };
    const surface = surfaceReason(view, team, input.role === "foreground");
    if (surface) return fail(surface);
    if (input.requestedModel != null && !text(input.requestedModel)) return fail("INVALID_REQUESTED_MODEL");
    if (input.requestedReasoningEffort != null && !text(input.requestedReasoningEffort)) return fail("INVALID_REQUESTED_REASONING_EFFORT");
    if (team) {
      stage = "TEAM_SERVICE_UNAVAILABLE";
      const service = input.getService("agentTeams");
      const tryMembership = method(service, "tryMembership");
      if (!tryMembership || !method(service, "listMembers") || !method(service, "spawnTeammate") || !method(service, "sendMessage")) {
        return fail("TEAM_SERVICE_UNAVAILABLE");
      }
      stage = "TEAM_MEMBERSHIP_UNAVAILABLE";
      const membership = record(tryMembership.call(service, input.agent));
      if (!membership) return fail("TEAM_CALLER_NOT_MEMBER");
      if (membership.role !== "lead" || membership.root !== input.agent) return fail("TEAM_LEAD_REQUIRED");
      const leadId = text(record(input.agent)?.id);
      const teamId = text(membership.id);
      if (!leadId || teamId !== leadId) return fail("TEAM_MEMBERSHIP_INVALID");
      snapshot = { ...snapshot, teamId, leadId };
      const requestReason = inheritedRequestReason(input);
      if (requestReason) return fail(requestReason);
    }
    if (input.role !== "foreground" || !team) {
      stage = "NATIVE_PROVIDER_INSPECTION_FAILED";
      snapshot = { ...snapshot, provider: input.provider };
      const backend = inspectBackend(input.getService("subagents"), input, team);
      if (input.role !== "foreground") snapshot = { ...snapshot, reusable: backend.reusable };
      if (backend.reason) return fail(backend.reason);
    }
    return { ...snapshot, ready: true };
  } catch {
    return fail(stage);
  }
}
