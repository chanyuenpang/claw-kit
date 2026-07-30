import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeFinalizationJob } from "./knowledge-sidecar.js";
import type { PlanTemplateDocument } from "./templates/plans/default.js";
import type { KnowledgeWriterConfig } from "./types.js";

export type KnowledgeWriterAssignment = {
  index: number;
  kind: "builtin" | "external_skill";
  skill?: string;
  promptVersion: 1;
  prompt: string;
};

export type KnowledgeDelegateDispatch = {
  schemaVersion: 1;
  policy: "background" | "subagent";
  finalizeId: string;
  model?: string;
  reasoningEffort?: NonNullable<KnowledgeWriterConfig["reasoningEffort"]>;
  prompt: string;
};

export function knowledgeDelegateTemplatePath(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "resources",
    "delegate-writer",
    "TEMPLATE.json",
  );
}

export function buildKnowledgeDelegateDispatch(input: {
  policy: "background" | "subagent";
  finalizeId: string;
  writer?: KnowledgeWriterConfig | null;
}): KnowledgeDelegateDispatch {
  const templatePath = knowledgeDelegateTemplatePath();
  const delegateTitle = `knowledge-finalizer-${input.finalizeId.slice(0, 12)}`;
  return {
    schemaVersion: 1,
    policy: input.policy,
    finalizeId: input.finalizeId,
    ...(input.writer?.model ? { model: input.writer.model } : {}),
    ...(input.writer?.reasoningEffort ? { reasoningEffort: input.writer.reasoningEffort } : {}),
    prompt: [
      "Execute this claw knowledge-finalization job directly and unattended.",
      `First run: claw plan create --template-file "${templatePath}" --title "${delegateTitle}"`,
      "Then follow the returned workflowGuidance until the internal session plan is complete.",
      `Finalization id: ${input.finalizeId}`,
      "Do not invoke a user-facing delegate skill, background finalizer, writer proxy, or collaboration subagent.",
    ].join("\n"),
  };
}

export function buildKnowledgeWriterAssignments(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath" | "writer">,
): KnowledgeWriterAssignment[] {
  const configured = job.writer?.externalSkills?.map((skill) => skill.trim()).filter(Boolean) ?? [];
  if (configured.length === 0) {
    return [{
      index: 0,
      kind: "builtin",
      promptVersion: 1,
      prompt: buildBuiltinKnowledgePrompt(job),
    }];
  }
  return configured.map((skill, index) => ({
    index,
    kind: "external_skill",
    skill,
    promptVersion: 1,
    prompt: buildExternalSkillPrompt(job, skill),
  }));
}

export function buildKnowledgeAssignmentTemplate(input: {
  assignments: KnowledgeWriterAssignment[];
  finalizeId: string;
  version: string;
}): PlanTemplateDocument {
  if (input.assignments.length === 1 && input.assignments[0]?.kind === "builtin") {
    return buildBuiltinKnowledgeTemplate(input);
  }
  return {
    id: `knowledge-assignments-${input.finalizeId.slice(0, 12)}`,
    version: input.version,
    scope: "session",
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
        "Every assignment follows its supplied prompt exactly.",
        "No assignment launches another finalizer or writer agent.",
      ],
    },
    tasks: input.assignments.map((assignment) => ({
      id: assignment.index + 1,
      title: assignment.kind === "builtin"
        ? "Execute built-in knowledge governance"
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
  template.scope = "session";
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
  return template;
}

function buildBuiltinKnowledgePrompt(
  job: Pick<KnowledgeFinalizationJob, "finalizeId" | "planPath" | "reportPath" | "writer">,
): string {
  return [
    "Execute the built-in knowledge-governance contract supplied by claw-kit.",
    "Maintain canonical Truth first and ADR second from conclusion-bearing content in the supplied materials.",
    `For every canonical document changed by this pass, keep at most ${job.writer?.datedSectionsToKeep ?? 6} complete evolution sections marked by \`<!-- dated: YYYY-MM-DD -->\`; do not truncate current prose or untouched documents.`,
    commonMaterialPrompt(job),
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
