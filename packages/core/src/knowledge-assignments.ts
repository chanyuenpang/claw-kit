import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeFinalizationJob } from "./knowledge-sidecar.js";
import type { PlanTemplateDocument } from "./templates/plans/default.js";
import type { KnowledgeWriterConfig } from "./types.js";

export type KnowledgeWriterAssignment = {
  index: number;
  kind: "builtin" | "external_skill" | "doc_updater";
  skill?: string;
  promptVersion: 1;
  prompt: string;
};

export type DirectKnowledgeAssignment = KnowledgeWriterAssignment & {
  contractPath?: string;
  formatPath?: string;
  datedSectionsToKeep?: number;
};

export type KnowledgeFinalizationTask = {
  schemaVersion: 1;
  kind: "knowledge.finalize";
  /** Supplied by the current adapter; this is routing information, not a claim credential. */
  host: "codex" | "dsh" | "cindy" | "opencode";
  finalizeId: string;
  projectRoot: string;
  writer?: KnowledgeWriterConfig | null;
};

export type KnowledgeDelegateDispatch = KnowledgeFinalizationTask & {
  preferReuse: boolean;
  leadInstruction?: string;
  model?: string;
  reasoningEffort?: NonNullable<KnowledgeWriterConfig["reasoningEffort"]>;
  prompt: string;
};

/** Domain task only. Adapters own executable instructions and transport identity. */
export function buildKnowledgeFinalizationTask(
  input: Omit<KnowledgeFinalizationTask, "schemaVersion" | "kind">,
): KnowledgeFinalizationTask {
  return { schemaVersion: 1, kind: "knowledge.finalize", ...input, projectRoot: path.resolve(input.projectRoot) };
}

export const KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION = [
  "Required, non-skippable closeout: hand off this knowledge-finalization job through the current Host's designated route now.",
  "Do not skip it for any reason, including an apparently empty result, plan completion, unavailable-looking collaboration tools, missing permission, or a final reply.",
  "Pass prompt unchanged when the Host requires Lead dispatch; if the Host dispatches automatically, do not duplicate it.",
  "After the handoff is accepted or automatically owned, immediately end the Lead turn and do not wait for or poll the worker.",
].join(" ");

export function knowledgeDelegateTemplatePath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "resources", "delegate-writer", "TEMPLATE.json");
}

export function cindyKnowledgeDelegateTemplatePath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "resources", "cindy-delegate-writer", "TEMPLATE.json");
}

export function dshKnowledgeDelegateTemplatePath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "resources", "dsh-delegate-writer", "TEMPLATE.json");
}

export function buildKnowledgeWriterAssignments(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath" | "writer" | "docUpdate">,
): KnowledgeWriterAssignment[] {
  const configured = job.writer?.externalSkills?.map((skill) => skill.trim()).filter(Boolean) ?? [];
  const assignments: KnowledgeWriterAssignment[] = configured.length === 0
    ? [{
      index: 0,
      kind: "builtin",
      promptVersion: 1,
      prompt: buildBuiltinKnowledgePrompt(job),
    }]
    : configured.map((skill, index) => ({
      index,
      kind: "external_skill",
      skill,
      promptVersion: 1,
      prompt: buildExternalSkillPrompt(job, skill),
    }));
  if (job.docUpdate) {
    assignments.push({
      index: assignments.length,
      kind: "doc_updater",
      promptVersion: 1,
      prompt: buildDocUpdaterPrompt(job),
    });
  }
  return assignments;
}

/** Builds the same configured assignment order for an explicit same-agent capture. */
export function buildDirectKnowledgeAssignments(input: {
  writer?: KnowledgeWriterConfig;
  docUpdate?: { externalDocPaths: string[] };
}): DirectKnowledgeAssignment[] {
  const configured = input.writer?.externalSkills?.map((skill) => skill.trim()).filter(Boolean) ?? [];
  const contractRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "resources", "knowledge-writer");
  const assignments: DirectKnowledgeAssignment[] = configured.length === 0
    ? [{
      index: 0,
      kind: "builtin",
      promptVersion: 1,
      prompt: buildDirectBuiltinKnowledgePrompt(input.writer),
      contractPath: path.join(contractRoot, "non-claw-fallback.md"),
      formatPath: path.join(contractRoot, "knowledge-format.md"),
      datedSectionsToKeep: input.writer?.datedSectionsToKeep ?? 6,
    }]
    : configured.map((skill, index) => ({
      index,
      kind: "external_skill" as const,
      skill,
      promptVersion: 1,
      prompt: buildDirectExternalSkillPrompt(skill),
    }));
  if (input.docUpdate) {
    assignments.push({
      index: assignments.length,
      kind: "doc_updater",
      promptVersion: 1,
      prompt: buildDirectDocUpdaterPrompt(input.docUpdate.externalDocPaths),
      contractPath: path.join(path.dirname(fileURLToPath(import.meta.url)), "resources", "doc-updater", "FALLBACK.md"),
    });
  }
  return assignments;
}

export function buildKnowledgeAssignmentTemplate(input: {
  assignments: KnowledgeWriterAssignment[];
  finalizeId: string;
  version: string;
}): PlanTemplateDocument {
  if (
    input.assignments[0]?.kind === "builtin"
    && input.assignments.slice(1).every((assignment) => assignment.kind === "doc_updater")
  ) {
    return buildBuiltinKnowledgeTemplate(input);
  }
  return {
    id: `knowledge-assignments-${input.finalizeId.slice(0, 12)}`,
    version: input.version,
    title: "knowledge-writer assignments",
    status: "process.active",
    goal: {
      text: "Execute every claimed knowledge-writer assignment sequentially.",
    },
    requirements: {
      summary: "Execute the immutable assignments returned by knowledge claim without interaction or delegation.",
      openQuestions: [],
      acceptanceCriteria: [
        "Assignments run sequentially in their configured order.",
        "Every assignment satisfies its supplied scope and outcome contract.",
        "No assignment launches another finalizer or writer agent.",
      ],
    },
    tasks: input.assignments.map((assignment) => ({
      id: assignment.index + 1,
      title: assignment.kind === "builtin"
        ? "Execute built-in knowledge governance"
        : assignment.kind === "doc_updater"
          ? "Update existing external documentation"
          : `Execute ${assignment.skill}`,
      detail: assignment.prompt,
      status: "pending",
    })),
    references: [],
    rules: [
      "Run assignments sequentially; later assignments may depend on earlier documentation changes.",
      "Do not invoke a background finalizer, collaboration subagent, or other writer proxy.",
    ],
    keyDecisions: [],
    retrospective: {
      summary: "",
    },
  };
}

function buildBuiltinKnowledgeTemplate(input: {
  assignments: KnowledgeWriterAssignment[];
  finalizeId: string;
  version: string;
}): PlanTemplateDocument {
  const contractRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "resources",
    "knowledge-writer",
  );
  const source = JSON.parse(
    fs.readFileSync(path.join(contractRoot, "TEMPLATE.json"), "utf-8"),
  ) as PlanTemplateDocument;
  const template = structuredClone(source);
  template.id = `knowledge-assignments-${input.finalizeId.slice(0, 12)}`;
  template.version = input.version;
  template.title = "built-in knowledge governance";
  template.status = "process.active";
  const firstTask = template.tasks[0];
  if (firstTask) {
    firstTask.detail = `${input.assignments[0]!.prompt}\n\n${firstTask.detail ?? ""}`.trim();
  }
  template.references = (template.references ?? []).map((reference) => ({
    ...reference,
    path: path.join(contractRoot, path.basename(reference.path)),
  }));
  const docAssignment = input.assignments.find((assignment) => assignment.kind === "doc_updater");
  if (docAssignment) {
    const reviewTask = template.tasks.at(-1);
    if (!reviewTask) throw new Error("Built-in knowledge template is missing its verification outcome.");
    reviewTask.detail = (reviewTask.detail ?? "") + " Include affected external documentation in this consistency review.";
    template.tasks.splice(template.tasks.length - 1, 0, {
      id: 0, title: "Update affected external documentation", detail: docAssignment.prompt, status: "pending",
    });
    // Position expresses the linear outcome order. Do not couple the builder to
    // historical micro-task IDs or remap nextTaskId graphs by hand.
    template.tasks = template.tasks.map((task, index) => ({ ...task, id: index + 1 }));
  }
  return template;
}

function buildBuiltinKnowledgePrompt(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath" | "writer">,
): string {
  return [
    "Execute the built-in knowledge-governance contract supplied by claw-kit.",
    "Maintain coherent canonical Truth and ADR from conclusion-bearing evidence; choose and revisit the investigation, editing and review method as needed.",
    `For every canonical document changed by this pass, keep at most ${job.writer?.datedSectionsToKeep ?? 6} complete evolution sections marked by \`<!-- dated: YYYY-MM-DD -->\`; do not truncate current prose or untouched documents.`,
    commonMaterialPrompt(job),
  ].join("\n");
}

function buildDirectBuiltinKnowledgePrompt(writer?: KnowledgeWriterConfig): string {
  return [
    "Execute the built-in knowledge-governance contract supplied by claw-kit for an explicit manual knowledge capture.",
    "Use only conclusion-bearing content already present in the current agent memory before this invocation.",
    "Do not read or create a report, transcript, plan, subplan, finalization job, or delegation.",
    `For every canonical document changed by this pass, keep at most ${writer?.datedSectionsToKeep ?? 6} complete evolution sections marked by \`<!-- dated: YYYY-MM-DD -->\`; do not truncate current prose or untouched documents.`,
    "Maintain coherent canonical Truth and ADR. Treat this instruction as manual and same-agent only.",
  ].join("\n");
}

function buildDirectExternalSkillPrompt(skill: string): string {
  return [
    `Invoke the ${skill} skill for this explicit manual knowledge capture.`,
    "Use only conclusion-bearing content already present in the current agent memory before this invocation.",
    "Run in the current agent only: do not read or create a report, transcript, plan, subplan, job, background worker, or collaboration subagent.",
    "Run unattended and non-interactively. If a change is ambiguous or unsafe, skip it and report the reason.",
  ].join("\n");
}

function buildDirectDocUpdaterPrompt(externalDocPaths: string[]): string {
  return [
    "Use the supplied doc-updater fallback for this dependent manual knowledge-capture stage.",
    "Use only the current agent memory and the canonical Truth and ADR state produced by earlier assignments.",
    "Do not read or create a report, transcript, plan, subplan, finalization job, or delegation.",
    "Frozen external documentation paths:",
    ...externalDocPaths.map((externalPath) => `- ${externalPath}`),
  ].join("\n");
}

function buildExternalSkillPrompt(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath">,
  skill: string,
): string {
  return [
    `Invoke the ${skill} skill and apply it to the supplied materials.`,
    "Run unattended and non-interactively. Do not ask questions, request confirmation or review, pause for user input, or wait for approval. If a change is ambiguous or unsafe, skip it and report the reason.",
    commonMaterialPrompt(job),
  ].join("\n");
}

function buildDocUpdaterPrompt(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath" | "docUpdate">,
): string {
  const skillPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "resources",
    "doc-updater",
    "SKILL.md",
  );
  return [
    `Use the internal doc-updater skill at ${skillPath} for this dependent knowledge-finalization stage.`,
    "Frozen external documentation paths:",
    ...(job.docUpdate?.externalDocPaths ?? []).map((externalPath) => `- ${externalPath}`),
    "Use the canonical Truth and ADR state produced by earlier assignments together with the supplied materials.",
    commonMaterialPrompt(job),
  ].join("\n");
}

function commonMaterialPrompt(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath">,
): string {
  return [
    "Use task status to distinguish completed work from pending or blocked intent; never present requirements or intentions as completed results.",
    "Materials:",
    `- ${job.planPath}`,
    `- ${job.reportPath}`,
    `Finalization id: ${job.finalizeId}`,
    "Interpret inputs by content regardless of filename or schema. Treat them as read-only and transient: do not modify, reference, or link to them in governed documentation. Do not delegate, reimplement completed work, or rerun tests.",
  ].join("\n");
}
