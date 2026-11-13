import { DelegationReceiptStore, type JsonValue } from "./delegation-receipts.js";
type Json = Record<string, JsonValue>;
export type DelegationActor = {
    id: string;
    options?: {
        provider?: string;
        model?: string;
        reasoningEffort?: string;
    };
    session?: {
        header?: {
            parentSession?: string;
            cwd?: string;
        };
    };
};
export type RoleDelegationDependencies = {
    getService(name: string): unknown;
    resolveParent(actor: DelegationActor): DelegationActor | Promise<DelegationActor>;
    readContext(parent: DelegationActor): Promise<{
        activeWorkflow?: {
            planPath?: string;
        } | null;
    }>;
    /** Must check current plan identity and add the reference idempotently. */
    registerReport(parent: DelegationActor, planPath: string, documentPath: string): Promise<{
        status: "registered" | "deferred";
        reason?: string;
    }>;
    receipts?: Pick<DelegationReceiptStore, "withParent">;
    /** Trusted installation/test input, never a model argument. */
    skillRoot?: string;
    signal?: AbortSignal;
};
export declare function delegationAssignmentId(parentId: string, workdir: string, callId: string): string;
/** Narrow foreground role owner. Receipts are operational, not a second claw plan. */
export declare class RoleDelegation {
    private readonly deps;
    private store?;
    private readonly waiters;
    private readonly registrations;
    private readonly admissions;
    private readonly advances;
    private readonly signal;
    constructor(deps: RoleDelegationDependencies);
    private receipts;
    private scope;
    private read;
    private update;
    private view;
    private notify;
    private capability;
    private fresh;
    /**
     * Direct children from the rc.2 catalog. The service exposes
     * `listDescendants(rootSessionId)` rather than rc.1's `listChildren(parentId)`,
     * so read the tree once and keep the rows whose direct parent is this one.
     */
    private nativeCatalog;
    private targetDiagnostic;
    start(actor: DelegationActor, workdir: string, callId: string, raw: unknown): Promise<Json>;
    private runAdmitted;
    private advance;
    private bootstrap;
    private prompt;
    private dispatch;
    /** rc.2 catalog rows carry the durable id/label and a mode; diagnostics are filtered by id only. */
    private roleRows;
    private reusableMember;
    private proveWorker;
    private validateReport;
    complete(actor: DelegationActor, workdir: string, raw: unknown): Promise<Json>;
    private register;
    result(actor: DelegationActor, workdir: string, raw: unknown, signal?: AbortSignal): Promise<Json>;
}
export {};
