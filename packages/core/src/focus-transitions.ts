import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listTaskDirectories } from "./context.js";
import { ClawError, withExecutionFailure, type ClawExecutionFailure } from "./errors.js";
import { applySessionBindingTransition, readSessionBoundPlanPath } from "./session-bindings.js";
import {
  readJsonFile,
  serializeJsonFile,
  withSerializedAccess,
  withSerializedQueue,
  writeJsonFileAtomic,
} from "./io.js";
import { ensureInsideDir, normalizePlanFile } from "./paths.js";
import type { PlanDocument, PlanLeaveReason, ProjectContext } from "./types.js";

const MISSING_RESOURCE_HASH = createHash("sha256").update("<missing>").digest("hex");

export type PlanRef = {
  projectRoot: string;
  taskName: string;
  planFile: string;
  /** Exact task directory relative to tasksDir, including its date when present. */
  taskPath?: string;
  /**
   * Storage scope the plan was created under. Old records may omit it; those
   * keep the legacy ambient resolution (session workflow preferred).
   */
  scope?: "project" | "session";
};

export type PlanFocusOwner = {
  sessionKeyHash: string;
  planRef: PlanRef;
  acquiredAt: string;
  updatedAt: string;
};

export type PlanFocusRegistry = {
  schemaVersion: 1;
  owners: Record<string, PlanFocusOwner>;
};

export type FocusSessionRecord = {
  schemaVersion: 1;
  sessionKeyHash: string;
  currentPlan?: PlanRef;
  updatedAt: string;
};

export interface FocusSessionStore {
  read(sessionKeyHash: string): FocusSessionRecord;
  buildPersistedRecord(sessionKeyHash: string, record: FocusSessionRecord): unknown;
  writePersistedAtomic(sessionKeyHash: string, persistedRecord: unknown): void;
  queuePath(sessionKeyHash: string): string;
  resourcePath(sessionKeyHash: string): string;
}

export type FocusTransitionKind =
  | "create"
  | "resume"
  | "leave"
  | "end"
  | "expire"
  | "subplan_create"
  | "subplan_complete";

export type FocusTransitionJournal = {
  schemaVersion: 1;
  transitionId: string;
  kind: FocusTransitionKind;
  sessionKeyHash: string;
  /** Optional per-entry binding write; legacy journals do not contain it. */
  binding?: { sessionKey: string; before: string | null; after: string | null };
  phase: "prepared" | "applying" | "committed";
  createdAt: string;
  updatedAt: string;
  before: {
    sessionRecordHash: string;
    ownerRegistryHash: string;
    sessionCurrentPlan?: PlanRef;
    plans: Array<{ ref: PlanRef; contentHash: string }>;
  };
  after: {
    sessionRecord: unknown;
    ownerRegistry: PlanFocusRegistry;
    sessionCurrentPlan?: PlanRef;
    plans: Array<{ ref: PlanRef; content: PlanDocument }>;
  };
};

export type FocusTransitionResult = {
  changed: boolean;
  transitionId?: string;
  previousCurrentPlan?: PlanRef;
  currentPlan?: PlanRef;
  enteredEndPlans: Array<{
    ref: PlanRef;
    plan: PlanDocument;
    endedAt: string;
  }>;
};

export type FocusFailurePoint =
  | "after_prepared"
  | "after_applying"
  | "after_plan"
  | "after_owners"
  | "after_binding"
  | "after_session"
  | "after_committed";

export type FocusTransitionTestHooks = {
  failAt?: FocusFailurePoint;
  failAfterPlanWrites?: number;
};

export class ProjectFocusSessionStore implements FocusSessionStore {
  readonly project: ProjectContext;

  constructor(project: ProjectContext) {
    this.project = project;
  }

  read(sessionKeyHash: string): FocusSessionRecord {
    const recordPath = this.resourcePath(sessionKeyHash);
    if (!fs.existsSync(recordPath)) {
      return {
        schemaVersion: 1,
        sessionKeyHash,
        updatedAt: new Date(0).toISOString(),
      };
    }
    const record = readJsonFile<FocusSessionRecord>(recordPath);
    if (record.schemaVersion !== 1 || record.sessionKeyHash !== sessionKeyHash) {
      throw new ClawError("PLAN_TRANSITION_CONFLICT", `Invalid focus session record: ${recordPath}`);
    }
    return record;
  }

  buildPersistedRecord(sessionKeyHash: string, record: FocusSessionRecord): unknown {
    if (record.sessionKeyHash !== sessionKeyHash) {
      throw new ClawError("PLAN_TRANSITION_CONFLICT", "Focus session record key mismatch.");
    }
    return record;
  }

  writePersistedAtomic(sessionKeyHash: string, persistedRecord: unknown): void {
    const record = persistedRecord as FocusSessionRecord;
    if (record.sessionKeyHash !== sessionKeyHash) {
      throw new ClawError("PLAN_TRANSITION_CONFLICT", "Focus session record key mismatch.");
    }
    writeJsonFileAtomic(this.resourcePath(sessionKeyHash), record);
  }

  queuePath(sessionKeyHash: string): string {
    return `${this.resourcePath(sessionKeyHash)}.queue.json`;
  }

  resourcePath(sessionKeyHash: string): string {
    return path.join(focusTransitionsDirectory(this.project), "sessions", `${sessionKeyHash}.json`);
  }
}

export function createPlanRef(
  project: ProjectContext,
  taskName: string,
  planFile = "plan.json",
  taskDirectory?: string,
): PlanRef {
  const ref: PlanRef = { projectRoot: path.resolve(project.projectRoot), taskName,
    planFile: normalizePlanFile(planFile), scope: project.scope };
  const directory = taskDirectory ?? resolveLegacyTaskDirectory(project, ref);
  if (directory) {
    ref.taskPath = path.relative(project.tasksDir, path.resolve(directory)).replace(/\\/g, "/");
    resolveReferenceTaskDirectory(project, ref);
  }
  return ref;
}

export function focusSessionKeyHash(sessionKey: string): string {
  const normalized = sessionKey.trim();
  if (!normalized) {
    throw new ClawError("CURRENT_PLAN_REQUIRED", "A non-empty session key is required for current-plan focus.");
  }
  return createHash("sha256").update(normalized).digest("hex");
}

export function focusTransitionsDirectory(project: ProjectContext): string {
  return path.join(project.clawDir, "runtime", "focus-transitions");
}

function focusTransitionQuarantineDirectory(project: ProjectContext): string {
  return path.join(focusTransitionsDirectory(project), "quarantine");
}

export function focusQueuePath(project: ProjectContext): string {
  return path.join(focusTransitionsDirectory(project), "queue.json");
}

export function focusOwnersPath(project: ProjectContext): string {
  return path.join(focusTransitionsDirectory(project), "owners.json");
}

export function readFocusedPlan(
  project: ProjectContext,
  sessionKey: string,
  sessionStore: FocusSessionStore = new ProjectFocusSessionStore(project),
): PlanRef | undefined {
  return sessionStore.read(focusSessionKeyHash(sessionKey)).currentPlan;
}

/** Maintenance must retain the backing files until the canonical focus owner
 * releases them, including a terminal plan awaiting projection reconciliation. */
export function focusedTaskDirectories(project: ProjectContext): string[] {
  return Object.values(readOwnerRegistry(project).owners).flatMap(({ planRef }) => {
    if (planRef.taskPath) {
      const directory = ensureInsideDir(project.tasksDir, planRef.taskPath);
      return directory ? [directory] : [];
    }
    return listTaskDirectories(project).filter((task) => task.taskName === planRef.taskName).map((task) => task.taskDir);
  });
}

export function readPlanFocusOwner(
  project: ProjectContext,
  ref: PlanRef,
): PlanFocusOwner | undefined {
  return readOwnerRegistry(project).owners[planIdentityHash(project, ref)];
}

export async function leaveCurrentPlan(
  input: {
    project: ProjectContext;
    sessionKey: string;
    reason?: PlanLeaveReason;
    sessionStore?: FocusSessionStore;
    testHooks?: FocusTransitionTestHooks;
  },
): Promise<FocusTransitionResult> {
  const sessionStore = input.sessionStore ?? new ProjectFocusSessionStore(input.project);
  const sessionKeyHash = focusSessionKeyHash(input.sessionKey);
  const currentPlan = sessionStore.read(sessionKeyHash).currentPlan;
  if (!currentPlan) {
    throw new ClawError(
      "CURRENT_PLAN_REQUIRED",
      "The session has no current plan. Resume a plan explicitly or create a new plan.",
    );
  }
  return commitFocusTransition({
    project: input.project,
    sessionKeyHash,
    kind: "leave",
    sessionStore,
    involvedRefs: [currentPlan],
    testHooks: input.testHooks,
    buildAfter: ({ plans }) => {
      const current = requirePlan(plans, input.project, currentPlan);
      const left = structuredClone(current);
      left.status = "end.leave";
      left.leaveReason = input.reason ?? "manual_leave";
      delete left.completedAt;
      left.updatedAt = new Date().toISOString();
      return {
        currentPlan: undefined,
        plans: [{ ref: currentPlan, content: left }],
      };
    },
  });
}

export async function releaseCurrentPlanFocus(input: {
  project: ProjectContext;
  sessionKey: string;
  expectedEnd?: boolean;
  kind?: "end" | "expire";
  sessionStore?: FocusSessionStore;
  testHooks?: FocusTransitionTestHooks;
}): Promise<FocusTransitionResult> {
  const sessionStore = input.sessionStore ?? new ProjectFocusSessionStore(input.project);
  const sessionKeyHash = focusSessionKeyHash(input.sessionKey);
  const currentPlan = sessionStore.read(sessionKeyHash).currentPlan;
  if (!currentPlan) {
    return { changed: false, enteredEndPlans: [] };
  }
  return commitFocusTransition({
    project: input.project,
    sessionKeyHash,
    kind: input.kind ?? "end",
    sessionStore,
    involvedRefs: [currentPlan],
    testHooks: input.testHooks,
    buildAfter: ({ plans }) => {
      const current = structuredClone(requirePlan(plans, input.project, currentPlan));
      if (input.expectedEnd && !current.status.startsWith("end.")) {
        throw new ClawError(
          "PLAN_TRANSITION_CONFLICT",
          "Current-plan focus can only be released by an end transition after the plan entered end.*.",
          { currentPlan, status: current.status },
        );
      }
      return {
        currentPlan: undefined,
        plans: [{ ref: currentPlan, content: current }],
      };
    },
  });
}

export async function activatePlan(
  input: {
    project: ProjectContext;
    sessionKey: string;
    target?: PlanRef;
    sessionStore?: FocusSessionStore;
    testHooks?: FocusTransitionTestHooks;
  },
): Promise<FocusTransitionResult> {
  const sessionStore = input.sessionStore ?? new ProjectFocusSessionStore(input.project);
  const sessionKeyHash = focusSessionKeyHash(input.sessionKey);
  const currentPlan = sessionStore.read(sessionKeyHash).currentPlan;
  const target = input.target ?? currentPlan;
  if (!target) {
    throw new ClawError(
      "CURRENT_PLAN_REQUIRED",
      "The session has no current plan. Pass a plan id to resume it explicitly.",
    );
  }
  if (currentPlan && samePlanRef(input.project, currentPlan, target)) {
    const current = readPlanDocument(input.project, target);
    if (current.status === "process.active") {
      return { changed: false, currentPlan: target, enteredEndPlans: [] };
    }
  }
  return switchCurrentPlan({
    project: input.project,
    sessionKey: input.sessionKey,
    target,
    kind: "resume",
    sessionStore,
    testHooks: input.testHooks,
  });
}

export async function switchCurrentPlan(
  input: {
    project: ProjectContext;
    sessionKey: string;
    target: PlanRef;
    kind?: FocusTransitionKind;
    additionalPlanUpdates?: Array<{ ref: PlanRef; content: PlanDocument }>;
    preserveTargetStatus?: boolean;
    preserveCurrentEndState?: boolean;
    binding?: FocusTransitionJournal["binding"];
    sessionStore?: FocusSessionStore;
    testHooks?: FocusTransitionTestHooks;
  },
): Promise<FocusTransitionResult> {
  const sessionStore = input.sessionStore ?? new ProjectFocusSessionStore(input.project);
  const sessionKeyHash = focusSessionKeyHash(input.sessionKey);
  const currentPlan = sessionStore.read(sessionKeyHash).currentPlan;
  const refs = uniquePlanRefs(input.project, [
    ...(currentPlan ? [currentPlan] : []),
    input.target,
    ...(input.additionalPlanUpdates?.map((entry) => entry.ref) ?? []),
  ]);
  return commitFocusTransition({
    project: input.project,
    sessionKeyHash,
    kind: input.kind ?? "resume",
    sessionStore,
    involvedRefs: refs,
    binding: input.binding,
    testHooks: input.testHooks,
    buildAfter: ({ plans }) => {
      const updates = new Map<string, { ref: PlanRef; content: PlanDocument }>();
      for (const update of input.additionalPlanUpdates ?? []) {
        updates.set(planIdentityHash(input.project, update.ref), {
          ref: update.ref,
          content: structuredClone(update.content),
        });
      }
      if (currentPlan && !samePlanRef(input.project, currentPlan, input.target)) {
        const current = structuredClone(
          updates.get(planIdentityHash(input.project, currentPlan))?.content
            ?? requirePlan(plans, input.project, currentPlan),
        );
        // An explicit new root request switches focus: the previous plan is left
        // resumable (end.leave) instead of forcing a separate plan.leave ceremony.
        if (!(input.preserveCurrentEndState && current.status.startsWith("end."))) {
          current.status = "end.leave";
          current.leaveReason = "switch_to_new_plan";
          delete current.completedAt;
        }
        current.updatedAt = new Date().toISOString();
        updates.set(planIdentityHash(input.project, currentPlan), { ref: currentPlan, content: current });
      }
      const target = structuredClone(
        updates.get(planIdentityHash(input.project, input.target))?.content
          ?? requirePlan(plans, input.project, input.target),
      );
      if (!input.preserveTargetStatus) {
        assertResumable(target, input.target);
        target.status = "process.active";
        delete target.completedAt;
      }
      delete target.leaveReason;
      target.updatedAt = new Date().toISOString();
      updates.set(planIdentityHash(input.project, input.target), { ref: input.target, content: target });
      return {
        currentPlan: input.target,
        plans: [...updates.values()],
      };
    },
  });
}

export async function createPlanAndSwitchFocus(input: {
  project: ProjectContext;
  sessionKey: string;
  createdPlan: PlanRef;
  sessionStore?: FocusSessionStore;
  testHooks?: FocusTransitionTestHooks;
}): Promise<FocusTransitionResult> {
  return switchCurrentPlan({
    project: input.project,
    sessionKey: input.sessionKey,
    target: input.createdPlan,
    kind: "create",
    preserveTargetStatus: true,
    sessionStore: input.sessionStore,
    testHooks: input.testHooks,
  });
}

/** Commit the child, parent relationship, focus and binding under one journal. */
export async function commitSubplanCreation(input: {
  project: ProjectContext;
  sessionKey: string;
  bindingSessionKey: string;
  parentPlan: PlanRef;
  parentBefore: PlanDocument;
  childPlan: PlanRef;
  childContent: PlanDocument;
  sessionStore?: FocusSessionStore;
  testHooks?: FocusTransitionTestHooks;
}): Promise<FocusTransitionResult> {
  const sessionStore = input.sessionStore ?? new ProjectFocusSessionStore(input.project);
  const parentPath = resolvePlanRefPath(input.project, input.parentPlan);
  const childPath = resolvePlanRefPath(input.project, input.childPlan);
  return commitFocusTransition({
    project: input.project, sessionKeyHash: focusSessionKeyHash(input.sessionKey),
    kind: "subplan_create", sessionStore, involvedRefs: [input.parentPlan],
    createdPlans: [{ ref: input.childPlan, content: input.childContent }],
    binding: { sessionKey: input.bindingSessionKey, before: parentPath, after: childPath },
    testHooks: input.testHooks,
    buildAfter: ({ plans, session, owners }) => {
      if (session.currentPlan && !samePlanRef(input.project, session.currentPlan, input.parentPlan)) {
        throw new ClawError("PLAN_FOCUS_CHANGED", "Current focus changed before subplan creation.");
      }
      validateTargetOwnership(input.project, focusSessionKeyHash(input.sessionKey), input.parentPlan, owners);
      const parent = structuredClone(requirePlan(plans, input.project, input.parentPlan));
      if (hashJson(parent) !== hashJson(input.parentBefore)) {
        throw new ClawError("PLAN_STALE_EDIT", "Parent plan changed while the subplan template was prepared.");
      }
      const task = parent.tasks.find((item) => item.id === input.childContent.parentTaskId);
      if (!task || input.childContent.parentPlan !== input.parentPlan.planFile) {
        throw new ClawError("PLAN_TRANSITION_CONFLICT", "Prepared child does not belong to the current parent task.");
      }
      task.execution = { ...task.execution, type: "subplan", subplan: input.childPlan.planFile, planPath: input.childPlan.planFile };
      if (task.status === "pending") task.status = "in_progress";
      parent.status = "end.leave";
      parent.leaveReason = "switch_to_new_plan";
      delete parent.completedAt;
      parent.updatedAt = new Date().toISOString();
      return { currentPlan: input.childPlan, plans: [
        { ref: input.childPlan, content: input.childContent },
        { ref: input.parentPlan, content: parent },
      ] };
    },
  });
}

export async function createSubplanAndSwitchFocus(input: {
  project: ProjectContext;
  sessionKey: string;
  parentPlan: PlanRef;
  parentAfterLink: PlanDocument;
  childPlan: PlanRef;
  sessionStore?: FocusSessionStore;
  testHooks?: FocusTransitionTestHooks;
}): Promise<FocusTransitionResult> {
  return switchCurrentPlan({
    project: input.project,
    sessionKey: input.sessionKey,
    target: input.childPlan,
    kind: "subplan_create",
    preserveTargetStatus: true,
    additionalPlanUpdates: [{
      ref: input.parentPlan,
      content: input.parentAfterLink,
    }],
    sessionStore: input.sessionStore,
    testHooks: input.testHooks,
  });
}

export async function completeSubplanAndRestoreParent(input: {
  project: ProjectContext;
  sessionKey: string;
  childPlan: PlanRef;
  completedChild: PlanDocument;
  parentPlan: PlanRef;
  parentTaskId: number;
  bindingSessionKey?: string;
  sessionStore?: FocusSessionStore;
  testHooks?: FocusTransitionTestHooks;
}): Promise<FocusTransitionResult> {
  if (!input.completedChild.status.startsWith("end.")) {
    throw new ClawError(
      "PLAN_TRANSITION_CONFLICT",
      "A subplan must enter an end.* state before restoring its parent.",
      { childPlan: input.childPlan, status: input.completedChild.status },
    );
  }
  const parent = readPlanDocument(input.project, input.parentPlan);
  const parentTask = parent.tasks.find((task) => task.id === input.parentTaskId);
  if (!parentTask) {
    throw new ClawError(
      "PLAN_TRANSITION_CONFLICT",
      `Parent task ${input.parentTaskId} does not exist.`,
      { parentPlan: input.parentPlan, parentTaskId: input.parentTaskId },
    );
  }
  parentTask.status = "done";
  parent.status = "process.active";
  delete parent.leaveReason;
  delete parent.completedAt;
  parent.updatedAt = new Date().toISOString();
  return switchCurrentPlan({
    project: input.project,
    sessionKey: input.sessionKey,
    target: input.parentPlan,
    kind: "subplan_complete",
    ...(input.bindingSessionKey ? { binding: { sessionKey: input.bindingSessionKey,
      before: readSessionBoundPlanPath(input.project, input.bindingSessionKey),
      after: resolvePlanRefPath(input.project, input.parentPlan) } } : {}),
    additionalPlanUpdates: [
      { ref: input.childPlan, content: input.completedChild },
      { ref: input.parentPlan, content: parent },
    ],
    preserveCurrentEndState: true,
    sessionStore: input.sessionStore,
    testHooks: input.testHooks,
  });
}

export async function recoverProjectFocusTransitions(input: {
  project: ProjectContext;
  sessionStore?: FocusSessionStore;
}): Promise<{ recovered: string[]; discarded: string[]; quarantined: string[] }> {
  const sessionStore = input.sessionStore ?? new ProjectFocusSessionStore(input.project);
  return withSerializedQueue(focusQueuePath(input.project), async () =>
    recoverProjectFocusTransitionsLocked(input.project, sessionStore));
}

async function commitFocusTransition(input: {
  project: ProjectContext;
  sessionKeyHash: string;
  kind: FocusTransitionKind;
  sessionStore: FocusSessionStore;
  involvedRefs: PlanRef[];
  createdPlans?: Array<{ ref: PlanRef; content: PlanDocument }>;
  binding?: { sessionKey: string; before: string | null; after: string | null };
  testHooks?: FocusTransitionTestHooks;
  buildAfter: (context: {
    plans: Map<string, PlanDocument>;
    session: FocusSessionRecord;
    owners: PlanFocusRegistry;
  }) => {
    currentPlan?: PlanRef;
    plans: Array<{ ref: PlanRef; content: PlanDocument }>;
  };
}): Promise<FocusTransitionResult> {
  const execution: ClawExecutionFailure = { operation: "focus." + input.kind, phase: "prepare", outcome: "known", effect: "none" };
  try {
  return await withSerializedQueue(focusQueuePath(input.project), async () => {
    await recoverProjectFocusTransitionsLocked(input.project, input.sessionStore);
    const allRefs = uniquePlanRefs(input.project, [...input.involvedRefs, ...(input.createdPlans?.map((item) => item.ref) ?? [])]);
    const planPaths = allRefs
      .map((ref) => resolvePlanRefPath(input.project, ref))
      .sort((left, right) => left.localeCompare(right));
    return withPlanQueues(planPaths, () =>
      withSerializedQueue(input.sessionStore.queuePath(input.sessionKeyHash), async () => {
        const session = input.sessionStore.read(input.sessionKeyHash);
        const owners = readOwnerRegistry(input.project);
        validateRegistryConsistency(input.project, input.sessionKeyHash, session, owners);
        const plans = new Map(
          input.involvedRefs.map((ref) => [
            planIdentityHash(input.project, ref),
            readPlanDocument(input.project, ref),
          ]),
        );
        for (const created of input.createdPlans ?? []) {
          const createdPath = resolvePlanRefPath(input.project, created.ref);
          if (fs.existsSync(createdPath)) throw new ClawError("PLAN_ALREADY_EXISTS", "Subplan already exists; creation will not overwrite it.", { planPath: createdPath });
        }
        if (input.binding && readSessionBoundPlanPath(input.project, input.binding.sessionKey) !== input.binding.before) {
          throw new ClawError("PLAN_FOCUS_CHANGED", "Session binding changed before subplan creation.");
        }
        const built = input.buildAfter({ plans, session, owners });
        const normalizedAfterPlans = uniqueAfterPlans(input.project, built.plans);
        validateTargetOwnership(input.project, input.sessionKeyHash, built.currentPlan, owners);
        const now = new Date().toISOString();
        const afterOwners = buildAfterOwners(
          input.project,
          input.sessionKeyHash,
          built.currentPlan,
          owners,
          now,
        );
        const afterSession: FocusSessionRecord = {
          schemaVersion: 1,
          sessionKeyHash: input.sessionKeyHash,
          ...(built.currentPlan ? { currentPlan: built.currentPlan } : {}),
          updatedAt: now,
        };
        const persistedAfterSession = input.sessionStore.buildPersistedRecord(
          input.sessionKeyHash,
          afterSession,
        );
        const transitionId = randomUUID();
        const journalPath = path.join(focusTransitionsDirectory(input.project), `${transitionId}.json`);
        const journal: FocusTransitionJournal = {
          schemaVersion: 1,
          transitionId,
          kind: input.kind,
          sessionKeyHash: input.sessionKeyHash,
          phase: "prepared",
          createdAt: now,
          updatedAt: now,
          before: {
            sessionRecordHash: hashFile(input.sessionStore.resourcePath(input.sessionKeyHash)),
            ownerRegistryHash: hashFile(focusOwnersPath(input.project)),
            ...(session.currentPlan ? { sessionCurrentPlan: session.currentPlan } : {}),
            plans: normalizedAfterPlans.map(({ ref }) => ({
              ref,
              contentHash: hashFile(resolvePlanRefPath(input.project, ref)),
            })),
          },
          after: {
            sessionRecord: persistedAfterSession,
            ownerRegistry: afterOwners,
            ...(built.currentPlan ? { sessionCurrentPlan: built.currentPlan } : {}),
            plans: normalizedAfterPlans,
          },
          ...(input.binding ? { binding: input.binding } : {}),
        };
        writeJsonFileAtomic(journalPath, journal);
        failAt(input.testHooks, "after_prepared");
        Object.assign(execution, { phase: "commit", outcome: "unknown", effect: "unknown" });
        journal.phase = "applying";
        journal.updatedAt = new Date().toISOString();
        writeJsonFileAtomic(journalPath, journal);
        Object.assign(execution, { phase: "commit", outcome: "known", effect: "partial" });
        failAt(input.testHooks, "after_applying");
        let writtenPlanCount = 0;
        for (const afterPlan of normalizedAfterPlans) {
          writeJsonFileAtomic(resolvePlanRefPath(input.project, afterPlan.ref), afterPlan.content);
          writtenPlanCount += 1;
          if (
            input.testHooks?.failAt === "after_plan"
            && (input.testHooks.failAfterPlanWrites === undefined
              || input.testHooks.failAfterPlanWrites === writtenPlanCount)
          ) {
            failAt(input.testHooks, "after_plan");
          }
        }
        writeJsonFileAtomic(focusOwnersPath(input.project), afterOwners);
        failAt(input.testHooks, "after_owners");
        if (journal.binding) {
          applySessionBindingTransition(input.project, journal.binding.sessionKey, journal.binding.before, journal.binding.after);
          failAt(input.testHooks, "after_binding");
        }
        input.sessionStore.writePersistedAtomic(input.sessionKeyHash, persistedAfterSession);
        failAt(input.testHooks, "after_session");
        journal.phase = "committed";
        journal.updatedAt = new Date().toISOString();
        writeJsonFileAtomic(journalPath, journal);
        Object.assign(execution, { phase: "post-commit", outcome: "known", effect: "committed" });
        failAt(input.testHooks, "after_committed");
        fs.unlinkSync(journalPath);
        const previousCurrentPlan = session.currentPlan;
        return {
          changed: true,
          transitionId,
          ...(previousCurrentPlan ? { previousCurrentPlan } : {}),
          ...(built.currentPlan ? { currentPlan: built.currentPlan } : {}),
          enteredEndPlans: normalizedAfterPlans.flatMap(({ ref, content }) => {
            const before = plans.get(planIdentityHash(input.project, ref));
            return before && !before.status.startsWith("end.") && content.status.startsWith("end.")
              ? [{ ref, plan: content, endedAt: content.completedAt ?? now }]
              : [];
          }),
        };
      }));
  });
  } catch (error) { throw withExecutionFailure(error, execution); }
}

async function recoverProjectFocusTransitionsLocked(
  project: ProjectContext,
  sessionStore: FocusSessionStore,
): Promise<{ recovered: string[]; discarded: string[]; quarantined: string[] }> {
  const directory = focusTransitionsDirectory(project);
  if (!fs.existsSync(directory)) {
    return { recovered: [], discarded: [], quarantined: [] };
  }
  const journalPaths = fs.readdirSync(directory)
    .filter((name) => /^[0-9a-f-]+\.json$/i.test(name))
    .map((name) => path.join(directory, name))
    .sort();
  const recovered: string[] = [];
  const discarded: string[] = [];
  const quarantined: string[] = [];
  for (const journalPath of journalPaths) {
    try {
      const journal = readJsonFile<FocusTransitionJournal>(journalPath);
      validateJournal(project, journal, journalPath);
      const planPaths = journal.after.plans
        .map(({ ref }) => resolvePlanRefPath(project, ref))
        .sort((left, right) => left.localeCompare(right));
      await withPlanQueues(planPaths, () =>
        withSerializedQueue(sessionStore.queuePath(journal.sessionKeyHash), async () => {
        verifyBindingState(project, journal, journal.phase);
        if (journal.phase === "prepared") {
          assertResourceHash(
            focusOwnersPath(project),
            journal.before.ownerRegistryHash,
            undefined,
            journal,
          );
          assertResourceHash(
            sessionStore.resourcePath(journal.sessionKeyHash),
            journal.before.sessionRecordHash,
            undefined,
            journal,
          );
          for (const beforePlan of journal.before.plans) {
            assertResourceHash(
              resolvePlanRefPath(project, beforePlan.ref),
              beforePlan.contentHash,
              undefined,
              journal,
            );
          }
          fs.unlinkSync(journalPath);
          discarded.push(journal.transitionId);
          return;
        }
        const planAfter = new Map(
          journal.after.plans.map((entry) => [
            resolvePlanRefPath(project, entry.ref),
            entry.content,
          ]),
        );
        if (journal.phase === "applying") {
          for (const beforePlan of journal.before.plans) {
            const resourcePath = resolvePlanRefPath(project, beforePlan.ref);
            rollForwardResource(
              resourcePath,
              beforePlan.contentHash,
              planAfter.get(resourcePath),
              journal,
            );
          }
          rollForwardResource(
            focusOwnersPath(project),
            journal.before.ownerRegistryHash,
            journal.after.ownerRegistry,
            journal,
          );
          if (journal.binding) applySessionBindingTransition(project, journal.binding.sessionKey, journal.binding.before, journal.binding.after);
          rollForwardSession(
            sessionStore,
            journal.sessionKeyHash,
            journal.before.sessionRecordHash,
            journal.after.sessionRecord,
            journal,
          );
          journal.phase = "committed";
          journal.updatedAt = new Date().toISOString();
          writeJsonFileAtomic(journalPath, journal);
        }
        verifyAfterState(project, sessionStore, journal);
        fs.unlinkSync(journalPath);
        recovered.push(journal.transitionId);
        }));
    } catch (error) {
      if (!(error instanceof ClawError) || error.code !== "FOCUS_RECOVERY_CONFLICT") throw error;
      // A third-party edit means neither rollback nor roll-forward is safe.
      // Preserve the complete journal for inspection, but remove it from the
      // active recovery queue so one damaged transition cannot block every
      // future claw operation in this project.
      fs.mkdirSync(focusTransitionQuarantineDirectory(project), { recursive: true });
      fs.renameSync(journalPath, path.join(focusTransitionQuarantineDirectory(project), path.basename(journalPath)));
      quarantined.push(path.basename(journalPath, ".json"));
    }
  }
  return { recovered, discarded, quarantined };
}

function verifyBindingState(project: ProjectContext, journal: FocusTransitionJournal, phase: FocusTransitionJournal["phase"]): void {
  if (!journal.binding) return;
  const { sessionKey, before, after } = journal.binding;
  const current = readSessionBoundPlanPath(project, sessionKey);
  const valid = phase === "prepared" ? current === before
    : phase === "committed" ? current === after : current === before || current === after;
  if (!valid) throw new ClawError("FOCUS_RECOVERY_CONFLICT", "Journaled session binding conflicts with a later change.", { transitionId: journal.transitionId });
}

function verifyAfterState(
  project: ProjectContext,
  sessionStore: FocusSessionStore,
  journal: FocusTransitionJournal,
): void {
  verifyBindingState(project, journal, "committed");
  for (const afterPlan of journal.after.plans) {
    assertResourceHash(
      resolvePlanRefPath(project, afterPlan.ref),
      undefined,
      hashJson(afterPlan.content),
      journal,
    );
  }
  assertResourceHash(
    focusOwnersPath(project),
    undefined,
    hashJson(journal.after.ownerRegistry),
    journal,
  );
  assertResourceHash(
    sessionStore.resourcePath(journal.sessionKeyHash),
    undefined,
    hashJson(journal.after.sessionRecord),
    journal,
  );
}

function rollForwardResource(
  resourcePath: string,
  beforeHash: string,
  afterValue: unknown,
  journal: FocusTransitionJournal,
): void {
  const currentHash = hashFile(resourcePath);
  const afterHash = hashJson(afterValue);
  if (currentHash === afterHash) return;
  if (currentHash !== beforeHash) {
    throwRecoveryConflict(resourcePath, currentHash, beforeHash, afterHash, journal);
  }
  writeJsonFileAtomic(resourcePath, afterValue);
}

function rollForwardSession(
  store: FocusSessionStore,
  sessionKeyHash: string,
  beforeHash: string,
  afterValue: unknown,
  journal: FocusTransitionJournal,
): void {
  const resourcePath = store.resourcePath(sessionKeyHash);
  const currentHash = hashFile(resourcePath);
  const afterHash = hashJson(afterValue);
  if (currentHash === afterHash) return;
  if (currentHash !== beforeHash) {
    throwRecoveryConflict(resourcePath, currentHash, beforeHash, afterHash, journal);
  }
  store.writePersistedAtomic(sessionKeyHash, afterValue);
}

function assertResourceHash(
  resourcePath: string,
  beforeHash: string | undefined,
  afterHash: string | undefined,
  journal: FocusTransitionJournal,
): void {
  const currentHash = hashFile(resourcePath);
  if (currentHash === beforeHash || currentHash === afterHash) return;
  throwRecoveryConflict(resourcePath, currentHash, beforeHash, afterHash, journal);
}

function throwRecoveryConflict(
  resourcePath: string,
  currentHash: string,
  beforeHash: string | undefined,
  afterHash: string | undefined,
  journal: FocusTransitionJournal,
): never {
  throw new ClawError(
    "FOCUS_RECOVERY_CONFLICT",
    `Focus transition ${journal.transitionId} conflicts with an unexpected resource state.`,
    { resourcePath, currentHash, beforeHash, afterHash, journalPath: `${journal.transitionId}.json` },
  );
}

function validateJournal(project: ProjectContext, journal: FocusTransitionJournal, journalPath: string): void {
  if (journal.schemaVersion !== 1 || !journal.transitionId || !journal.sessionKeyHash) {
    throw new ClawError("FOCUS_RECOVERY_CONFLICT", `Invalid focus transition journal: ${journalPath}`);
  }
  for (const entry of [...journal.before.plans, ...journal.after.plans]) {
    resolvePlanRefPath(project, entry.ref);
  }
  if (journal.binding) {
    if (!journal.binding.sessionKey?.trim()) throw new ClawError("FOCUS_RECOVERY_CONFLICT", "Journal binding owner is missing.");
    for (const locator of [journal.binding.before, journal.binding.after]) {
      if (locator === null) continue;
      if (typeof locator !== "string" || ensureInsideDir(project.tasksDir, path.relative(project.tasksDir, locator)) !== path.resolve(locator)) {
        throw new ClawError("FOCUS_RECOVERY_CONFLICT", "Journal binding escapes active task storage.");
      }
    }
  }
}

function validateRegistryConsistency(
  project: ProjectContext,
  sessionKeyHash: string,
  session: FocusSessionRecord,
  owners: PlanFocusRegistry,
): void {
  const owned = Object.values(owners.owners).filter((owner) => owner.sessionKeyHash === sessionKeyHash);
  if (owned.length > 1) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "A session cannot own more than one current plan.");
  }
  if (session.currentPlan) {
    const owner = owners.owners[planIdentityHash(project, session.currentPlan)];
    if (!owner || owner.sessionKeyHash !== sessionKeyHash) {
      throw new ClawError(
        "PLAN_TRANSITION_CONFLICT",
        "The session currentPlan and plan focus owner registry disagree.",
      );
    }
  } else if (owned.length > 0) {
    throw new ClawError(
      "PLAN_TRANSITION_CONFLICT",
      "The owner registry contains a plan for a session without currentPlan.",
    );
  }
}

function validateTargetOwnership(
  project: ProjectContext,
  sessionKeyHash: string,
  target: PlanRef | undefined,
  owners: PlanFocusRegistry,
): void {
  if (!target) return;
  const unresolvedLegacy = owners.owners[legacyPlanIdentityHash(project, target)];
  if (unresolvedLegacy) {
    resolveReferenceTaskDirectory(project, unresolvedLegacy.planRef);
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "Legacy focus ownership needs exact reconciliation.");
  }
  const owner = owners.owners[planIdentityHash(project, target)];
  if (owner && owner.sessionKeyHash !== sessionKeyHash) {
    throw new ClawError(
      "PLAN_FOCUS_CONFLICT",
      `Plan "${target.planFile}" is current in another retained session.`,
      { planRef: target, ownerSessionKeyHash: owner.sessionKeyHash },
    );
  }
}

function buildAfterOwners(
  project: ProjectContext,
  sessionKeyHash: string,
  target: PlanRef | undefined,
  current: PlanFocusRegistry,
  now: string,
): PlanFocusRegistry {
  const owners = structuredClone(current);
  for (const [identity, owner] of Object.entries(owners.owners)) {
    if (owner.sessionKeyHash === sessionKeyHash) {
      delete owners.owners[identity];
    }
  }
  if (target) {
    const identity = planIdentityHash(project, target);
    const existing = current.owners[identity];
    owners.owners[identity] = {
      sessionKeyHash,
      planRef: target,
      acquiredAt: existing?.sessionKeyHash === sessionKeyHash ? existing.acquiredAt : now,
      updatedAt: now,
    };
  }
  return owners;
}

function readOwnerRegistry(project: ProjectContext): PlanFocusRegistry {
  const registryPath = focusOwnersPath(project);
  if (!fs.existsSync(registryPath)) {
    return { schemaVersion: 1, owners: {} };
  }
  const registry = readJsonFile<PlanFocusRegistry>(registryPath);
  if (registry.schemaVersion !== 1 || !registry.owners || typeof registry.owners !== "object") {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", `Invalid plan focus registry: ${registryPath}`);
  }
  // Re-key unambiguous legacy owners in memory. An ambiguous legacy record
  // remains under its old key and blocks only operations touching that name.
  const owners: PlanFocusRegistry["owners"] = {};
  for (const [oldKey, owner] of Object.entries(registry.owners)) {
    let key = oldKey;
    try { key = planIdentityHash(project, owner.planRef); }
    catch (error) {
      if (owner.planRef.taskPath !== undefined || !(error instanceof ClawError)
        || !["PLAN_TRANSITION_CONFLICT", "PLAN_NOT_FOUND"].includes(error.code)) throw error;
    }
    if (owners[key] && owners[key]!.sessionKeyHash !== owner.sessionKeyHash) {
      throw new ClawError("PLAN_FOCUS_CONFLICT", "Two retained sessions own the same exact plan.");
    }
    owners[key] = owner;
  }
  return { ...registry, owners };
}

function readPlanDocument(project: ProjectContext, ref: PlanRef): PlanDocument {
  const planPath = resolvePlanRefPath(project, ref);
  if (!fs.existsSync(planPath)) throw new ClawError("PLAN_NOT_FOUND", "Referenced plan does not exist.", { planRef: ref });
  return readJsonFile<PlanDocument>(planPath);
}

function requirePlan(
  plans: Map<string, PlanDocument>,
  project: ProjectContext,
  ref: PlanRef,
): PlanDocument {
  const plan = plans.get(planIdentityHash(project, ref));
  if (!plan) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "Focus transition did not lock every involved plan.", {
      planRef: ref,
    });
  }
  return plan;
}

function assertResumable(plan: PlanDocument, ref: PlanRef): void {
  if (
    plan.status !== "end.leave"
    && plan.status !== "end.completed"
    && plan.status !== "end.closed"
    && plan.status !== "process.wait"
    && plan.status !== "process.discussing"
    && plan.status !== "process.active"
  ) {
    throw new ClawError(
      "PLAN_NOT_RESUMABLE",
      `Plan "${ref.planFile}" cannot resume from ${plan.status}.`,
      { planRef: ref, status: plan.status },
    );
  }
}

function resolveLegacyTaskDirectory(project: ProjectContext, ref: PlanRef): string | undefined {
  const matches = listTaskDirectories(project).filter((task) => task.taskName === ref.taskName);
  if (matches.length > 1) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "Legacy plan reference is ambiguous; an exact task path is required.",
      { taskName: ref.taskName, candidates: matches.map((task) => task.relativePath) });
  }
  return matches[0]?.taskDir;
}

function resolveReferenceTaskDirectory(project: ProjectContext, ref: PlanRef): string | undefined {
  if (ref.scope && project.scope && ref.scope !== project.scope) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "PlanRef belongs to a different storage scope.");
  }
  if (ref.taskPath === undefined) return resolveLegacyTaskDirectory(project, ref);
  const directory = ensureInsideDir(project.tasksDir, ref.taskPath);
  if (!directory || path.basename(directory) !== ref.taskName || path.resolve(directory) === path.resolve(project.tasksDir)) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "PlanRef task path is outside its canonical container.", { planRef: ref });
  }
  return directory;
}

function resolvePlanRefPath(project: ProjectContext, ref: PlanRef): string {
  if (path.resolve(ref.projectRoot) !== path.resolve(project.projectRoot)) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "PlanRef belongs to a different project.", {
      planRef: ref,
      projectRoot: project.projectRoot,
    });
  }
  const taskDirectory = resolveReferenceTaskDirectory(project, ref);
  if (!taskDirectory) {
    throw new ClawError("PLAN_NOT_FOUND", `Task "${ref.taskName}" does not exist.`, { planRef: ref });
  }
  const normalizedPlanFile = normalizePlanFile(ref.planFile);
  const planPath = ensureInsideDir(taskDirectory, normalizedPlanFile);
  if (!planPath) {
    throw new ClawError("PLAN_NOT_FOUND", `Plan "${normalizedPlanFile}" does not exist.`, { planRef: ref });
  }
  return planPath;
}

function legacyPlanIdentityHash(project: ProjectContext, ref: PlanRef): string {
  return createHash("sha256")
    .update(`${path.resolve(project.projectRoot)}\0${ref.taskName}\0${normalizePlanFile(ref.planFile)}`)
    .digest("hex");
}

function planIdentityHash(project: ProjectContext, ref: PlanRef): string {
  const directory = resolveReferenceTaskDirectory(project, ref);
  if (!directory) throw new ClawError("PLAN_NOT_FOUND", `Task "${ref.taskName}" does not exist.`);
  return createHash("sha256")
    .update(JSON.stringify([path.resolve(project.clawDir), ref.scope ?? project.scope,
      path.relative(project.tasksDir, directory).replace(/\\/g, "/"), normalizePlanFile(ref.planFile)]))
    .digest("hex");
}

function samePlanRef(project: ProjectContext, left: PlanRef, right: PlanRef): boolean {
  return planIdentityHash(project, left) === planIdentityHash(project, right);
}

function uniquePlanRefs(project: ProjectContext, refs: PlanRef[]): PlanRef[] {
  const unique = new Map<string, PlanRef>();
  for (const ref of refs) unique.set(planIdentityHash(project, ref), ref);
  return [...unique.values()];
}

function uniqueAfterPlans(
  project: ProjectContext,
  plans: Array<{ ref: PlanRef; content: PlanDocument }>,
): Array<{ ref: PlanRef; content: PlanDocument }> {
  const unique = new Map<string, { ref: PlanRef; content: PlanDocument }>();
  for (const plan of plans) {
    unique.set(planIdentityHash(project, plan.ref), {
      ref: plan.ref,
      content: structuredClone(plan.content),
    });
  }
  return [...unique.values()].sort((left, right) =>
    resolvePlanRefPath(project, left.ref).localeCompare(resolvePlanRefPath(project, right.ref)));
}

function hashFile(filePath: string): string {
  return fs.existsSync(filePath)
    ? createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
    : MISSING_RESOURCE_HASH;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(serializeJsonFile(value)).digest("hex");
}

async function withPlanQueues<T>(planPaths: string[], action: () => Promise<T>): Promise<T> {
  const [first, ...rest] = planPaths;
  if (!first) return action();
  return withSerializedAccess(first, () => withPlanQueues(rest, action));
}

function failAt(hooks: FocusTransitionTestHooks | undefined, point: FocusFailurePoint): void {
  if (hooks?.failAt === point) {
    throw new Error(`Injected focus transition failure at ${point}.`);
  }
}
