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
/** Render the session-start guidance snapshot injected at session start.
 * Aligns with the Codex adapter's session-start hook: consumes the full
 * `claw context --host dsh` payload — activeWorkflow snapshot, version-sync
 * notice, protocol check, search guidance, and a project fallback — so the
 * model gets the same recovery and startup context on DSH that Codex
 * receives. Empty text contributes nothing to the assembly. */
export declare function renderGuidanceSnapshot(context: Record<string, unknown> | undefined): string;
