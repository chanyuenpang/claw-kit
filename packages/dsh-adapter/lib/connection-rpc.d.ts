export type ConnectionRpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>;
export type ConnectionRpcChannel = {
    channel: string;
    handler: ConnectionRpcHandler;
};
/** Mount browser RPC channels without making `connection` a hard inject.
 *
 * Headless DSH has no connection service, so a static inject waits forever.
 * On DSH 0.2, `connection.rpc.handle` reads `webServer` from the connection
 * fiber, which did not inject it (`cannot get property "webServer" without inject`).
 * A child fiber started with `ctx.inject(["connection"])` runs only when that
 * service exists, and `child.root.get("connection").rpc.handle` resolves
 * webServer from the runtime-less root fiber, which is allowed to see it.
 */
export declare function mountConnectionRpcChannels(ctx: unknown, channels: ConnectionRpcChannel[]): void;
