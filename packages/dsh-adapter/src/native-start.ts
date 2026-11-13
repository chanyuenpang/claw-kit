/**
 * Call the current native admission API once; never replay an owner failure.
 *
 * DSH 0.2.2-rc.2 flattened the spawn request: `parent`, `prompt`, `agentOptions`,
 * `childId` and `name` are top-level sibling fields of `provider`/`label`, and
 * `delivery` plus `signal` are required. `delivery: "caller"` returns the result
 * without the model-facing parent notification, which the adapter already owns.
 */
type Content = { type: string; text: string }[];
export type NativeAgentOptions = { provider?: string; model?: string; reasoningEffort?: string };
/** Launch facts that belong to the request, never to cancellation or delivery. */
export type NativeLaunch = {
  parent: unknown; prompt: Content; agentOptions?: NativeAgentOptions;
  childId?: string; name?: string;
};
export type NativeActivationSpec = {
  provider: string; label: string; signal: AbortSignal; delivery?: "parent" | "caller";
} & NativeLaunch;
export type NativeActivation = {
  childId: string; name?: string; messageId?: string; result?: Promise<unknown>; dispose?: () => Promise<void>;
};
export type NativeStartService = {
  startActivation?(spec: NativeActivationSpec): Promise<NativeActivation>;
};
function unavailable(): Error {
  return Object.assign(new Error("NATIVE_START_UNAVAILABLE"), {
    code: "NATIVE_START_UNAVAILABLE", outcome: "known", effect: "none", phase: "before-call",
  });
}
/** One flattened admission spec: no nested `request` and explicit delivery. */
export function nativeActivationSpec(launch: NativeLaunch, input: {
  provider: string; label: string; signal: AbortSignal; delivery?: "parent" | "caller";
}): NativeActivationSpec {
  return {
    provider: input.provider, label: input.label, signal: input.signal,
    delivery: input.delivery ?? "caller",
    parent: launch.parent, prompt: launch.prompt,
    ...(launch.agentOptions && Object.keys(launch.agentOptions).length ? { agentOptions: launch.agentOptions } : {}),
    ...(launch.childId !== undefined ? { childId: launch.childId } : {}),
    ...(launch.name !== undefined ? { name: launch.name } : {}),
  };
}
export async function startNativeActivation(service: unknown, spec: NativeActivationSpec): Promise<NativeActivation> {
  const native = service as NativeStartService | undefined;
  if (typeof native?.startActivation === "function") return native.startActivation(spec);
  throw unavailable();
}

/** Names are 1-32 lower-case letters, digits or hyphens starting with a letter. */
const NAMED = /^[a-z][a-z0-9-]{0,31}$/;
/** Request a stable child name when the label yields one; otherwise let the host mint `agent-N`. */
export function nativeChildName(label: string | undefined, reserved?: string): string | undefined {
  if (reserved !== undefined) return NAMED.test(reserved) && reserved !== "lead" ? reserved : undefined;
  if (!label) return undefined;
  const normalized = label.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return NAMED.test(normalized) && normalized !== "lead" ? normalized : undefined;
}
