// DSH daemon-channel E2E probe (independent of the Host adapter).
// Spawns `claw session open <workdir> <sessionId> --host dsh` directly and
// drives the JSONL protocol, exercising the full matrix:
//   plan.create -> plan.start -> task.done -> plan.done (knowledgeDispatch)
//   -> job host='dsh' -> claim dsh branch (simulated capture) -> search.
// Usage: node scripts/probe-dsh-daemon-e2e.mjs [--keep]

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLAW_BIN = "claw";
const WORKDIR = "D:\\Users\\chany\\Documents\\claw-kit";
const SESSION_ID = `probe-matrix-${Date.now()}`;
const PLAN_TITLE = `DSH matrix probe ${Date.now()}`;
const KEEP = process.argv.includes("--keep");

const captureRoot = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "claw", "dsh-capture");
const capturePath = path.join(captureRoot, `${SESSION_ID}.json`);

function spawnClaw(argv) {
  const cmd = process.platform === "win32"
    ? { file: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `${CLAW_BIN}.cmd`, ...argv] }
    : { file: CLAW_BIN, args: argv };
  return spawn(cmd.file, cmd.args, { cwd: WORKDIR, env: { ...process.env, CLAW_SESSION_ID: SESSION_ID }, stdio: ["pipe", "pipe", "pipe"] });
}

class ProbeSession {
  constructor() {
    this.buffer = "";
    this.pending = [];
    this.child = null;
  }
  open() {
    return new Promise((resolve, reject) => {
      const child = spawnClaw(["session", "open", WORKDIR, SESSION_ID, "--host", "dsh"]);
      this.child = child;
      let stderr = "";
      child.stderr.on("data", (c) => { stderr += String(c); });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => this.ingest(String(chunk)));
      const timer = setTimeout(() => {
        reject(new Error(`open timeout; stderr: ${stderr.slice(0, 2000)}`));
      }, 20000);
      this.pending.push({ resolve: (v) => { clearTimeout(timer); resolve(v); }, reject });
      child.on("error", (err) => reject(err));
    });
  }
  ingest(chunk) {
    this.buffer += chunk;
    while (true) {
      const nl = this.buffer.indexOf("\n");
      if (nl < 0) return;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      const entry = this.pending.shift();
      if (!entry) { console.log("  [probe:unexpected]", line.slice(0, 500)); continue; }
      try { entry.resolve(JSON.parse(line)); } catch (e) { entry.reject(e); }
    }
  }
  request(operation, input) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`request timeout: ${operation}`)), 45000);
      this.pending.push({ resolve: (v) => { clearTimeout(timer); resolve(v); }, reject });
      this.child.stdin.write(`${JSON.stringify({ operation, input })}\n`);
    });
  }
  close() {
    return this.request("session.close", {}).catch(() => undefined);
  }
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`probe session: ${SESSION_ID}`);
  const session = new ProbeSession();
  try {
    const open = await session.open();
    record("session.open (host=dsh)", open.ok === true, JSON.stringify(open.session ?? {}).slice(0, 200));

    // 1. plan.create
    const created = await session.request("plan.create", {
      title: PLAN_TITLE,
      goalText: "verify the full dsh daemon channel: plan lifecycle, knowledge job host, claim dsh branch, search recall",
    });
    const createdOut = created.output ?? {};
    record("plan.create", created.ok === true && (createdOut.planStatus === "process.active" || createdOut.activeWorkflow?.planStatus === "process.active" || createdOut.taskName !== undefined),
      `output=${JSON.stringify(Object.keys(createdOut)).slice(0, 200)}`);

    // 2. plan.start with tasks
    const started = await session.request("plan.start", {
      updates: { requirementsSummary: "probe requirements", acceptanceCriteria: ["matrix verified"] },
      appendTasks: [
        { title: "T1 probe task", detail: "probe detail" },
        { title: "T2 second task", detail: "second detail" },
      ],
    });
    const startedOut = started.output ?? {};
    const appended = startedOut.appendedTaskIds ?? [];
    record("plan.start (2 tasks)", started.ok === true && appended.length >= 2,
      `appended=[${appended.join(",")}] status=${startedOut.planStatus ?? "?"}`);
    const t1Id = appended[0] ?? 1;

    // 3. task.done on T1 (conclusion evidence marker)
    const done1 = await session.request("task.done", { tasks: [{ id: t1Id }] });
    record("task.done T1", done1.ok === true, `emitted=${JSON.stringify(done1.output?.emittedEvents ?? done1.output ?? {}).slice(0, 120)}`);

    // 4. plan.done -> knowledgeDispatch
    const done = await session.request("plan.done", {
      retrospectiveSummary: "probe retrospective: daemon channel verified end to end",
      keyDecisions: ["use daemon channel for dsh"],
    });
    const dispatch = done.knowledgeDispatch;
    record("plan.done returns knowledgeDispatch",
      done.ok === true && dispatch !== undefined && dispatch.schemaVersion === 1,
      JSON.stringify(dispatch ?? done.output ?? {}).slice(0, 300));
    const finalizeId = dispatch?.finalizeId;

    // 5. locate the knowledge job and assert host='dsh'
    const planPath = done.output?.activeWorkflow?.planPath
      ?? done.output?.planPath
      ?? done.output?.completedPlan?.planPath;
    let jobPath = null;
    if (planPath) {
      const jobDir = path.join(path.dirname(planPath), ".runtime", "knowledge-finalization");
      if (fs.existsSync(jobDir)) {
        const jobs = fs.readdirSync(jobDir).filter((f) => f.endsWith(".json"));
        // Prefer the exact finalizeId file (old runs leave other jobs behind).
        if (finalizeId && jobs.includes(`${finalizeId}.json`)) {
          jobPath = path.join(jobDir, `${finalizeId}.json`);
        } else if (jobs.length) {
          jobPath = path.join(jobDir, jobs[jobs.length - 1]);
        }
      }
    }
    if (!jobPath && finalizeId) {
      // fall back to scanning the project tasks tree
      const clawDir = path.join(WORKDIR, ".claw");
      const scan = (dir) => {
        if (!fs.existsSync(dir)) return null;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "knowledge-finalization") {
              const jobs = fs.readdirSync(full).filter((f) => f.endsWith(".json"));
              if (jobs.length) return path.join(full, jobs[jobs.length - 1]);
            }
            const found = scan(full);
            if (found) return found;
          }
        }
        return null;
      };
      jobPath = scan(clawDir);
    }
    if (jobPath) {
      const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
      record("knowledge job host='dsh'", job.host === "dsh", `host=${JSON.stringify(job.host)} finalizeId=${job.finalizeId}`);
      record("knowledge job reportCapture.mode='claim'", job.reportCapture?.mode === "claim", JSON.stringify(job.reportCapture ?? {}).slice(0, 200));
      record("knowledge job reportCapture.startedAt set", typeof job.reportCapture?.startedAt === "string", job.reportCapture?.startedAt ?? "missing");

      // 6. simulate the adapter-written capture file (what Host-side plan.done writes)
      const startedAtMs = Date.parse(job.reportCapture?.startedAt ?? "1970-01-01");
      const capture = {
        sessionId: SESSION_ID,
        turnId: "plan.done",
        message: "probe final message for plan window",
        taskConclusions: [
          { turnId: "3", message: "OLD conclusion before window", time: startedAtMs - 60000 },
          { turnId: "4", message: "T1 conclusion inside window: task T1 verified", time: startedAtMs + 1000 },
          { turnId: "5", message: "final plan conclusion: full matrix verified", time: startedAtMs + 5000 },
        ],
      };
      fs.mkdirSync(captureRoot, { recursive: true });
      fs.writeFileSync(capturePath, JSON.stringify(capture, null, 2));
      record("simulated capture written", fs.existsSync(capturePath), capturePath);

      // 7. claim through the CLI dsh branch with a null/absent host override:
      //    run the claim subprocess in the project so project config resolves.
      const claim = await runCli(["knowledge", "claim", "--job", jobPath], true);
      const claimed = claim.parsed;
      const okClaim = claim.code === 0 && claimed?.ok === true && typeof claimed?.claimToken === "string";
      record("knowledge claim (dsh branch)", okClaim,
        `token=${claimed?.claimToken ? "yes" : "no"} reportCapture=${JSON.stringify(claimed?.reportCapture ?? {}).slice(0, 200)}`);

      // 8. assert startedAt window filter: only the two in-window conclusions
      const reportPath = job.reportPath ?? planPath?.replace(/\.json$/i, ".report");
      if (reportPath && fs.existsSync(reportPath)) {
        // report is JSONL: one object per line
        const lines = fs.readFileSync(reportPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
        const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const captured = entries.filter((e) => e.entryType === "task_conclusion");
        record("claim startedAt window filter (2 in-window)",
          captured.length === 2 && !captured.some((e) => e.message.includes("OLD")),
          `captured=${captured.length} messages=[${captured.map((e) => e.message).join(" | ")}]`);
      } else {
        record("claim startedAt window filter (2 in-window)", false, `report missing: ${reportPath}`);
      }

      // 9. knowledge done (writer completion) then search recall
      const claimToken = claimed?.claimToken;
      if (claimToken) {
        const fin = await runCli(["knowledge", "done", "--job", jobPath, "--claim-token", claimToken, "--status", "succeeded", "--result", "probe writer result: matrix verified"], true);
        record("knowledge done (succeeded)", fin.code === 0 && fin.parsed?.ok === true, JSON.stringify(fin.parsed ?? {}).slice(0, 150));
      } else {
        record("knowledge done (succeeded)", false, "no claim token");
      }
    } else {
      record("knowledge job host='dsh'", false, "job file not located");
    }

    // 10. search recall through the daemon channel
    const search = await session.request("search", { query: "daemon channel verified end to end" });
    record("search (daemon channel)", search.ok === true, `matches=${search.output?.results?.length ?? search.output?.count ?? "?"}`);
  } finally {
    if (!KEEP) await session.close();
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n== ${pass}/${results.length} probes passed (session ${SESSION_ID}) ==`);
  console.log(`capture file: ${capturePath}`);
  if (pass < results.length) process.exitCode = 1;
}

function runCli(args, json) {
  return new Promise((resolve) => {
    const child = spawnClaw(args);
    let out = "", err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { err += c; });
    child.on("close", (code) => {
      let parsed = null;
      if (json) {
        // Accept pretty-printed multi-line JSON: take the first `{` to the last `}`.
        const start = out.indexOf("{");
        const end = out.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try { parsed = JSON.parse(out.slice(start, end + 1)); } catch { parsed = null; }
        }
      }
      resolve({ code, out, err, parsed });
    });
    child.on("error", (e) => resolve({ code: -1, out, err: String(e), parsed: null }));
  });
}

main().catch((error) => {
  console.error("probe crashed:", error);
  process.exitCode = 1;
}).finally(() => {
  // The daemon child may linger after session.close; force-exit so the probe
  // never hangs the runner.
  setTimeout(() => process.exit(process.exitCode ?? 0), 500);
});
