/**
 * Pure protocol helpers for the DSH adapter: operation→daemon-input mapping
 * and the session-start guidance snapshot renderer. Kept free of Cordis and
 * process dependencies so they are directly unit-testable.
 */
/** Map one `claw_run` operation call (snake_case args) to the daemon's
 * canonical `claw/execute` input. Mirrors the Cindy adapter's sessionRequest
 * contract. Unknown operations pass args through and fail closed on the
 * daemon's validation. */
export declare function daemonInput(operation: string, args: Record<string, unknown>): unknown;
/** Render the compact `claw context --host dsh` snapshot injected at session
 * start. Empty text contributes nothing to the assembly. */
export declare function renderGuidanceSnapshot(context: Record<string, unknown> | undefined): string;
