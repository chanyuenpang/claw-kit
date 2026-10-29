import type { ModelSelectionAgent } from "./model-selection.js";
import type { RoleSelection } from "../lib/role-preferences.js";
export type SourceDispatch = {
    schemaVersion?: number;
    dispatchId?: string;
    sourceSessionKey?: string;
    sourcePlan?: string;
    projectRoot?: string;
    prompt?: string;
    model?: string;
    reasoningEffort?: string;
};
/** Delivery dedup only. Knowledge completion belongs to the worker's ordinary plan. */
export declare function createSourceFinalizerDispatcher(input: {
    getService(name: string): unknown;
    selectModel(agent: ModelSelectionAgent, task: SourceDispatch): Promise<RoleSelection | undefined>;
}): (agent: {
    id: string;
}, workdir: string, task: SourceDispatch) => Promise<Record<string, unknown>>;
