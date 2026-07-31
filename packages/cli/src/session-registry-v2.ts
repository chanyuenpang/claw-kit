import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ClawError,
  type FocusSessionRecord,
  type FocusSessionStore,
  type PlanRef,
  readJsonFile,
  withSerializedQueue,
  writeJsonFileAtomic,
} from "@veewo/claw-core";

export const SESSION_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionClientInfo = {
  kind: "terminal" | "node" | "adapter";
  host?: string;
};

export type SessionRecordV2 = {
  schemaVersion: 2;
  agentSessionId: string;
  canonicalWorkdir: string;
  state: "live" | "disconnected";
  currentPlan?: PlanRef;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string;
  expiresAt: string;
  lastClient?: SessionClientInfo;
};

export type SessionIdentityV2 = {
  agentSessionId: string;
  canonicalWorkdir: string;
  sessionKeyHash: string;
};

export function resolveSessionDaemonRuntimeRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLAW_SESSION_DAEMON_RUNTIME_DIR?.trim()) {
    return path.resolve(env.CLAW_SESSION_DAEMON_RUNTIME_DIR);
  }
  const userRuntime = process.platform === "win32"
    ? env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")
    : env.XDG_RUNTIME_DIR ?? env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.resolve(userRuntime, "claw", "session-daemon-v2");
}

export function canonicalizeSessionWorkdir(workdir: string): string {
  const absolute = path.resolve(workdir);
  let canonical = absolute;
  try {
    canonical = fs.realpathSync.native(absolute);
  } catch {
    // Opening a session does not require an initialized .claw project, but the
    // directory itself is validated by the caller before command execution.
  }
  if (process.platform === "win32" && /^[a-z]:/i.test(canonical)) {
    canonical = `${canonical[0]!.toUpperCase()}${canonical.slice(1)}`;
  }
  const root = path.parse(canonical).root;
  while (canonical.length > root.length && /[\\/]$/.test(canonical)) {
    canonical = canonical.slice(0, -1);
  }
  return canonical;
}

export function createSessionIdentity(agentSessionId: string, workdir: string): SessionIdentityV2 {
  const normalizedId = agentSessionId.trim();
  if (!normalizedId) {
    throw new ClawError("SESSION_IDENTITY_INVALID", "agentSessionId must be non-empty.");
  }
  const canonicalWorkdir = canonicalizeSessionWorkdir(workdir);
  try {
    if (!fs.statSync(canonicalWorkdir).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new ClawError(
      "SESSION_IDENTITY_INVALID",
      `Session workdir is not an existing directory: ${canonicalWorkdir}`,
      { canonicalWorkdir },
    );
  }
  return {
    agentSessionId: normalizedId,
    canonicalWorkdir,
    sessionKeyHash: createHash("sha256")
      .update(`${canonicalWorkdir}\0${normalizedId}`)
      .digest("hex"),
  };
}

export function sessionFocusKey(identity: Pick<SessionIdentityV2, "canonicalWorkdir" | "agentSessionId">): string {
  return `${identity.canonicalWorkdir}\0${identity.agentSessionId}`;
}

export class SessionRegistryV2 {
  readonly runtimeRoot: string;

  constructor(runtimeRoot = resolveSessionDaemonRuntimeRoot()) {
    this.runtimeRoot = path.resolve(runtimeRoot);
    ensurePrivateDirectory(this.runtimeRoot);
    ensurePrivateDirectory(path.join(this.runtimeRoot, "sessions"));
  }

  async open(
    agentSessionId: string,
    workdir: string,
    client: SessionClientInfo,
    now = new Date(),
  ): Promise<{ identity: SessionIdentityV2; record: SessionRecordV2; created: boolean }> {
    const identity = createSessionIdentity(agentSessionId, workdir);
    const recordPath = this.recordPath(identity.sessionKeyHash);
    return withSerializedQueue(this.commandQueuePath(identity.sessionKeyHash), async () => {
      const existing = fs.existsSync(recordPath) ? this.read(identity.sessionKeyHash) : undefined;
      if (
        existing
        && (existing.agentSessionId !== identity.agentSessionId
          || existing.canonicalWorkdir !== identity.canonicalWorkdir)
      ) {
        throw new ClawError("PLAN_TRANSITION_CONFLICT", "Session hash collision or corrupt session identity.");
      }
      const timestamp = now.toISOString();
      const record: SessionRecordV2 = {
        schemaVersion: 2,
        agentSessionId: identity.agentSessionId,
        canonicalWorkdir: identity.canonicalWorkdir,
        state: "live",
        ...(existing?.currentPlan ? { currentPlan: existing.currentPlan } : {}),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        lastConnectedAt: timestamp,
        expiresAt: new Date(now.getTime() + SESSION_RECORD_TTL_MS).toISOString(),
        lastClient: client,
      };
      this.write(identity.sessionKeyHash, record);
      return { identity, record, created: !existing };
    });
  }

  async close(sessionKeyHash: string, now = new Date()): Promise<SessionRecordV2> {
    return withSerializedQueue(this.commandQueuePath(sessionKeyHash), async () => {
      const current = this.read(sessionKeyHash);
      const record = refreshRecord(current, now, { state: "disconnected" });
      this.write(sessionKeyHash, record);
      return record;
    });
  }

  async touch(sessionKeyHash: string, now = new Date()): Promise<SessionRecordV2> {
    return withSerializedQueue(this.commandQueuePath(sessionKeyHash), async () => {
      const record = refreshRecord(this.read(sessionKeyHash), now);
      this.write(sessionKeyHash, record);
      return record;
    });
  }

  read(sessionKeyHash: string): SessionRecordV2 {
    const recordPath = this.recordPath(sessionKeyHash);
    if (!fs.existsSync(recordPath)) {
      throw new ClawError("SESSION_NOT_FOUND", `Session "${sessionKeyHash}" does not exist.`);
    }
    const record = readJsonFile<SessionRecordV2>(recordPath);
    if (record.schemaVersion !== 2) {
      throw new ClawError("PLAN_TRANSITION_CONFLICT", `Invalid v2 session record: ${recordPath}`);
    }
    return record;
  }

  write(sessionKeyHash: string, record: SessionRecordV2): void {
    const expected = createSessionIdentity(record.agentSessionId, record.canonicalWorkdir).sessionKeyHash;
    if (expected !== sessionKeyHash) {
      throw new ClawError("PLAN_TRANSITION_CONFLICT", "Session record does not match its composite identity.");
    }
    writeJsonFileAtomic(this.recordPath(sessionKeyHash), record);
  }

  recover(now = new Date()): { normalized: string[]; removed: string[] } {
    const normalized: string[] = [];
    const removed: string[] = [];
    for (const sessionKeyHash of this.listSessionKeys()) {
      let record: SessionRecordV2;
      try {
        record = this.read(sessionKeyHash);
      } catch {
        continue;
      }
      if (record.state === "live") {
        record = refreshRecord(record, now, { state: "disconnected", preserveExpiry: true });
        this.write(sessionKeyHash, record);
        normalized.push(sessionKeyHash);
      }
      if (record.state === "disconnected" && Date.parse(record.expiresAt) <= now.getTime()) {
        if (!record.currentPlan) {
          this.removeSessionDirectory(sessionKeyHash);
          removed.push(sessionKeyHash);
        }
      }
    }
    return { normalized, removed };
  }

  cleanupExpired(now = new Date(), liveSessionKeys = new Set<string>()): string[] {
    const removed: string[] = [];
    for (const sessionKeyHash of this.listSessionKeys()) {
      if (liveSessionKeys.has(sessionKeyHash)) continue;
      try {
        const record = this.read(sessionKeyHash);
        if (
          record.state === "disconnected"
          && !record.currentPlan
          && Date.parse(record.expiresAt) <= now.getTime()
        ) {
          this.removeSessionDirectory(sessionKeyHash);
          removed.push(sessionKeyHash);
        }
      } catch {
        // Invalid records are retained for diagnosis rather than deleted.
      }
    }
    return removed;
  }

  listExpiredRecords(
    now = new Date(),
    liveSessionKeys = new Set<string>(),
  ): Array<{ sessionKeyHash: string; record: SessionRecordV2 }> {
    return this.listSessionKeys().flatMap((sessionKeyHash) => {
      if (liveSessionKeys.has(sessionKeyHash)) return [];
      try {
        const record = this.read(sessionKeyHash);
        return record.state === "disconnected" && Date.parse(record.expiresAt) <= now.getTime()
          ? [{ sessionKeyHash, record }]
          : [];
      } catch {
        return [];
      }
    });
  }

  removeExpired(sessionKeyHash: string, now = new Date()): boolean {
    const record = this.read(sessionKeyHash);
    if (
      record.state !== "disconnected"
      || record.currentPlan
      || Date.parse(record.expiresAt) > now.getTime()
    ) {
      return false;
    }
    this.removeSessionDirectory(sessionKeyHash);
    return true;
  }

  removeReleasedExpired(sessionKeyHash: string): boolean {
    const record = this.read(sessionKeyHash);
    if (record.state !== "disconnected" || record.currentPlan) return false;
    this.removeSessionDirectory(sessionKeyHash);
    return true;
  }

  recordPath(sessionKeyHash: string): string {
    return path.join(this.sessionDirectory(sessionKeyHash), "session.json");
  }

  commandQueuePath(sessionKeyHash: string): string {
    return path.join(this.sessionDirectory(sessionKeyHash), "command.queue.json");
  }

  sessionDirectory(sessionKeyHash: string): string {
    assertSessionKeyHash(sessionKeyHash);
    return path.join(this.runtimeRoot, "sessions", sessionKeyHash);
  }

  private listSessionKeys(): string[] {
    const sessionsRoot = path.join(this.runtimeRoot, "sessions");
    if (!fs.existsSync(sessionsRoot)) return [];
    return fs.readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/i.test(entry.name))
      .map((entry) => entry.name);
  }

  private removeSessionDirectory(sessionKeyHash: string): void {
    const sessionsRoot = path.resolve(this.runtimeRoot, "sessions");
    const target = path.resolve(this.sessionDirectory(sessionKeyHash));
    if (path.dirname(target) !== sessionsRoot || target === this.runtimeRoot) {
      throw new ClawError("PLAN_TRANSITION_CONFLICT", "Refusing unsafe v2 session cleanup target.", {
        target,
        sessionsRoot,
      });
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export function ensurePrivateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    // Windows uses the current user's inherited ACL.
  }
}

export class RegistryFocusSessionStore implements FocusSessionStore {
  readonly registry: SessionRegistryV2;

  constructor(registry: SessionRegistryV2) {
    this.registry = registry;
  }

  read(sessionKeyHash: string): FocusSessionRecord {
    const record = this.registry.read(sessionKeyHash);
    return {
      schemaVersion: 1,
      sessionKeyHash,
      ...(record.currentPlan ? { currentPlan: record.currentPlan } : {}),
      updatedAt: record.updatedAt,
    };
  }

  buildPersistedRecord(sessionKeyHash: string, focus: FocusSessionRecord): unknown {
    const current = this.registry.read(sessionKeyHash);
    return {
      ...current,
      ...(focus.currentPlan ? { currentPlan: focus.currentPlan } : { currentPlan: undefined }),
      updatedAt: focus.updatedAt,
      expiresAt: new Date(Date.parse(focus.updatedAt) + SESSION_RECORD_TTL_MS).toISOString(),
    } satisfies SessionRecordV2;
  }

  writePersistedAtomic(sessionKeyHash: string, persistedRecord: unknown): void {
    this.registry.write(sessionKeyHash, persistedRecord as SessionRecordV2);
  }

  queuePath(sessionKeyHash: string): string {
    return this.registry.commandQueuePath(sessionKeyHash);
  }

  resourcePath(sessionKeyHash: string): string {
    return this.registry.recordPath(sessionKeyHash);
  }
}

function refreshRecord(
  record: SessionRecordV2,
  now: Date,
  options?: { state?: SessionRecordV2["state"]; preserveExpiry?: boolean },
): SessionRecordV2 {
  const updatedAt = now.toISOString();
  return {
    ...record,
    ...(options?.state ? { state: options.state } : {}),
    updatedAt,
    expiresAt: options?.preserveExpiry
      ? record.expiresAt
      : new Date(now.getTime() + SESSION_RECORD_TTL_MS).toISOString(),
  };
}

function assertSessionKeyHash(sessionKeyHash: string): void {
  if (!/^[a-f0-9]{64}$/i.test(sessionKeyHash)) {
    throw new ClawError("PLAN_TRANSITION_CONFLICT", "Invalid session key hash.");
  }
}
