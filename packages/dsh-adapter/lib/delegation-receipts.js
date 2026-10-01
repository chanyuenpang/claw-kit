import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
const LOCK_TIMEOUT_MS = 2000;
const TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const errorCode = (error) => error?.code;
const lockSharingError = (error) => ["EPERM", "EACCES"].includes(errorCode(error) ?? "");
const invalid = (message) => new Error("DSH_DELEGATION_RECEIPT_INVALID: " + message);
function receiptId(id) {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/i.test(id))
        throw invalid("invocation id must be 64 hexadecimal characters");
    return id.toLowerCase();
}
function assertJson(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return;
    if (typeof value === "number" && Number.isFinite(value))
        return;
    if (!value || typeof value !== "object" || seen.has(value))
        throw invalid("payload must be lossless JSON");
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        throw invalid("payload must contain plain JSON objects");
    if (Object.getOwnPropertySymbols(value).length)
        throw invalid("symbol keys are not JSON");
    seen.add(value);
    for (const item of Array.isArray(value) ? value : Object.values(value))
        assertJson(item, seen);
    seen.delete(value);
}
function assertPayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw invalid("receipt payload must be an object");
    assertJson(value);
}
async function noSymlinkAncestors(target) {
    let current = path.resolve(target);
    for (;;) {
        try {
            if ((await fs.lstat(current)).isSymbolicLink())
                throw invalid("symlink path is not permitted");
        }
        catch (error) {
            if (errorCode(error) !== "ENOENT")
                throw error;
        }
        const parent = path.dirname(current);
        if (parent === current)
            return;
        current = parent;
    }
}
async function privateDirectory(target) {
    await noSymlinkAncestors(target);
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    await noSymlinkAncestors(target);
    if (!(await fs.lstat(target)).isDirectory())
        throw invalid("receipt directory is not a directory");
    if (process.platform !== "win32")
        await fs.chmod(target, 0o700);
}
async function readRegularJson(file) {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile())
        throw invalid("receipt or lock owner is not a regular file");
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
        return JSON.parse(await handle.readFile("utf8"));
    }
    catch (error) {
        if (error instanceof SyntaxError)
            throw invalid("malformed JSON");
        throw error;
    }
    finally {
        await handle.close();
    }
}
function ownerAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        if (errorCode(error) === "ESRCH")
            return false;
        if (errorCode(error) === "EPERM")
            return true; // Unknown/forbidden is not proof of death.
        throw error;
    }
}
async function removeEmptyLock(lockDir) {
    try {
        await fs.rmdir(lockDir);
    }
    catch (error) {
        if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(errorCode(error) ?? ""))
            throw error;
    }
}
async function inspectLock(lockDir) {
    try {
        const stat = await fs.lstat(lockDir);
        if (stat.isSymbolicLink() || !stat.isDirectory())
            throw invalid("lock is not a plain directory");
        const files = await fs.readdir(lockDir);
        if (!files.length) {
            await removeEmptyLock(lockDir);
            return undefined;
        }
        if (files.length !== 1 || !files[0].endsWith(".json"))
            throw invalid("corrupted process lock");
        const token = files[0].slice(0, -5);
        const owner = await readRegularJson(path.join(lockDir, files[0]));
        if (!TOKEN.test(token) || !owner || owner.schemaVersion !== 1 || owner.token !== token
            || !Number.isSafeInteger(owner.pid) || owner.pid <= 0
            || Object.keys(owner).sort().join(",") !== "pid,schemaVersion,token")
            throw invalid("corrupted process lock owner");
        return { owner, file: path.join(lockDir, files[0]) };
    }
    catch (error) {
        if (errorCode(error) === "ENOENT")
            return undefined;
        throw error;
    }
}
async function acquire(lockParent, scope) {
    const lockDir = path.join(lockParent, scope);
    const candidate = await fs.mkdtemp(path.join(lockParent, ".acquire-" + scope + "-"));
    const owner = { schemaVersion: 1, pid: process.pid, token: randomUUID() };
    const filename = owner.token + ".json";
    const candidateOwner = path.join(candidate, filename);
    try {
        const handle = await fs.open(candidateOwner, "wx", 0o600);
        try {
            await handle.writeFile(JSON.stringify(owner));
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        const deadline = performance.now() + LOCK_TIMEOUT_MS;
        for (;;) {
            try {
                await fs.rename(candidate, lockDir);
                break;
            }
            catch (error) {
                if (!["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(errorCode(error) ?? ""))
                    throw error;
                try {
                    const held = await inspectLock(lockDir);
                    if (held && !ownerAlive(held.owner.pid)) {
                        // Only the winner unlinking this exact unique token may remove its empty directory.
                        // A newly acquired directory is already nonempty, so rmdir cannot remove it.
                        try {
                            await fs.unlink(held.file);
                            await removeEmptyLock(lockDir);
                        }
                        catch (cleanupError) {
                            // Losing cleanup never rmdirs; use only the existing bounded retry loop.
                            if (errorCode(cleanupError) !== "ENOENT" && !lockSharingError(cleanupError))
                                throw cleanupError;
                        }
                    }
                }
                catch (observationError) {
                    // Windows may deny opening a token while its owner is removing it.
                    // Unreadable is UNKNOWN, never evidence of absence or owner death.
                    if (!lockSharingError(observationError))
                        throw observationError;
                }
                if (performance.now() >= deadline)
                    throw new Error("DSH_DELEGATION_RECEIPT_LOCK_BUSY: parent transaction did not finish");
                await delay(20);
            }
        }
        return async () => {
            const releaseDeadline = performance.now() + LOCK_TIMEOUT_MS;
            let unlinked = false;
            for (;;) {
                try {
                    if (!unlinked) {
                        const held = await inspectLock(lockDir);
                        if (!held || held.owner.pid !== owner.pid || held.owner.token !== owner.token)
                            throw invalid("transaction lost lock ownership");
                        await fs.unlink(held.file); // Actual pid/token proof is required before every unlink attempt.
                        unlinked = true;
                    }
                    await removeEmptyLock(lockDir); // Never touch a newly acquired nonempty lock.
                    return;
                }
                catch (releaseError) {
                    if (!lockSharingError(releaseError))
                        throw releaseError;
                    if (performance.now() >= releaseDeadline)
                        throw new Error("DSH_DELEGATION_RECEIPT_LOCK_BUSY: cannot release owned process lock", { cause: releaseError });
                    await delay(20);
                }
            }
        };
    }
    finally {
        // Unique unshared acquisition staging only; never recursively remove the shared lock.
        try {
            await fs.unlink(candidateOwner);
        }
        catch (error) {
            if (errorCode(error) !== "ENOENT")
                throw error;
        }
        try {
            await fs.rmdir(candidate);
        }
        catch (error) {
            if (errorCode(error) !== "ENOENT")
                throw error;
        }
    }
}
/** Private per-invocation receipts, not a role database or canonical claw state.
 * The callback is a short IO transaction: NEVER perform SDK/CLI/network work inside it.
 * Each put is atomic; this lock does not promise multi-record rollback on callback failure. */
export class DelegationReceiptStore {
    root;
    constructor(root = path.join(os.homedir(), ".claw", "runtime", "adapters", "dsh", "delegation")) {
        if (typeof root !== "string" || !root.trim())
            throw invalid("trusted store root is required");
        this.root = path.resolve(root); // No filesystem IO until withParent is used.
    }
    async withParent(parentId, workdir, callback) {
        if (typeof parentId !== "string" || !parentId.trim() || typeof workdir !== "string" || !path.isAbsolute(workdir))
            throw invalid("actual parent and absolute workspace are required");
        const real = path.normalize(await fs.realpath(workdir));
        if (!(await fs.stat(real)).isDirectory())
            throw invalid("workspace must be a directory");
        const normalized = process.platform === "win32" ? real.toLowerCase() : real;
        const scope = createHash("sha256").update(JSON.stringify([normalized, parentId])).digest("hex");
        await privateDirectory(this.root);
        const directory = path.join(this.root, scope), lockParent = path.join(this.root, ".locks");
        await privateDirectory(directory);
        await privateDirectory(lockParent);
        const unlock = await acquire(lockParent, scope);
        let active = true;
        const pending = new Set();
        const io = (action) => {
            if (!active)
                return Promise.reject(invalid("transaction is closed"));
            const operation = action();
            pending.add(operation);
            void operation.then(() => pending.delete(operation), () => pending.delete(operation));
            return operation;
        };
        const read = async (id) => {
            const file = path.join(directory, id + ".json");
            await noSymlinkAncestors(file);
            let value;
            try {
                value = await readRegularJson(file);
            }
            catch (error) {
                if (errorCode(error) === "ENOENT")
                    return undefined;
                throw error;
            }
            if (!value || value.schemaVersion !== 1 || value.parentId !== parentId || value.workdir !== normalized || value.id !== id
                || Object.keys(value).sort().join(",") !== "id,parentId,payload,schemaVersion,workdir")
                throw invalid("foreign or malformed receipt envelope");
            assertPayload(value.payload);
            return value;
        };
        const tx = {
            get: (id) => io(async () => (await read(receiptId(id)))?.payload),
            list: () => io(async () => {
                const result = [];
                for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
                    if (entry.isSymbolicLink() || !entry.isFile())
                        throw invalid("unexpected receipt directory entry");
                    if (/^\.[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(entry.name))
                        continue; // An interrupted atomic write is not a receipt.
                    if (!/^[a-f0-9]{64}\.json$/.test(entry.name))
                        throw invalid("malformed receipt filename");
                    const record = await read(entry.name.slice(0, -5));
                    if (!record)
                        throw invalid("receipt disappeared during transaction");
                    result.push(record.payload);
                }
                return result;
            }),
            put: (id, payload) => io(async () => {
                id = receiptId(id);
                assertPayload(payload);
                const serialized = JSON.stringify({ schemaVersion: 1, parentId, workdir: normalized, id, payload }) + "\n";
                await read(id); // Validate an existing owner; never silently repair another envelope.
                const file = path.join(directory, id + ".json"), temporary = path.join(directory, "." + id + "." + randomUUID() + ".tmp");
                try {
                    const handle = await fs.open(temporary, "wx", 0o600);
                    try {
                        await handle.writeFile(serialized);
                        await handle.sync();
                    }
                    finally {
                        await handle.close();
                    }
                    await noSymlinkAncestors(file);
                    await fs.rename(temporary, file);
                }
                finally {
                    try {
                        await fs.unlink(temporary);
                    }
                    catch (error) {
                        if (errorCode(error) !== "ENOENT")
                            throw error;
                    }
                }
            }),
        };
        try {
            return await callback(tx);
        }
        finally {
            active = false;
            await Promise.allSettled([...pending]);
            await unlock();
        }
    }
}
//# sourceMappingURL=delegation-receipts.js.map