import { ClawError, withExecutionFailure, serializeFailure, recoverProjectFocusTransitions, resolveProjectContext, resolveSessionWorkflowContext } from "@veewo/claw-core";
import { ClawCommandService, type CommandContext } from "./command-service.js";
import { decodeClawCommand } from "./command-contract.js";
import { SessionRegistryV2, createSessionIdentity, sessionFocusKey, type SessionClientInfo } from "./session-registry-v2.js";

export type SessionCommandIdentity = { agentSessionId: string; workdir: string; client: SessionClientInfo };

/** Application entry shared by daemon and one-shot CLI. The outer execution
 * queue covers preparation, canonical mutation, focus and envelope creation.
 * It is deliberately distinct from the inner registry/focus transaction queue.
 */
export class SessionCommandExecutor {
  readonly service: ClawCommandService;
  constructor(readonly registry: SessionRegistryV2) {
    this.service = new ClawCommandService(registry);
  }

  async withSession<T>(identity: SessionCommandIdentity, action: (context: CommandContext, hash: string) => Promise<T>, skipBusinessRecovery = false): Promise<T> {
    const canonical = createSessionIdentity(identity.agentSessionId, identity.workdir);
    return this.registry.withExecution(canonical.sessionKeyHash, async () => {
      await this.registry.open(canonical.agentSessionId, canonical.canonicalWorkdir, identity.client);
      const context: CommandContext = { cwd: canonical.canonicalWorkdir, agentSessionId: canonical.agentSessionId,
        sessionKey: sessionFocusKey(canonical), host: identity.client.host, mode: "session" };
      // Completion/receipt authority comes from the canonical claim, not focus.
      // Do not run business/focus recovery before that owner authenticates.
      if (skipBusinessRecovery) return action(context, canonical.sessionKeyHash);
      let projectAvailable = true;
      try {
        const project = resolveProjectContext(context.cwd);
        await recoverProjectFocusTransitions({ project, sessionStore: this.service.focusStore });
      } catch (error) {
        // Opening outside a project is supported. Integrity failures are not.
        if (!(error instanceof ClawError) || error.code !== "CLAW_DIR_NOT_FOUND") throw error;
        projectAvailable = false;
      }
      const legacySession = resolveSessionWorkflowContext(context.agentSessionId, { readOnly: true, cwd: context.cwd });
      if (legacySession) await recoverProjectFocusTransitions({ project: legacySession, sessionStore: this.service.focusStore });
      if (projectAvailable || legacySession) await this.service.reconcileCanonicalFocus(context);
      return action(context, canonical.sessionKeyHash);
    });
  }

  async open(identity: SessionCommandIdentity, receiptOnly = false) {
    return this.withSession(identity, async (context, hash) => {
      const session = this.registry.read(hash);
      const currentPlan = !receiptOnly && session.currentPlan
        ? (await this.service.execute(context, { operation: "plan.show", input: { simple: true } })).output
        : undefined;
      return { session, ...(currentPlan ? { currentPlan } : {}) };
    }, receiptOnly);
  }

  async execute(identity: SessionCommandIdentity, value: unknown) {
    let request;
    try { request = decodeClawCommand(value, { allowTerminalSearchDir: identity.client.kind === "terminal" }); }
    catch (error) { throw withExecutionFailure(error, { operation: "command.decode", phase: "prepare", outcome: "known", effect: "none" }); }
    // Search does not mutate focus. Holding the session execution queue across
    // index refresh blocks the next command for the whole embedding run.
    if (request.operation === "search" || request.operation === "search.index.refresh" || request.operation === "knowledge.materials") {
      const canonical = createSessionIdentity(identity.agentSessionId, identity.workdir);
      const context: CommandContext = {
        cwd: canonical.canonicalWorkdir,
        agentSessionId: canonical.agentSessionId,
        sessionKey: sessionFocusKey(canonical),
        host: identity.client.host,
        mode: "session",
      };
      const result = await this.service.execute(context, request);
      return { schemaVersion: 1 as const, ...result };
    }
    return this.withSession(identity, async (context, hash) => {
      const result = await this.service.execute(context, request);
      try { await this.registry.touch(hash); }
      catch (error) {
        const warning = serializeFailure(error, { fallbackCode: "SESSION_ACTIVITY_UPDATE_FAILED", operation: "session.activity.touch", origin: "cli", fallbackOutcome: "unknown" });
        if (result.output && typeof result.output === "object") result.output = { ...result.output, postCommandFailures: [warning] };
      }
      return { schemaVersion: 1 as const, ...result };
    }, request.operation === "knowledge.done" || request.operation === "knowledge.done.receipt" || request.operation === "knowledge.claim.receipt");
  }
}
