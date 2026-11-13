/**
 * Call the current native admission API once; never replay an owner failure.
 *
 * DSH 0.2.2-rc.2 flattened the spawn request: `parent`, `prompt`, `agentOptions`,
 * `childId` and `name` are top-level sibling fields of `provider`/`label`, and
 * `delivery` plus `signal` are required. `delivery: "caller"` returns the result
 * without the model-facing parent notification, which the adapter already owns.
 */
type Content = {
    type: string;
    text: string;
}[];
export type NativeAgentOptions = {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
};
/** Launch facts that belong to the request, never to cancellation or delivery. */
export type NativeLaunch = {
    parent: unknown;
    prompt: Content;
    agentOptions?: NativeAgentOptions;
    childId?: string;
    name?: string;
};
export type NativeActivationSpec = {
    provider: string;
    label: string;
    signal: AbortSignal;
    delivery?: "parent" | "caller";
} & NativeLaunch;
export type NativeActivation = {
    childId: string;
    name?: string;
    messageId?: string;
    result?: Promise<unknown>;
    dispose?: () => Promise<void>;
};
export type NativeStartService = {
    startActivation?(spec: NativeActivationSpec): Promise<NativeActivation>;
};
/** One flattened admission spec: no nested `request` and explicit delivery. */
export declare function nativeActivationSpec(launch: NativeLaunch, input: {
    provider: string;
    label: string;
    signal: AbortSignal;
    delivery?: "parent" | "caller";
}): NativeActivationSpec;
export declare function startNativeActivation(service: unknown, spec: NativeActivationSpec): Promise<NativeActivation>;
/** Request a stable child name when the label yields one; otherwise let the host mint `agent-N`. */
export declare function nativeChildName(label: string | undefined, reserved?: string): string | undefined;
export {};
