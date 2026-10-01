import { type DshDelegationCapability } from "./team-capability.js";
export type FinalizerAgent = {
    id: string;
    options?: {
        provider?: string;
        model?: string;
        reasoningEffort?: string;
    };
    session?: {
        header?: {
            parentSession?: string;
        };
    };
};
export type ReusableDispatch = {
    finalizeId: string;
    prompt: string;
    model?: string | null;
    reasoningEffort?: string | null;
};
type Json = Record<string, unknown>;
export type FinalizerRoleDependencies = {
    getService(name: string): unknown;
    command(operation: "inspect" | "reserve" | "delivery" | "release", actorId: string, workdir: string, args: string[]): Promise<Json>;
    readParentEvents(parentId: string): Promise<unknown[]>;
    signal: AbortSignal;
};
export declare function finalizerConfigFingerprint(agent: FinalizerAgent, workdir: string, dispatch: ReusableDispatch, provider: string): string;
export declare function nativeFinalizerRoleId(parentId: string, fingerprint: string): string;
/** Per-parent admission serialization only; canonical jobs, not this map, own execution. */
export declare class FinalizerRoleDispatcher {
    private readonly deps;
    private admissions;
    constructor(deps: FinalizerRoleDependencies);
    dispatch(agent: FinalizerAgent, workdir: string, dispatch: ReusableDispatch, capability: DshDelegationCapability): Promise<Json>;
    private call;
    private fresh;
    private acknowledged;
    recoverAcknowledgement(agent: FinalizerAgent, workdir: string, finalizeId: string): Promise<Json | undefined>;
    private recoverTeamReceipt;
    private member;
    private dispatchSerial;
}
export {};
