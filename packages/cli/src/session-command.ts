import { ClawError, recoverProjectFocusTransitions, resolveProjectContext } from "@veewo/claw-core";
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

  async withSession<T>(identity: SessionCommandIdentity, action: (context: CommandContext, hash: string) => Promise<T>): Promise<T> {
    const canonical = createSessionIdentity(identity.agentSessionId, identity.workdir);
    return this.registry.withExecution(canonical.sessionKeyHash, async () => {
      await this.registry.open(canonical.agentSessionId, canonical.canonicalWorkdir, identity.client);
      const context: CommandContext = { cwd: canonical.canonicalWorkdir, agentSessionId: canonical.agentSessionId,
        sessionKey: sessionFocusKey(canonical), host: identity.client.host, mode: "session" };
      try {
        const project = resolveProjectContext(context.cwd);
        await recoverProjectFocusTransitions({ project, sessionStore: this.service.focusStore });
      } catch (error) {
        // Opening outside a project is supported. Integrity failures are not.
        if (!(error instanceof ClawError) || error.code !== "PROJECT_ROOT_NOT_FOUND") throw error;
      }
      await this.service.reconcileCanonicalFocus(context);
      return action(context, canonical.sessionKeyHash);
    });
  }

  async open(identity: SessionCommandIdentity) {
    return this.withSession(identity, async (context, hash) => {
      const session = this.registry.read(hash);
      const currentPlan = session.currentPlan
        ? (await this.service.execute(context, { operation: "plan.show", input: { simple: true } })).output
        : undefined;
      return { session, ...(currentPlan ? { currentPlan } : {}) };
    });
  }

  async execute(identity: SessionCommandIdentity, value: unknown) {
    const request = decodeClawCommand(value, { allowTerminalSearchDir: identity.client.kind === "terminal" }); // unsupported is strictly pre-execution
    return this.withSession(identity, async (context, hash) => {
      const result = await this.service.execute(context, request);
      await this.registry.touch(hash);
      return { schemaVersion: 1 as const, ...result };
    });
  }
}
