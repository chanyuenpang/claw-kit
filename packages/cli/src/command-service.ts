import { buildKnowledgeDispatch } from "./knowledge-dispatch.js";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ClawError,
  buildMemoryIndex,
  activatePlan,
  appendSubplanReturnGuidance,
  completeSubplanAndRestoreParent,
  bindSessionToPlan,
  createPlanAndSwitchFocus,
  createProjectPlan,
  createPlanRef,
  createSubplan,
  commitSubplanCreation,
  createSubplanAndSwitchFocus,
  editPlan,
  buildPlanWorkflowGuidance,
  leaveCurrentPlan,
  releaseCurrentPlanFocus,
  readFocusedPlan,
  readKnowledgeFinalizationJob, attachKnowledgeDelegateWorkflow, dshKnowledgeDelegateTemplatePath, cindyKnowledgeDelegateTemplatePath, knowledgeDelegateTemplatePath, serializeFailure,
  readKnowledgeCompletionReceipt,
  ensureInsideDir,
  focusSessionKeyHash,
  resolveSessionWorkflowContext,
  resolveProjectContext,
  resolvePlanEffectiveConfig,
  resolveKnowledgeWriterForHost,
  resolveSessionBoundPlan,
  resolveWorkflowProjectContext,
  searchMemoryAsync,
  showPlan,
  switchCurrentPlan,
  tryEndKnowledgePlan,
  tryLeaveKnowledgePlan,
  unbindSession,
  type PlanDocument,
  type PlanEditInput,
  type PlanFieldUpdates,
  type PlanMutationOperation,
  type PlanRef,
  type ProjectContext,
  type PlanWriteInput,
  type SubplanWriteInput,
  type WorkflowGuidance,
  type KnowledgeDelegateDispatch,
  writePlan,
  resolveThreadGoalPlan,
  resolveHostIntegrationProfile,
  isIntegrationHost,
} from "@veewo/claw-core";
import type {
  ClawHostActionV1,
  ClawKnowledgeDispatchV1,
  ClawPostCommitEffectV1,
} from "@veewo/claw-client";
import { buildCodexHostActions } from "./codex-host-actions.js";
import { isHostActionsHost, type ClawHost } from "./invocation-host.js";
import { RegistryFocusSessionStore, SessionRegistryV2 } from "./session-registry-v2.js";
import { claimKnowledgeCommand, knowledgeClaimReceiptCommand, doneKnowledgeCommand, findProjectKnowledgeJob, removeKnowledgeAssignmentTemplate } from "./knowledge-command.js";

export type CommandContext = {
  cwd: string;
  agentSessionId?: string;
  sessionKey?: string;
  currentPlan?: PlanRef;
  host?: string;
  mode: "stateless" | "session";
};

export type ClawCommandRequest = import("@veewo/claw-client").ClawSessionCommand;

export type ClawCommandResult = {
  output: unknown;
  hostActions?: ClawHostActionV1[];
  postCommitEffects?: ClawPostCommitEffectV1[];
  knowledgeDispatch?: ClawKnowledgeDispatchV1;
};

import { recoverCompletionRefreshBestEffort } from "./completion-refresh-recovery.js";

export class ClawCommandService {
  readonly registry: SessionRegistryV2;
  readonly focusStore: RegistryFocusSessionStore;

  constructor(registry: SessionRegistryV2) {
    this.registry = registry;
    this.focusStore = new RegistryFocusSessionStore(registry);
  }

  /** Repair the narrow crash window before a focus journal is prepared. */
  async reconcileCanonicalFocus(context: CommandContext): Promise<void> {
    if (!context.agentSessionId || !context.sessionKey) return;
    const project = this.resolveRecoveryProject(context);
    const retained = readFocusedPlan(project, context.sessionKey, this.focusStore);
    const boundPath = resolveSessionBoundPlan(project, context.agentSessionId);
    if (boundPath) {
      const boundRef = planRefFromAbsolutePath(project, boundPath);
      const bound = showPlan({
        cwd: context.cwd,
        scope: boundRef.scope,
        taskName: boundRef.taskName, taskPath: boundRef.taskPath,
        planFile: boundRef.planFile,
        ownerSessionKey: context.agentSessionId,
      });
      if (bound.plan.status.startsWith("end.")) {
        unbindSession(project, context.agentSessionId);
        if (!retained) return;
        const retainedPlan = showPlan({
          cwd: context.cwd,
          scope: retained.scope,
          taskName: retained.taskName, taskPath: retained.taskPath,
          planFile: retained.planFile,
          ownerSessionKey: context.agentSessionId,
        });
        if (!retainedPlan.plan.status.startsWith("end.")) {
          bindSessionToPlan(project, context.agentSessionId, retainedPlan.planPath);
          return;
        }
        await this.restoreOrReleaseEndedFocus(context, retained, retainedPlan.plan);
        return;
      }
      if (retained && retained.taskName === boundRef.taskName && retained.planFile === boundRef.planFile
        && retained.taskPath === boundRef.taskPath && retained.scope === boundRef.scope) return;
      if (bound.plan.parentPlan && bound.plan.parentTaskId !== undefined) {
        const parentRef: PlanRef = { ...boundRef, planFile: bound.plan.parentPlan };
        const parentAfterLink = structuredClone(showPlan({
          cwd: context.cwd,
          scope: parentRef.scope,
          taskName: parentRef.taskName, taskPath: parentRef.taskPath,
          planFile: parentRef.planFile,
          ownerSessionKey: context.agentSessionId,
        }).plan);
        const parentTask = parentAfterLink.tasks.find((task) => task.id === bound.plan.parentTaskId);
        if (!parentTask) {
          throw new ClawError("PLAN_TRANSITION_CONFLICT", `Parent task ${bound.plan.parentTaskId} is unavailable during focus recovery.`);
        }
        parentTask.execution = {
          ...parentTask.execution,
          type: "subplan",
          subplan: bound.planFile,
          planPath: bound.planFile,
        };
        if (parentTask.status === "pending") parentTask.status = "in_progress";
        parentAfterLink.updatedAt = new Date().toISOString();
        await createSubplanAndSwitchFocus({
          project,
          sessionKey: context.sessionKey,
          parentPlan: parentRef,
          parentAfterLink,
          childPlan: boundRef,
          sessionStore: this.focusStore,
        });
        return;
      }
      await switchCurrentPlan({
        project,
        sessionKey: context.sessionKey,
        target: boundRef,
        kind: "resume",
        preserveTargetStatus: true,
        preserveCurrentEndState: true,
        sessionStore: this.focusStore,
      });
      return;
    }
    if (!retained) return;
    const retainedPlan = showPlan({
      cwd: context.cwd,
      scope: retained.scope,
      taskName: retained.taskName, taskPath: retained.taskPath,
      planFile: retained.planFile,
      ownerSessionKey: context.agentSessionId,
    });
    if (!retainedPlan.plan.status.startsWith("end.")) {
      bindSessionToPlan(project, context.agentSessionId, retainedPlan.planPath);
      return;
    }
    await this.restoreOrReleaseEndedFocus(context, retained, retainedPlan.plan);
  }

  async execute(
    context: CommandContext,
    request: ClawCommandRequest,
  ): Promise<ClawCommandResult> {
    // Receipt reconciliation must not run unrelated canonical recovery effects.
    if (["knowledge.claim.receipt", "knowledge.done.receipt"].includes(request.operation)) return this.executeCommand(context, request);
    if (request.operation === "knowledge.done") {
      const result = await this.executeCommand(context, request);
      recoverCompletionRefreshBestEffort(context.cwd, context.agentSessionId);
      return result;
    }
    recoverCompletionRefreshBestEffort(context.cwd, context.agentSessionId);
    try { return await this.executeCommand(context, request); }
    finally { recoverCompletionRefreshBestEffort(context.cwd, context.agentSessionId); }
  }

  private async executeCommand(context: CommandContext, request: ClawCommandRequest): Promise<ClawCommandResult> {
    const cwd = path.resolve(context.cwd);
    switch (request.operation) {
      case "plan.show": {
        const commandInput = request.input as { simple?: boolean };
        const current = this.requireCurrentPlan(context);
        const shown = showPlan({
          cwd,
          scope: current.scope,
          taskName: current.taskName, taskPath: current.taskPath,
          planFile: current.planFile,
          ownerSessionKey: this.ownerSessionKey(context),
        });
        return { output: commandInput.simple ? shown.simplePlanView : shown };
      }
      case "plan.start": {
        const commandInput = request.input as {
          updates?: PlanFieldUpdates;
          appendTasks?: Array<{ title: string; detail?: string }>;
        };
        const hasUpdates = Boolean(commandInput.updates && Object.keys(commandInput.updates).length > 0);
        // Existing initialized work can start without resubmitting its fields or tasks.
        const current = this.requireCurrentPlan(context);
        const result = await editPlan({
          cwd,
          scope: current.scope,
          taskName: current.taskName, taskPath: current.taskPath,
          planFile: current.planFile,
          updates: hasUpdates ? commandInput.updates : undefined,
          appendTasks: commandInput.appendTasks?.map((task) => ({
            ...task,
            status: "pending",
          })) as PlanEditInput["appendTasks"],
          applyPlanStartGuidance: true,
          commandSource: "plan.start",
          ownerSessionKey: this.ownerSessionKey(context),
          host: context.host,
        });
        const hostActions = this.codexActionsFromMutation(context, "plan.start", result);
        return { output: result, ...(hostActions.length ? { hostActions } : {}) };
      }
      case "plan.leave": {
        const sessionKey = this.requireSessionKey(context);
        const project = this.resolveProject(context, this.currentPlanScope(context));
        const result = await leaveCurrentPlan({
          project,
          sessionKey,
          sessionStore: this.focusStore,
        });
        unbindSession(project, this.ownerSessionKey(context));
        const knowledgeDispatch = this.finalizeEnteredEnds(context, result.enteredEndPlans);
        const ended = result.enteredEndPlans.at(-1);
        const hostActions = ended
          ? await this.codexActionsForPlan(context, {
              command: "plan.leave",
              scope: ended.ref.scope,
              taskName: ended.ref.taskName, taskPath: ended.ref.taskPath,
              planFile: ended.ref.planFile,
              plan: ended.plan,
              actionIdPrefix: result.transitionId,
            })
          : undefined;
        return {
          output: result,
          ...(hostActions?.length ? { hostActions } : {}),
          ...(result.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(result.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "plan.edit": {
        const commandInput = request.input as { operations: PlanMutationOperation[]; expectedPlanPath?: string };
        if (commandInput.operations.length === 0) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "plan.edit requires at least one operation.");
        }
        if (commandInput.expectedPlanPath !== undefined) {
          const expected = commandInput.expectedPlanPath;
          if (typeof expected !== "string" || !expected.trim() || !path.isAbsolute(expected)) {
            throw new ClawError("PROJECT_CONFIG_INVALID", "expectedPlanPath must be an absolute plan path.");
          }
          // SessionCommandExecutor holds its per-session execution lock across
          // this precondition and editCurrentPlan: never resume or redirect here.
          let current: PlanRef;
          try { current = this.requireCurrentPlan(context); }
          catch (error) {
            if (!(error instanceof ClawError) || error.code !== "CURRENT_PLAN_REQUIRED") throw error;
            throw new ClawError("PLAN_FOCUS_CHANGED", "The expected parent plan is no longer focused.");
          }
          const shown = showPlan({ cwd, scope: current.scope, taskName: current.taskName, taskPath: current.taskPath,
            planFile: current.planFile, ownerSessionKey: this.ownerSessionKey(context) });
          const normalizedPath = (value: string): string => process.platform === "win32"
            ? path.resolve(value).toLowerCase() : path.resolve(value);
          if (normalizedPath(shown.planPath) !== normalizedPath(expected)) {
            throw new ClawError("PLAN_FOCUS_CHANGED", "The expected parent plan is no longer focused.", {
              expectedPlanPath: path.resolve(expected), currentPlanPath: shown.planPath,
            });
          }
        }
        return this.editCurrentPlan(context, commandInput.operations, "plan.edit");
      }
      case "plan.wait":
        return this.editCurrentPlan(
          context,
          [{ type: "plan.status", status: "process.wait" }],
          "plan.edit",
        );
      case "plan.done": {
        const commandInput = request.input as PlanFieldUpdates;
        if (this.resolveProject(context).scope !== "session" && !commandInput.retrospectiveSummary?.trim()) {
          throw new ClawError("RETROSPECTIVE_REQUIRED", "plan.done requires retrospectiveSummary.");
        }
        return this.editCurrentPlan(context, [
          { type: "plan.update", updates: commandInput },
          { type: "plan.status", status: "end.completed" },
        ], "plan.done");
      }
      case "plan.resume": {
        const commandInput = request.input as { planId?: string };
        const sessionKey = this.requireSessionKey(context);
        const project = commandInput.planId
          ? this.resolveResumeProject(context, commandInput.planId)
          : this.resolveProject(context);
        const target = commandInput.planId
          ? parsePlanId(project, commandInput.planId)
          : undefined;
        const result = await activatePlan({
          project,
          sessionKey,
          target,
          sessionStore: this.focusStore,
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, result.enteredEndPlans, result.currentPlan);
        const shown = result.currentPlan
          ? showPlan({
              cwd,
              scope: result.currentPlan.scope,
              taskName: result.currentPlan.taskName,
              planFile: result.currentPlan.planFile,
              ownerSessionKey: this.ownerSessionKey(context),
            })
          : undefined;
        const hostActions = shown
          ? await this.codexActionsForPlan(context, {
              command: "plan.resume",
              scope: result.currentPlan?.scope,
              taskName: shown.taskName,
              planFile: shown.planFile,
              plan: shown.plan,
              actionIdPrefix: result.transitionId,
              recoveryResync: true,
              forceProjectionSync: true,
            })
          : undefined;
        return {
          output: result,
          ...(hostActions?.length ? { hostActions } : {}),
          ...(result.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(result.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "plan.create": {
        const commandInput = request.input as Parameters<typeof createProjectPlan>[0];
        const sessionKey = this.requireSessionKey(context);
        // The focus owner below leaves any unfinished plan resumable in the same mutation.
        const created = await createProjectPlan(commandInput, {
          cwd, ownerSessionKey: context.agentSessionId, host: context.host,
        });
        const project = this.resolveProject(context, created.scope);
        const createdRef = createPlanRef(project, created.taskName, created.planFile, created.taskDir);
        const focus = await createPlanAndSwitchFocus({
          project,
          sessionKey,
          createdPlan: createdRef,
          sessionStore: this.focusStore,
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, focus.enteredEndPlans, createdRef);
        const output = { ...created, focusTransition: focus };
        const hostActions = this.codexActionsFromMutation(context, "plan.create", output);
        return {
          output,
          ...(hostActions.length ? { hostActions } : {}),
          ...(focus.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(focus.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "subplan.create": {
        const commandInput = request.input as Omit<SubplanWriteInput, "cwd" | "ownerSessionKey">;
        const sessionKey = this.requireSessionKey(context);
        let focus!: Awaited<ReturnType<typeof commitSubplanCreation>>;
        let childRef!: PlanRef;
        const created = await createSubplan({
          ...commandInput, cwd, scope: this.currentPlanScope(context),
          ownerSessionKey: this.ownerSessionKey(context), host: context.host,
          commitSubplan: async (prepared) => {
            const project = prepared.task.project;
            childRef = createPlanRef(project, prepared.task.taskName, prepared.planFile, prepared.task.taskDir);
            focus = await commitSubplanCreation({ project, sessionKey,
              bindingSessionKey: this.ownerSessionKey(context)!,
              parentPlan: createPlanRef(project, prepared.task.taskName, prepared.plan.parentPlan!, prepared.task.taskDir),
              parentBefore: prepared.parentBefore, childPlan: childRef, childContent: prepared.plan,
              sessionStore: this.focusStore,
            });
          },
        });
        const knowledgeDispatch = this.finalizeEnteredEnds(context, focus.enteredEndPlans, childRef);
        const output = { ...created, focusTransition: focus };
        const hostActions = this.codexActionsFromMutation(context, "subplan.create", output);
        return {
          output,
          ...(hostActions.length ? { hostActions } : {}),
          ...(focus.enteredEndPlans.length
            ? { postCommitEffects: this.endPostCommitEffects(focus.enteredEndPlans) }
            : {}),
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      }
      case "task.edit": {
        const commandInput = request.input as Omit<
          PlanEditInput,
          "cwd" | "taskName" | "planFile" | "ownerSessionKey"
        >;
        const current = this.requireCurrentPlan(context);
        const result = await editPlan({
          ...commandInput,
          cwd,
          scope: current.scope,
          taskName: current.taskName, taskPath: current.taskPath,
          planFile: current.planFile,
          commandSource: "task.edit",
          ownerSessionKey: this.ownerSessionKey(context),
          host: context.host,
        });
        const hostActions = this.codexActionsFromMutation(context, "task.edit", result);
        return { output: result, ...(hostActions.length ? { hostActions } : {}) };
      }
      case "task.add": {
        const commandInput = request.input as { tasks: Array<{ title: string; detail?: string }> };
        if (!commandInput.tasks?.length) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "task.add requires at least one task.");
        }
        return this.editCurrentPlan(
          context,
          commandInput.tasks.map((task) => ({ type: "task.add", ...task })),
          "task.add",
        );
      }
      case "task.remove": {
        const commandInput = request.input as { taskId?: number; tasks?: Array<{ id: number }> };
        const ids = commandInput.tasks?.map((task) => Number(task.id))
          ?? (commandInput.taskId === undefined ? [] : [Number(commandInput.taskId)]);
        if (!ids.length || ids.some((id) => !Number.isInteger(id))) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "task.remove requires at least one integer task id.");
        }
        return this.editCurrentPlan(context, ids.map((id) => ({ type: "task.remove", id })), "task.remove");
      }
      case "task.done": {
        const commandInput = request.input as { tasks: Array<{ id: number; choiceId?: string }> };
        if (!commandInput.tasks?.length) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "task.done requires at least one task id.");
        }
        return this.editCurrentPlan(
          context,
          commandInput.tasks.map((task) => ({
            type: "task.edit",
            id: task.id,
            status: "done",
            ...(task.choiceId ? { choiceId: task.choiceId } : {}),
          })),
          "task.done",
        );
      }
      case "search": {
        const commandInput = request.input as { query: string; limit?: number; dir?: string };
        const searchCwd = commandInput.dir
          ? path.resolve(cwd, commandInput.dir)
          : cwd;
        return {
          output: await searchMemoryAsync({
            cwd: searchCwd,
            query: commandInput.query,
            limit: commandInput.limit,
            scope: "project",
          }),
        };
      }
      case "search.index.refresh":
        // The session daemon owns cwd; callers cannot target another project.
        return { output: buildMemoryIndex({ cwd, scope: "project" }) };
      case "knowledge.claim":
      case "knowledge.claim.receipt": {
        const { finalizeId } = request.input as { finalizeId: string };
        const project = this.resolveProject(context, "project");
        const jobPath = findProjectKnowledgeJob(project.projectRoot, finalizeId, true);
        const claimant = { projectRoot: project.projectRoot, host: context.host ?? "standard", agentSessionId: context.agentSessionId ?? "" };
        if (request.operation === "knowledge.claim.receipt") {
          return { output: knowledgeClaimReceiptCommand(jobPath, claimant) };
        }
        const version = (JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
        const output = claimKnowledgeCommand(jobPath, version, claimant, () => {
          const current = this.focusStore.read(focusSessionKeyHash(this.requireSessionKey(context))).currentPlan;
          if (!current) return undefined;
          const target = this.resolveProject(context, current.scope);
          const shown = showPlan({ cwd: context.cwd, scope: target.scope, taskName: current.taskName,
            taskPath: current.taskPath, planFile: current.planFile, ownerSessionKey: context.agentSessionId });
          return { planPath: shown.planPath, scope: target.scope ?? "project", projectRoot: target.projectRoot,
            ownerSessionId: claimant.agentSessionId };
        });
        if (!output.claimed) return { output };
        // A session finishing its own job keeps its own focus: only a delegated
        // writer gets a runtime-created auxiliary workflow.
        if (claimant.agentSessionId === readKnowledgeFinalizationJob(jobPath).sessionId) return { output };
        try {
          const prepared = await this.prepareClaimWorkflow(context, jobPath, claimant);
          return { ...prepared, output: { ...output, ...(prepared.output as Record<string, unknown>) } };
        } catch (error) {
          const warning = serializeFailure(error, { fallbackCode: "KNOWLEDGE_WORKFLOW_PREPARATION_FAILED", operation: "knowledge.workflow.prepare", origin: "cli" });
          return { output: { ...output, claimCommitted: true, workflowPrepared: false, workflowDeferred: true, workflowFailure: warning } };
        }
      }
      case "knowledge.done.receipt": {
        const input = request.input as { finalizeId: string; claimToken?: string; expectedStatus?: "succeeded" | "failed"; expectedResult?: string };
        const project = this.resolveProject(context, "project");
        const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId, true);
        return { output: { ok: true, command: "knowledge.done.receipt", ...readKnowledgeCompletionReceipt({ jobPath, ...input,
          claimant: { projectRoot: project.projectRoot, host: context.host ?? "standard", agentSessionId: context.agentSessionId ?? "" } }) } };
      }
      case "knowledge.done": {
        const input = request.input as { finalizeId: string; claimToken?: string; status: "succeeded" | "failed"; result?: string; error?: string };
        const project = this.resolveProject(context, "project");
        const jobPath = findProjectKnowledgeJob(project.projectRoot, input.finalizeId, true);
        if (input.status === "succeeded" && input.result === undefined) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge done --status succeeded requires --result.");
        }
        if (input.status === "failed" && !input.error) {
          throw new ClawError("PROJECT_CONFIG_INVALID", "knowledge done --status failed requires --error.");
        }
        if (input.status !== "succeeded" && input.status !== "failed") {
          throw new ClawError("PROJECT_CONFIG_INVALID", "Unsupported knowledge done status " + String(input.status) + ".");
        }
        const output = doneKnowledgeCommand({ jobPath, ...input, retainTemplate: true,
          claimant: { projectRoot: project.projectRoot, host: context.host ?? "standard", agentSessionId: context.agentSessionId ?? "" } });
        let result: ClawCommandResult;
        try {
          await this.reconcileCanonicalFocus(context);
          result = await this.finishKnowledgeDelegate(context, jobPath, output);
        }
        catch (error) { return { output: { ...output, completionEffect: "committed", delegateCloseDeferred: true,
          delegateCloseError: { code: error instanceof ClawError ? error.code : "KNOWLEDGE_DELEGATE_CLOSE_DEFERRED",
            message: error instanceof Error ? error.message : String(error), phase: "post-commit", outcome: "known", effect: "committed" } } }; }
        if ((result.output as { delegateClosed?: boolean }).delegateClosed || !readKnowledgeFinalizationJob(jobPath).delegateWorkflow) {
          const cleanup = removeKnowledgeAssignmentTemplate(jobPath, input.finalizeId);
          if (cleanup.error) result.output = { ...(result.output as Record<string, unknown>), templateCleanupDeferred: cleanup.error };
        } else {
          // The frozen material is still needed by the open auxiliary workflow.
          result.output = { ...(result.output as Record<string, unknown>),
            templateCleanupDeferred: "The auxiliary finalizer workflow is still open; its frozen assignment template is retained until closeout." };
        }
        return result;
      }
      default:
        throw new ClawError(
          "SESSION_OPERATION_UNSUPPORTED",
          "Operation is outside the model command contract.",
        );
    }
  }

  /** Optional post-commit automation shared by every session-command host.
   * Claim ownership selects the exact delegate; a terminal job never licenses
   * completing unrelated or unfinished content work. No failed close is replayed. */
  private async prepareClaimWorkflow(context: CommandContext, jobPath: string, claimant: { projectRoot: string; host: string; agentSessionId: string }): Promise<ClawCommandResult> {
    const job = readKnowledgeFinalizationJob(jobPath);
    const focus = this.focusStore.read(focusSessionKeyHash(this.requireSessionKey(context))).currentPlan;
    const actions: ClawHostActionV1[] = [];
    let shown: ReturnType<typeof showPlan>;
    if (job.delegateWorkflow) {
      const owner = job.delegateWorkflow;
      if (!focus) {
        const target = this.resolveProject(context, owner.scope ?? "project");
        const exact = planRefFromAbsolutePath(target, owner.planPath);
        await activatePlan({ project: target, sessionKey: this.requireSessionKey(context), target: exact, sessionStore: this.focusStore });
      }
      const current = this.requireCurrentPlan(context);
      shown = showPlan({ cwd: context.cwd, scope: current.scope, taskName: current.taskName, taskPath: current.taskPath, planFile: current.planFile, ownerSessionKey: claimant.agentSessionId });
      if (path.resolve(shown.planPath) !== path.resolve(owner.planPath)) throw new ClawError("KNOWLEDGE_WORKFLOW_FOCUS_IN_USE", "Claim is committed; unrelated work keeps its focus.");
    } else {
      if (focus) throw new ClawError("KNOWLEDGE_WORKFLOW_FOCUS_IN_USE", "Claim is committed; prepare its workflow after explicitly leaving unrelated work.");
      const templateFile = claimant.host === "dsh" ? dshKnowledgeDelegateTemplatePath() : claimant.host === "cindy" ? cindyKnowledgeDelegateTemplatePath() : knowledgeDelegateTemplatePath();
      const created = await this.executeCommand(context, { operation: "plan.create", input: { title: "knowledge-finalizer-" + job.finalizeId, templateFile, knowledgeCapture: false } });
      actions.push(...(created.hostActions ?? []));
      const current = this.requireCurrentPlan(context);
      shown = showPlan({ cwd: context.cwd, scope: current.scope, taskName: current.taskName, taskPath: current.taskPath, planFile: current.planFile, ownerSessionKey: claimant.agentSessionId });
      attachKnowledgeDelegateWorkflow(jobPath, claimant, { planPath: shown.planPath, scope: current.scope ?? "project", projectRoot: claimant.projectRoot, ownerSessionId: claimant.agentSessionId });
    }
    if (shown.plan.templateId?.startsWith("internal-") && shown.plan.tasks.find(task => task.id === 1)?.status !== "done") {
      const progress = await this.executeCommand(context, { operation: "task.done", input: { tasks: [{ id: 1 }] } });
      actions.push(...(progress.hostActions ?? []));
      const current = this.requireCurrentPlan(context);
      shown = showPlan({ cwd: context.cwd, scope: current.scope, taskName: current.taskName, taskPath: current.taskPath, planFile: current.planFile, ownerSessionKey: claimant.agentSessionId });
    }
    return { output: { claimCommitted: true, workflowPrepared: true, auxiliaryPlanPath: shown.planPath, workflowGuidance: await buildPlanWorkflowGuidance({ taskName: shown.taskName, plan: shown.plan, planFile: shown.planFile, projectRoot: claimant.projectRoot, projectConfig: this.resolveProject(context, this.requireCurrentPlan(context).scope).projectConfig, host: context.host }) }, ...(actions.length ? { hostActions: actions } : {}) };
  }

  private async finishKnowledgeDelegate(context: CommandContext, jobPath: string, output: Record<string, unknown>): Promise<ClawCommandResult> {
    const actions: ClawHostActionV1[] = [];
    try {
      const job = readKnowledgeFinalizationJob(jobPath);
      const owner = job.delegateWorkflow;
      if (!owner || owner.ownerSessionId !== context.agentSessionId || !["succeeded", "failed", "expired"].includes(job.status)) return { output };
      const project = owner.scope === "project"
        ? resolveProjectContext(owner.projectRoot)
        : resolveSessionWorkflowContext(owner.ownerSessionId, { readOnly: true });
      if (!project || path.resolve(project.projectRoot) !== path.resolve(owner.projectRoot)) return { output };
      const delegatePath = ensureInsideDir(project.tasksDir, path.relative(project.tasksDir, owner.planPath));
      if (!delegatePath || delegatePath !== path.resolve(owner.planPath)) return { output };
      const retained = readFocusedPlan(project, this.requireSessionKey(context), this.focusStore);
      if (retained?.scope && retained.scope !== project.scope) return { output };
      const boundPath = resolveSessionBoundPlan(project, owner.ownerSessionId);
      const delegate = JSON.parse(fs.readFileSync(delegatePath, "utf8")) as PlanDocument;
      if (!boundPath) {
        if (retained) return { output };
        const closed = delegate.status.startsWith("end.");
        return { output: { ...output, delegateClosed: closed, ...(closed ? { planStatus: delegate.status, planPath: delegatePath } : {}) } };
      }
      if (path.dirname(boundPath) !== path.dirname(delegatePath)) return { output };
      const chain: Array<{ planPath: string; plan: PlanDocument }> = [];
      const visited = new Set<string>();
      let cursor: string | null = boundPath;
      while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const plan = JSON.parse(fs.readFileSync(cursor, "utf8")) as PlanDocument;
        chain.push({ planPath: cursor, plan });
        if (cursor === delegatePath) break;
        cursor = plan.parentPlan ? ensureInsideDir(path.dirname(delegatePath), plan.parentPlan) : null;
      }
      if (chain.at(-1)?.planPath !== delegatePath || delegate.knowledgeCapture !== false) return { output };
      if (output.alreadyDone === true) return { output: { ...output, delegateCloseDeferred: true } };
      const invoke = async (request: ClawCommandRequest) => {
        const result = await this.executeCommand(context, request);
        actions.push(...(result.hostActions ?? []));
        return result;
      };
      if (job.status !== "succeeded") {
        // Leave the current failed work, never mark its content tasks done. Its
        // parent delegate already carries the ordinary temporary-leave state.
        await invoke({ operation: "plan.leave", input: {} });
        const left = JSON.parse(fs.readFileSync(delegatePath, "utf8")) as PlanDocument;
        const closed = left.status.startsWith("end.");
        return { output: { ...output, delegateClosed: closed, ...(!closed ? { delegateCloseDeferred: true } : {}),
          planStatus: "end.leave", planPath: boundPath }, hostActions: actions };
      }
      const pending = delegate.tasks.filter((task) => task.status !== "done");
      const incompleteChildren = chain.slice(0, -1).some(({ plan }) => !plan.tasks.length || plan.tasks.some((task) => task.status !== "done"));
      // A parent work task will be completed by its already-completed child.
      const directChild = chain.length > 1 ? chain[chain.length - 2] : undefined;
      const childParentIds = new Set(directChild ? [directChild.plan.parentTaskId] : []);
      if (incompleteChildren || pending.some((task) => task.execution?.lifecycle !== "knowledge.result" && !childParentIds.has(task.id))) {
        return { output: { ...output, delegateCloseDeferred: true } };
      }
      for (const child of chain.slice(0, -1)) {
        const current = this.requireCurrentPlan(context);
        const shown = showPlan({ cwd: context.cwd, scope: current.scope, taskName: current.taskName,
          taskPath: current.taskPath, planFile: current.planFile, ownerSessionKey: context.agentSessionId });
        if (path.resolve(shown.planPath) !== child.planPath) return { output: { ...output, delegateCloseDeferred: true }, hostActions: actions };
        await invoke({ operation: "plan.done", input: { retrospectiveSummary: "Completed content work; runtime restored the owning finalizer." } });
      }
      const operations: PlanMutationOperation[] = pending.filter((task) => task.execution?.lifecycle === "knowledge.result")
        .map((task) => ({ type: "task.edit", id: task.id, status: "done" }));
      operations.push({ type: "plan.update", updates: { retrospectiveSummary: "Finalization result was persisted by the canonical knowledge owner." } },
        { type: "plan.status", status: "end.completed" });
      const request = { operation: "plan.edit" as const, input: { operations, expectedPlanPath: delegatePath } };
      const completion = await invoke(request);
      const closed = JSON.parse(fs.readFileSync(delegatePath, "utf8")) as PlanDocument;
      if (closed.status !== "end.completed") {
        return { output: { ...output, delegateCloseDeferred: true,
          delegateCloseError: { code: "KNOWLEDGE_DELEGATE_CLOSE_INCOMPLETE", message: "The canonical delegate completion did not commit." } }, hostActions: actions };
      }
      const workflow = completion.output as { planStatus?: string; planPath?: string };
      return { output: { ...output, delegateClosed: true,
        planStatus: workflow.planStatus ?? closed.status, planPath: workflow.planPath ?? delegatePath }, hostActions: actions };
    } catch (error) {
      return { output: { ...output, delegateCloseDeferred: true,
        delegateCloseError: { code: error instanceof ClawError ? error.code : "KNOWLEDGE_DELEGATE_CLOSE_DEFERRED",
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof ClawError ? error.execution ?? {} : {}) } }, hostActions: actions };
    }
  }

  private requireSessionKey(context: CommandContext): string {
    if (context.mode !== "session" || !context.sessionKey?.trim()) {
      throw new ClawError("CURRENT_PLAN_REQUIRED", "This operation requires an open session.");
    }
    return context.sessionKey;
  }

  private resolveProject(context: CommandContext, requestedScope?: "project" | "session") {
    return resolveWorkflowProjectContext(
      context.cwd,
      context.mode === "session" ? context.agentSessionId : undefined,
      requestedScope ?? this.currentPlanScope(context),
    );
  }

  private ownerSessionKey(context: CommandContext): string | undefined {
    return context.mode === "session" ? context.agentSessionId : undefined;
  }

  /** Publish the canonical binding only after the parent focus commit. */
  private publishParentBinding(context: CommandContext, project: ProjectContext, parentRef: PlanRef) {
    const parent = showPlan({
      cwd: context.cwd,
      scope: parentRef.scope,
      taskName: parentRef.taskName, taskPath: parentRef.taskPath,
      planFile: parentRef.planFile,
      ownerSessionKey: this.ownerSessionKey(context),
    });
    bindSessionToPlan(project, this.ownerSessionKey(context), parent.planPath);
    return parent;
  }

  private async restoreOrReleaseEndedFocus(
    context: CommandContext,
    current: PlanRef,
    completed: PlanDocument,
  ): Promise<void> {
    const project = this.resolveProject(context, current.scope);
    if (completed.parentPlan && completed.parentTaskId !== undefined) {
      const parentRef: PlanRef = { ...current, planFile: completed.parentPlan };
      await completeSubplanAndRestoreParent({
        project,
        sessionKey: this.requireSessionKey(context),
        childPlan: current,
        completedChild: completed,
        parentPlan: parentRef,
        parentTaskId: completed.parentTaskId,
        bindingSessionKey: this.ownerSessionKey(context),
        sessionStore: this.focusStore,
      });
      this.publishParentBinding(context, project, parentRef);
      return;
    }
    await releaseCurrentPlanFocus({
      project,
      sessionKey: this.requireSessionKey(context),
      expectedEnd: true,
      sessionStore: this.focusStore,
    });
  }

  private async editCurrentPlan(
    context: CommandContext,
    operations: PlanMutationOperation[],
    commandSource: "plan.edit" | "plan.done" | "task.add" | "task.remove" | "task.done",
  ): Promise<ClawCommandResult> {
    const current = this.requireCurrentPlan(context);
    const sessionKey = this.requireSessionKey(context);
    const project = this.resolveProject(context, current.scope);
    const result = await editPlan({
      cwd: context.cwd,
      scope: current.scope,
      taskName: current.taskName, taskPath: current.taskPath,
      planFile: current.planFile,
      operations,
      commandSource,
      ownerSessionKey: this.ownerSessionKey(context),
      host: context.host,
      deferSubplanClosure: true,
    });
    if (!result.previousPlanStatus.startsWith("end.") && result.planStatus.startsWith("end.")) {
      if (
        result.completionHooks?.subplanClosureCandidate
        && result.plan.parentPlan
        && result.plan.parentTaskId !== undefined
      ) {
        const parentRef: PlanRef = { ...current, planFile: result.plan.parentPlan };
        const focus = await completeSubplanAndRestoreParent({
          project,
          sessionKey,
          childPlan: current,
          completedChild: result.plan,
          parentPlan: parentRef,
          parentTaskId: result.plan.parentTaskId,
          bindingSessionKey: this.ownerSessionKey(context),
          sessionStore: this.focusStore,
        });
        const parent = this.publishParentBinding(context, project, parentRef);
        const parentGuidance = appendSubplanReturnGuidance({
          guidance: await buildPlanWorkflowGuidance({
            taskName: parent.taskName,
            planFile: parent.planFile,
            plan: parent.plan,
            commandSource,
            projectRoot: project.projectRoot,
            projectConfig: resolvePlanEffectiveConfig(project.projectConfig, parent.plan),
            previousStatus: "end.leave",
            completedTaskIds: [result.plan.parentTaskId],
            host: context.host,
          }),
          completedPlanFile: result.planFile,
          completedPlanTitle: result.plan.title,
          parentTaskId: result.plan.parentTaskId,
          host: context.host,
        });
        const resumedResult = {
          taskName: parent.taskName,
          planPath: parent.planPath,
          planFile: parent.planFile,
          planStatus: parent.plan.status,
          previousPlanStatus: "end.leave" as const,
          emittedEvents: result.emittedEvents,
          changedTaskIds: [result.plan.parentTaskId],
          appendedTaskIds: [],
          completedTaskIds: [result.plan.parentTaskId],
          workflowGuidance: parentGuidance,
          plan: parent.plan,
          planView: parent.planView,
          events: result.events,
          focusTransition: focus,
          completedSubplan: {
            taskName: result.taskName,
            planPath: result.planPath,
            planFile: result.planFile,
            planStatus: result.planStatus,
          },
        };
        const knowledgeDispatch = this.finalizeEnteredEnds(context, [{
          ref: current,
          plan: result.plan,
          endedAt: result.plan.completedAt ?? new Date().toISOString(),
        }], parentRef);
        const hostActions = this.codexActionsFromMutation(context, commandSource, resumedResult);
        return {
          output: resumedResult,
          ...(hostActions.length ? { hostActions } : {}),
          postCommitEffects: [{
            type: "completion.refresh",
            taskName: result.taskName,
            planStatus: result.planStatus,
          }],
          ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
        };
      } else {
        await releaseCurrentPlanFocus({
          project,
          sessionKey,
          expectedEnd: true,
          sessionStore: this.focusStore,
        });
      }
      const knowledgeDispatch = this.finalizeEnteredEnds(context, [{
        ref: current,
        plan: result.plan,
        endedAt: result.plan.completedAt ?? new Date().toISOString(),
      }]);
      const hostActions = this.codexActionsFromMutation(context, commandSource, result);
      return {
        output: result,
        ...(hostActions.length ? { hostActions } : {}),
        postCommitEffects: [{
          type: "completion.refresh",
          taskName: result.taskName,
          planStatus: result.planStatus,
        }],
        ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
      };
    }
    const hostActions = this.codexActionsFromMutation(context, commandSource, result);
    return { output: result, ...(hostActions.length ? { hostActions } : {}) };
  }

  private requireCurrentPlan(context: CommandContext): PlanRef {
    if (context.mode === "session") {
      const sessionKey = this.requireSessionKey(context);
      const project = this.resolveProject(context);
      const current = readFocusedPlan(project, sessionKey, this.focusStore);
      if (current) return current;
    } else if (context.currentPlan) {
      return context.currentPlan;
    }
    throw new ClawError(
      "CURRENT_PLAN_REQUIRED",
      "The command requires a current plan. Resume or create a plan first.",
      undefined, { phase: "prepare", outcome: "known", effect: "none" },
    );
  }

  /**
   * Storage scope of the session's focused plan, when one exists. Plan
   * operations must resolve their project context with this scope: a
   * project-scoped plan stays in the project tasks directory even when the
   * session also owns a session workflow manifest (which the ambient
   * undefined-scope resolution would prefer, making the plan unreachable).
   */
  private currentPlanScope(context: CommandContext): "project" | "session" | undefined {
    if (context.mode === "session") {
      const sessionKey = context.sessionKey?.trim();
      return sessionKey ? this.focusStore.read(focusSessionKeyHash(sessionKey)).currentPlan?.scope : undefined;
    }
    return context.currentPlan?.scope;
  }

  private availableProjects(context: CommandContext) {
    const projects: Array<ReturnType<typeof resolveWorkflowProjectContext>> = [];
    try { projects.push(this.resolveProject(context, "project")); }
    catch (error) {
      if (!(error instanceof ClawError) || !["PROJECT_ROOT_NOT_FOUND", "CLAW_DIR_NOT_FOUND"].includes(error.code)) throw error;
    }
    const session = resolveSessionWorkflowContext(this.ownerSessionKey(context));
    if (session) projects.push(session);
    return projects;
  }

  private resolveResumeProject(context: CommandContext, planId: string) {
    // A current focus supplies scope authority. Without it, never let a retained
    // session manifest silently choose between identically named plans.
    if (this.currentPlanScope(context)) return this.resolveProject(context);
    const matches = this.availableProjects(context).filter((project) => {
      const ref = parsePlanId(project, planId);
      try {
        showPlan({ cwd: context.cwd, scope: project.scope, taskName: ref.taskName, taskPath: ref.taskPath,
          planFile: ref.planFile, ownerSessionKey: this.ownerSessionKey(context) });
        return true;
      } catch (error) {
        if (error instanceof ClawError && ["TASK_NOT_FOUND", "PLAN_NOT_FOUND"].includes(error.code)) return false;
        throw error;
      }
    });
    if (matches.length > 1) throw new ClawError("PLAN_TRANSITION_CONFLICT",
      "The plan id is ambiguous across project and session scopes.", { planId, scopes: matches.map((project) => project.scope) });
    return matches[0] ?? this.resolveProject(context);
  }

  private resolveRecoveryProject(context: CommandContext) {
    if (this.currentPlanScope(context)) return this.resolveProject(context);
    const bound = this.availableProjects(context).filter((project) => {
      const planPath = resolveSessionBoundPlan(project, context.agentSessionId);
      if (!planPath) return false;
      const ref = planRefFromAbsolutePath(project, planPath);
      const shown = showPlan({ cwd: context.cwd, scope: project.scope, taskName: ref.taskName, taskPath: ref.taskPath,
        planFile: ref.planFile, ownerSessionKey: context.agentSessionId });
      return !shown.plan.status.startsWith("end.");
    });
    if (bound.length > 1) throw new ClawError("PLAN_TRANSITION_CONFLICT",
      "Session recovery is ambiguous: active bindings exist in both storage scopes.");
    return bound[0] ?? this.resolveProject(context);
  }

  private finalizeEnteredEnds(
    context: CommandContext,
    entered: Array<{ ref: PlanRef; plan: import("@veewo/claw-core").PlanDocument; endedAt: string }>,
    resumed?: PlanRef,
  ): KnowledgeDelegateDispatch | undefined {
    if (!context.agentSessionId || entered.length === 0) return undefined;
    const project = this.resolveProject(context, entered[0]?.ref.scope);
    if (project.scope !== "project") return undefined;
    const resumedPath = resumed
      ? showPlan({
          cwd: context.cwd,
          scope: resumed.scope,
          taskName: resumed.taskName, taskPath: resumed.taskPath,
          planFile: resumed.planFile,
          ownerSessionKey: this.ownerSessionKey(context),
        }).planPath
      : undefined;
    let dispatch: KnowledgeDelegateDispatch | undefined;
    for (const ended of entered) {
      const shown = showPlan({
        cwd: context.cwd,
        scope: ended.ref.scope,
        taskName: ended.ref.taskName, taskPath: ended.ref.taskPath,
        planFile: ended.ref.planFile,
        ownerSessionKey: this.ownerSessionKey(context),
      });
      if (ended.plan.status === "end.leave") {
        // Internal parent/child focus transfer is not cancellation of this
        // workflow's capture interval or of its existing finalization jobs.
        if (ended.plan.leaveReason === "switch_to_new_plan"
          && resumed?.taskName === ended.ref.taskName && resumed.taskPath === ended.ref.taskPath
          && resumed.scope === ended.ref.scope) continue;
        tryLeaveKnowledgePlan({ project, sessionId: context.agentSessionId, leftPlanPath: shown.planPath, knowledgeCapture: ended.plan.knowledgeCapture });
        continue;
      }
      const effectiveConfig = resolvePlanEffectiveConfig(project.projectConfig, ended.plan);
      const writer = resolveKnowledgeWriterForHost(effectiveConfig?.knowledgeWriter, context.host, project.projectConfig?.knowledgeWriterByHost);
      const knowledgeEnd = tryEndKnowledgePlan({
        project,
        sessionId: context.agentSessionId,
        endedPlanPath: shown.planPath,
        ...(resumedPath ? { resumedPlanPath: resumedPath } : {}),
        endedAt: ended.endedAt,
        knowledgeCapture: ended.plan.knowledgeCapture,
        ...(writer ? { writer } : {}),
        ...(isIntegrationHost(context.host)
          ? { host: context.host }
          : {}),
      });
      if (knowledgeEnd.finalizeId && knowledgeEnd.jobPath && resolveHostIntegrationProfile(context.host)?.supportsNativeSubagentFinalization) {
        dispatch = buildKnowledgeDispatch({
          host: context.host as "codex" | "cindy" | "dsh",
          finalizeId: knowledgeEnd.finalizeId, projectRoot: project.projectRoot, writer,
        });
      }
    }
    return dispatch;
  }

  private endPostCommitEffects(
    entered: Array<{ ref: PlanRef; plan: import("@veewo/claw-core").PlanDocument; endedAt: string }>,
  ): ClawPostCommitEffectV1[] | undefined {
    const actions = entered.map((ended) => ({
      type: "completion.refresh" as const,
      taskName: ended.ref.taskName,
      planFile: ended.ref.planFile,
      planStatus: ended.plan.status,
      endedAt: ended.endedAt,
    }));
    return actions.length ? actions : undefined;
  }

  private codexActionsFromMutation(
    context: CommandContext,
    command: string,
    result: {
      planPath: string;
      planStatus: string;
      previousPlan?: PlanDocument;
      plan: PlanDocument;
      workflowGuidance: WorkflowGuidance;
      events?: Array<{ mutationId?: string }>;
      focusTransition?: { transitionId?: string };
    },
  ): ClawHostActionV1[] {
    if (!isHostActionsHost(context.host as ClawHost | undefined)) return [];
    const actionIdPrefix = result.events?.at(-1)?.mutationId
      ?? result.focusTransition?.transitionId
      ?? createHash("sha256")
        .update(`${command}:${result.planPath}:${result.plan.updatedAt}`)
        .digest("hex")
        .slice(0, 24);
    return buildCodexHostActions({
      planStatus: result.planStatus,
      previousPlan: result.previousPlan,
      plan: result.plan,
      workflowGuidance: result.workflowGuidance,
    }, {
      actionIdPrefix,
      includeLightweightProcessProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
      includePlanProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
    });
  }

  private async codexActionsForPlan(
    context: CommandContext,
    input: {
      command: string;
      scope?: "project" | "session";
      taskName: string;
      taskPath?: string;
      planFile: string;
      plan: PlanDocument;
      actionIdPrefix?: string;
      recoveryResync?: boolean;
      forceProjectionSync?: boolean;
    },
  ): Promise<ClawHostActionV1[]> {
    if (!isHostActionsHost(context.host as ClawHost | undefined)) return [];
    const project = this.resolveProject(context, input.scope);
    const goalPlan = resolveThreadGoalPlan({
      cwd: context.cwd,
      taskName: input.taskName,
      taskPath: input.taskPath,
      focusedPlan: input.plan,
      scope: project.scope,
      ownerSessionKey: this.ownerSessionKey(context),
    });
    const workflowGuidance = await buildPlanWorkflowGuidance({
      taskName: input.taskName,
      planFile: input.planFile,
      plan: input.plan,
      projectRoot: project.projectRoot,
      projectConfig: resolvePlanEffectiveConfig(project.projectConfig, input.plan),
      goalPlan,
      goalProjectConfig: resolvePlanEffectiveConfig(project.projectConfig, goalPlan),
      scope: project.scope,
      host: context.host,
      recoveryResync: input.recoveryResync,
    });
    const actionIdPrefix = input.actionIdPrefix
      ?? createHash("sha256")
        .update(`${input.command}:${input.taskName}:${input.planFile}:${input.plan.updatedAt}`)
        .digest("hex")
        .slice(0, 24);
    return buildCodexHostActions({
      planStatus: input.plan.status,
      plan: input.plan,
      workflowGuidance,
    }, {
      actionIdPrefix,
      forceProjectionSync: input.forceProjectionSync,
      includeLightweightProcessProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
      includePlanProgress: resolveHostIntegrationProfile(context.host)?.consumesPlanProgress === true,
    });
  }
}

function parsePlanId(
  project: ReturnType<typeof resolveWorkflowProjectContext>,
  planId: string,
): PlanRef {
  const normalized = planId.trim().replace(/\\/g, "/");
  if (!normalized) {
    throw new ClawError("PLAN_NOT_FOUND", "planId must be non-empty.");
  }
  const separator = normalized.lastIndexOf("/");
  return separator < 0
    ? createPlanRef(project, normalized)
    : createPlanRef(project, normalized.slice(0, separator), normalized.slice(separator + 1));
}

function planRefFromAbsolutePath(
  project: ReturnType<typeof resolveWorkflowProjectContext>,
  planPath: string,
): PlanRef {
  const relative = path.relative(project.tasksDir, path.resolve(planPath));
  const segments = relative.split(path.sep).filter(Boolean);
  if (relative.startsWith("..") || path.isAbsolute(relative) || segments.length < 2) {
    throw new ClawError("PLAN_NOT_FOUND", `Bound plan is outside the active task layout: ${planPath}`);
  }
  return createPlanRef(project, segments.at(-2)!, segments.at(-1)!, path.dirname(path.resolve(planPath)));
}
