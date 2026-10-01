export type WorkspaceRecord = {
    id?: string;
    title?: string;
    path?: string;
};
export type WorkspaceRegistry = {
    list(): readonly WorkspaceRecord[] | Promise<readonly WorkspaceRecord[]>;
    get?(id: string): WorkspaceRecord | undefined;
};
export type RunConfig = (argv: string[], cwd: string) => Promise<{
    text: string;
    errText: string;
}>;
type RpcResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: object;
    };
};
/**
 * Browser-facing config bridge. The browser identifies a registry record only;
 * path resolution, claw-project validation, and CLI execution stay on the Host.
 */
export declare function handleProjectConfigRpc(endpoint: string, payload: unknown, registry: WorkspaceRegistry, runConfig: RunConfig): Promise<RpcResult>;
export {};
