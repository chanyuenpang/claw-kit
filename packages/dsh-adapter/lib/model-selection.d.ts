import { type DelegationRole, type RoleModelOptions, type RoleSelection } from "../lib/role-preferences.js";
export type ModelSelectionAgent = {
    id: string;
    options?: RoleModelOptions;
};
/** Resolve soft hints before admission; never trial-launch or retry a child. */
export declare function selectDshRoleModel(input: {
    agent: ModelSelectionAgent;
    role: DelegationRole;
    supportsOptions: boolean;
    getService: (key: string) => unknown;
    hints?: {
        model?: string | null;
        reasoningEffort?: string | null;
    };
}): Promise<RoleSelection>;
