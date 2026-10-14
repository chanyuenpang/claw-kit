/** Mount browser RPC channels without making `connection` a hard inject.
 *
 * Headless DSH has no connection service, so a static inject waits forever.
 * On DSH 0.2, `connection.rpc.handle` reads `webServer` from the connection
 * fiber, which did not inject it (`cannot get property "webServer" without inject`).
 * A child fiber started with `ctx.inject(["connection"])` runs only when that
 * service exists, and `child.root.get("connection").rpc.handle` resolves
 * webServer from the runtime-less root fiber, which is allowed to see it.
 */
export function mountConnectionRpcChannels(ctx, channels) {
    const host = ctx;
    if (typeof host.inject !== "function" || channels.length === 0)
        return;
    host.inject(["connection"], (child) => {
        try {
            const connection = child.root?.get?.("connection");
            const rpc = connection?.rpc;
            if (typeof rpc?.handle !== "function")
                return;
            const disposers = [];
            for (const channel of channels) {
                const remove = rpc.handle(channel.channel, channel.handler);
                if (typeof remove === "function")
                    disposers.push(remove);
            }
            if (disposers.length > 0 && typeof child.effect === "function") {
                child.effect(() => () => {
                    for (const dispose of disposers) {
                        try {
                            dispose();
                        }
                        catch { /* channel already removed */ }
                    }
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[claw-kit] settings RPC channel was not mounted: ${message}`);
        }
    });
}
//# sourceMappingURL=connection-rpc.js.map