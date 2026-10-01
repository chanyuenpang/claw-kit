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
export declare function resolveDshDelegationCapability(input: DshDelegationCapabilityInput): Promise<DshDelegationCapability>;
