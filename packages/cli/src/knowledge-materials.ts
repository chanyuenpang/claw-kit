import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  buildKnowledgeWriterAssignments, buildKnowledgeAssignmentTemplate, ensureInsideDir,
  resolveProjectContext, resolvePlanEffectiveConfig, resolveKnowledgeWriterForHost,
  resolveKnowledgeDocUpdateSnapshot, isSourceKnowledgeHost, serializeFailure,
  type PlanDocument,
} from "@veewo/claw-core";
import type { ReportCollectorDescriptor } from "./report-collector-registry.js";

/** Read source materials and project disposable workflow templates. No job or receipt is involved. */
export function readSourceKnowledgeMaterials(input: {
  cwd: string; host?: string; sourceSessionKey: string; sourcePlan: string;
}) {
  const project = resolveProjectContext(input.cwd);
  const planPath = ensureInsideDir(project.tasksDir, path.resolve(project.projectRoot, input.sourcePlan));
  if (!planPath) throw Object.assign(new Error("Source plan is outside this project."), { code: "KNOWLEDGE_SOURCE_OUTSIDE_PROJECT" });
  const sourcePlan = JSON.parse(fs.readFileSync(planPath, "utf8")) as PlanDocument;
  const rootPath = path.join(path.dirname(planPath), "plan.json");
  const rootPlan = rootPath === planPath ? sourcePlan : JSON.parse(fs.readFileSync(rootPath, "utf8")) as PlanDocument;
  // A cloned legacy file's birthtime is not a conversation boundary. Without a
  // recorded start, retain wider context rather than silently dropping evidence.
  const startedAt = rootPlan.createdAt ?? sourcePlan.createdAt;
  const endedAt = sourcePlan.completedAt ?? sourcePlan.updatedAt;
  const materialId = createHash("sha256").update(input.sourceSessionKey + "\0" + planPath + "\0" + endedAt).digest("hex").slice(0, 16);
  const directory = path.join(path.dirname(planPath), ".runtime", "knowledge-materials", materialId);
  fs.mkdirSync(directory, { recursive: true });
  const reportPath = path.join(directory, "conversation.jsonl");
  const assignmentsPath = path.join(directory, "assignments.json");
  const templatePath = path.join(directory, "writer.json");
  const config = resolvePlanEffectiveConfig(project.projectConfig, sourcePlan);
  const writer = resolveKnowledgeWriterForHost(config?.knowledgeWriter, input.host, project.projectConfig?.knowledgeWriterByHost);
  const assignments = buildKnowledgeWriterAssignments({ planPath, reportPath, writer, docUpdate: resolveKnowledgeDocUpdateSnapshot(project) });
  const template = buildKnowledgeAssignmentTemplate({ assignments, templateId: materialId, version: "1.0.0" });
  template.knowledgeCapture = false;
  fs.writeFileSync(assignmentsPath, JSON.stringify(template, null, 2) + "\n", "utf8");
  fs.writeFileSync(templatePath, JSON.stringify({
    id: "source-knowledge-writer", version: "1.0.0", knowledgeCapture: false,
    title: "Knowledge: " + sourcePlan.title, status: "process.active",
    goal: { text: "Maintain project knowledge supported by the source plan and available conversation." },
    tasks: [{ id: 1, title: "Maintain knowledge from the source plan", status: "pending",
      detail: "Create an ordinary subplan for this task using template_file " + JSON.stringify(assignmentsPath)
        + ". Complete its knowledge work, then finish this ordinary parent plan with the actual outcome." }],
    references: [{ path: planPath, why: "Complete source plan." }, { path: reportPath, why: "Available source conversation." }],
    rules: ["Preserve source materials and unrelated edits. Missing conversation is not proof of an empty conversation; use other evidence or report the gap."],
    retrospective: { summary: "" },
  }, null, 2) + "\n", "utf8");
  let conversationStatus: "available" | "host-owned" | "unavailable" = "host-owned";
  let diagnostic: ReturnType<typeof serializeFailure> | undefined;
  if (input.host !== "dsh") {
    const staging = reportPath + "." + randomUUID() + ".tmp";
    try {
      if (!isSourceKnowledgeHost(input.host)) throw Object.assign(new Error("Unsupported source history host."), { code: "KNOWLEDGE_MATERIALS_HOST_UNSUPPORTED" });
      const descriptor = JSON.parse(fs.readFileSync(path.join(project.clawDir, "runtime", "report-collectors", input.host + ".json"), "utf8")) as ReportCollectorDescriptor;
      const result = spawnSync(descriptor.executable, descriptor.args, { encoding: "utf8", windowsHide: true, timeout: 30_000,
        input: JSON.stringify({ host: input.host, sessionId: input.sourceSessionKey, projectRoot: project.projectRoot,
          planPath, startedAt, endedAt, stagingReportPath: staging }) });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        let failure: unknown = { code: "REPORT_COLLECTOR_FAILED", message: result.stderr.trim() || `Source conversation reader exited ${result.status}.` };
        for (const text of [result.stderr, result.stdout].flatMap(value => [value, ...value.split(/\r?\n/)])) {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.error?.code) { failure = parsed.error; break; }
            if (parsed?.code) { failure = parsed; break; }
          } catch { /* Plain diagnostics remain visible through the safe serializer. */ }
        }
        throw failure;
      }
      fs.renameSync(staging, reportPath);
      conversationStatus = "available";
    } catch (error) {
      conversationStatus = "unavailable";
      diagnostic = serializeFailure(error, { fallbackCode: "REPORT_COLLECTOR_UNAVAILABLE", operation: "knowledge.materials", origin: input.host });
    } finally { try { fs.rmSync(staging, { force: true }); } catch { /* Do not mask the source reader result with disposable cleanup. */ } }
  }
  return { ok: true, command: "knowledge.materials", sourceSessionKey: input.sourceSessionKey,
    sourcePlanPath: planPath, sourcePlan, startedAt, endedAt, reportPath, templatePath, assignmentsPath,
    conversationStatus, ...(diagnostic ? { diagnostic } : {}) };
}
