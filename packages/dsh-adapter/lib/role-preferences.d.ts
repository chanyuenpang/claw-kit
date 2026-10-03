// Generated from packages/core/src/role-preferences.ts; do not edit this artifact.
/** Host-neutral intent. Adapters, not model names, own capability discovery. */
export type DelegationRole = "feature-architect" | "researcher" | "finalizer";
export type RoleModelIntent = "high-capability" | "inherit" | "low-cost";
export type RoleModelOptions = {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
};
export type RoleSelection = {
    requested: {
        intent: RoleModelIntent;
        model?: string;
        reasoningEffort?: string;
    };
    applied: {
        mode: "explicit" | "inherit";
        options: RoleModelOptions;
        inheritanceBasis?: RoleModelOptions;
    };
    resolved: {
        known: false;
    } | ({
        known: true;
    } & RoleModelOptions);
    reason: "preferred" | "inherit-role" | "options-unavailable" | "catalog-unavailable" | "model-unavailable" | "model-alternative" | "effort-unavailable" | "host-default" | "reuse-existing";
};
export type RoleSelectionInput = {
    role: DelegationRole;
    hints?: {
        model?: string | null;
        reasoningEffort?: string | null;
    };
    supportsOptions: boolean;
    /** A candidate explicitly validated by the Host, never inferred from branding. */
    candidate?: RoleModelOptions;
    /** Optional caller facts; this is a compatibility basis, not child proof. */
    inherited?: RoleModelOptions;
    catalogAvailable?: boolean;
};
export declare function roleModelIntent(role: DelegationRole): RoleModelIntent;
/** Pure best-effort selection; permission and delivery are separate hard checks. */
export declare function selectRoleModelPreference(input: RoleSelectionInput): RoleSelection;
/** Reusing an existing role submits no new model options; never claim otherwise. */
export declare function reuseExistingRoleSelection(selection: RoleSelection): RoleSelection;
/** Compatibility depends on submitted parameters, not unfulfilled preferences. */
export declare function roleLaunchRecipe(selection: RoleSelection): RoleSelection["applied"];
/** Normalize optional operational metadata; unknown fields are forward-compatible. */
export declare function parseRoleSelection(value: unknown): RoleSelection;
/** Optional soft metadata must never become an execution availability gate. */
export declare function tryParseRoleSelection(value: unknown): RoleSelection | undefined;
