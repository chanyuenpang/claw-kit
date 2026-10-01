import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  captureDshKnowledgeReport, findKnowledgeFinalizationJobPath, resolveProjectContext,
} from "@veewo/claw-core";

/** The desktop Host sends only adapter-proven final events over private CLI stdin. */
export function publishDshHostReport(input: {
  cwd: string;
  parentSessionId: string;
  finalizeId: string;
  collectorVersion: string;
  events: unknown;
}): { captured: boolean; receipt: ReturnType<typeof captureDshKnowledgeReport> } {
  if (!/^[a-f0-9]{64}$/i.test(input.finalizeId) || !input.parentSessionId.trim()
    || !input.collectorVersion.trim() || !Array.isArray(input.events)) {
    throw new Error("DSH_REPORT_CAPTURE_INVALID: invalid host capture request.");
  }
  const events = input.events.map((event: unknown) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("DSH_REPORT_CAPTURE_INVALID: invalid final event.");
    }
    const entry = event as Record<string, unknown>;
    if (entry.schemaVersion !== 1 || entry.entryType !== "final_answer"
      || typeof entry.turnId !== "string" || typeof entry.message !== "string" || !entry.message.trim()
      || (entry.occurredAt !== undefined && (typeof entry.occurredAt !== "string" || !Number.isFinite(Date.parse(entry.occurredAt))))) {
      throw new Error("DSH_REPORT_CAPTURE_INVALID: unproven final event.");
    }
    return {
      schemaVersion: 1 as const, entryType: "final_answer" as const,
      turnId: entry.turnId, ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
      message: entry.message,
    };
  });
  const project = resolveProjectContext(input.cwd);
  if (project.scope !== "project") throw new Error("DSH_REPORT_CAPTURE_INVALID: project required.");
  const jobPath = findKnowledgeFinalizationJobPath(project, input.finalizeId);
  if (!jobPath) throw new Error("DSH_REPORT_CAPTURE_UNAVAILABLE: canonical job not found.");
  const receipt = captureDshKnowledgeReport({ jobPath, parentSessionId: input.parentSessionId, publish: (job) => {
    if (path.resolve(job.projectRoot) !== path.resolve(project.projectRoot)) {
      throw new Error("DSH_REPORT_CAPTURE_DENIED: project mismatch.");
    }
    const reportPath = path.resolve(job.reportPath);
    if (path.dirname(reportPath) !== path.dirname(path.resolve(job.planPath))) {
      throw new Error("DSH_REPORT_CAPTURE_DENIED: report is outside its plan.");
    }
    // Preserve task conclusions and retry after a crash between report publish and job receipt.
    const existing = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
    const known = new Set(existing.split(/\r?\n/).filter(Boolean));
    const additions = events.map((event) => JSON.stringify(event)).filter((line) => !known.has(line));
    const merged = existing + (existing && !existing.endsWith("\n") && additions.length ? "\n" : "")
      + (additions.length ? additions.join("\n") + "\n" : "");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const staging = path.join(path.dirname(reportPath), "." + path.basename(reportPath) + "." + randomUUID() + ".tmp");
    try {
      fs.writeFileSync(staging, merged, { encoding: "utf8", flag: "wx" });
      fs.renameSync(staging, reportPath);
    } finally {
      fs.rmSync(staging, { force: true });
    }
    const payload = Buffer.from(merged, "utf8");
    const receipt = {
      contractVersion: 1 as const, captureId: randomUUID(), host: "dsh" as const,
      sessionId: input.parentSessionId, payloadBytes: payload.byteLength,
      payloadSha256: createHash("sha256").update(payload).digest("hex"),
      collectorVersion: input.collectorVersion, completedAt: new Date().toISOString(),
    };
    return receipt;
  } });
  return { captured: true, receipt };
}
