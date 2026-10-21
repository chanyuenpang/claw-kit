/** Call the current native admission API once; never replay an owner failure. */
export type NativeRequest = {
  parent: unknown;
  prompt: { type: string; text: string }[];
  agentOptions?: { provider?: string; model?: string; reasoningEffort?: string };
};
export type NativeActivationSpec = {
  provider: string; label?: string; childId?: string; signal: AbortSignal;
  request: NativeRequest;
};
export type NativeActivation = {
  childId: string; messageId?: string; result?: Promise<unknown>; dispose?: () => Promise<void>;
};
export type NativeStartService = {
  startActivation?(spec: NativeActivationSpec): Promise<NativeActivation>;
};
function unavailable(): Error {
  return Object.assign(new Error("NATIVE_START_UNAVAILABLE"), {
    code: "NATIVE_START_UNAVAILABLE", outcome: "known", effect: "none", phase: "before-call",
  });
}
export async function startNativeActivation(service: unknown, spec: NativeActivationSpec): Promise<NativeActivation> {
  const native = service as NativeStartService | undefined;
  if (typeof native?.startActivation === "function") return native.startActivation(spec);
  throw unavailable();
}

