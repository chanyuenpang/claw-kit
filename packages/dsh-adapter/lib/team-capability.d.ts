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
/**
 * Route all roles through the `subagents` family. `agentTeams` is intentionally
 * not consulted: rc.2 owns no member or message operation there, and tool
 * schemas are transport hints rather than business authorization.
 * Call again immediately before admission; this snapshot is not authorization
 * for replaying or switching an already admitted job.
 */
export declare function resolveDshDelegationCapability(input: DshDelegationCapabilityInput): Promise<DshDelegationCapability>;
