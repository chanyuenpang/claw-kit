/** Call the current native admission API once; never replay an owner failure. */
export type NativeRequest = {
    parent: unknown;
    prompt: {
        type: string;
        text: string;
    }[];
    agentOptions?: {
        provider?: string;
        model?: string;
        reasoningEffort?: string;
    };
};
export type NativeActivationSpec = {
    provider: string;
    label?: string;
    childId?: string;
    signal: AbortSignal;
    request: NativeRequest;
};
export type NativeActivation = {
    childId: string;
    messageId?: string;
    result?: Promise<unknown>;
    dispose?: () => Promise<void>;
};
export type NativeStartService = {
    startActivation?(spec: NativeActivationSpec): Promise<NativeActivation>;
};
export declare function startNativeActivation(service: unknown, spec: NativeActivationSpec): Promise<NativeActivation>;
