import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDirectClawInvocation } from "./claw-session.js";
/** No message matching: retry permission must be explicit and pre-execution. */
export async function routeCommand(daemon, baseline) {
    let response;
    try {
        response = await daemon();
    }
    catch (error) {
        const failure = error;
        if (failure?.beforeSend === true && !["SESSION_IDENTITY_INVALID", "PROJECT_CONFIG_INVALID"].includes(failure.code ?? ""))
            return baseline();
        throw error;
    }
    if (!response.ok && response.error?.code === "SESSION_OPERATION_UNSUPPORTED" && response.error.outcome === "known") {
        return baseline();
    }
    return response;
}
export function resolveCommandEntry() {
    if (process.platform === "win32") {
        const entry = resolveDirectClawInvocation({ clawBinary: "claw", pathValue: process.env.PATH,
            nodeExecutable: process.execPath, exists: fs.existsSync });
        if (entry && fs.existsSync(path.join(path.dirname(entry.script), "command-entry.js")))
            return entry.script;
    }
    else {
        for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
            const candidate = path.join(directory, "claw");
            if (!fs.existsSync(candidate))
                continue;
            const script = fs.realpathSync(candidate);
            if (path.basename(script) === "bin.js" && fs.existsSync(path.join(path.dirname(script), "command-entry.js")))
                return script;
            break; // Do not silently switch installations after an unrecognized shim.
        }
    }
    // In a monorepo development checkout the CLI is built as a sibling package;
    // prefer the installed entry above, but never launch a shell shim just because
    // the globally installed CLI has not been upgraded yet.
    const local = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../cli/dist/bin.js");
    const repoManifest = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../package.json");
    const cliManifest = path.resolve(path.dirname(local), "../package.json");
    if (fs.existsSync(local) && fs.existsSync(path.join(path.dirname(local), "command-entry.js"))
        && fs.existsSync(repoManifest) && fs.existsSync(cliManifest)) {
        try {
            if (JSON.parse(fs.readFileSync(repoManifest, "utf8")).name === "claw-kit"
                && JSON.parse(fs.readFileSync(cliManifest, "utf8")).name === "@veewo/claw")
                return local;
        }
        catch { /* not a source checkout */ }
    }
    throw new Error("CLAW_BASELINE_UNAVAILABLE: installed CLI has no trusted structured command entry; update it before continuing.");
}
/** Values travel as JSON on stdin, never as shell text or user-controlled argv. */
export async function runCommandBaseline(subprocess, workdir, sessionId, operation, input, entry = resolveCommandEntry()) {
    const handle = subprocess.spawn({ argv: [process.execPath, entry, "internal-command"], cwd: workdir,
        env: { CLAW_SESSION_ID: sessionId }, stdio: { stdin: "pipe",
            stdout: { mode: "collect", maxBytes: 1048576 }, stderr: { mode: "collect", maxBytes: 131072 } }, graceMs: 10000 });
    let sent = false;
    let timer;
    try {
        if (!handle.stdin)
            throw new Error("structured command stdin is unavailable");
        const stdinFailure = new Promise((_, reject) => {
            handle.stdin.on?.("error", reject);
        });
        sent = true; // A failed write may have delivered a prefix; never retry it.
        handle.stdin.write(JSON.stringify({ operation, input }) + "\n");
        const outcome = await Promise.race([handle.done, stdinFailure, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("structured command timed out")), 30000);
            })]);
        const reader = handle.collected?.stdout;
        const read = reader?.readFrom?.(0);
        if (read?.lossy)
            throw new Error("structured command output was truncated");
        const text = read?.text ?? reader?.finalize().text ?? "";
        const response = JSON.parse(text);
        if (!response || typeof response.ok !== "boolean" || (response.ok &&
            (response.command !== operation || response.schemaVersion !== 1 || !Object.hasOwn(response, "output")))) {
            throw new Error("invalid structured command envelope");
        }
        const exitCode = outcome?.exitCode ?? outcome?.code;
        if (typeof exitCode !== "number" || outcome?.signal || (response.ok ? exitCode !== 0 : exitCode === 0)) {
            throw new Error("structured command exit did not match its envelope");
        }
        return response;
    }
    catch (error) {
        await handle.terminate("structured command failed").catch(() => undefined);
        throw new Error((sent ? "CLAW_OUTCOME_UNKNOWN: " : "CLAW_BASELINE_UNAVAILABLE: ") + String(error));
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
//# sourceMappingURL=command-route.js.map