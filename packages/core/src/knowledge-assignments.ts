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

export type KnowledgeDelegateDispatch = {
  schemaVersion: 1;
  policy: "background" | "subagent";
  finalizeId: string;
  preferReuse: true;
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
    preferReuse: true,
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

export function cindyKnowledgeDelegateTemplatePath(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "resources",
    "cindy-delegate-writer",
    "TEMPLATE.json",
  );
}

export function buildKnowledgeAtomicDispatch(input: {
  finalizeId: string;
  writer?: KnowledgeWriterConfig | null;
}): KnowledgeDelegateDispatch {
  const templatePath = cindyKnowledgeDelegateTemplatePath();
  const delegateTitle = `knowledge-finalizer-${input.finalizeId.slice(0, 12)}`;
  return {
    schemaVersion: 1,
    policy: "subagent",
    finalizeId: input.finalizeId,
    preferReuse: true,
    ...(input.writer?.model ? { model: input.writer.model } : {}),
    ...(input.writer?.reasoningEffort ? { reasoningEffort: input.writer.reasoningEffort } : {}),
    prompt: [
      "Execute this already-created claw knowledge-finalization job unattended through the claw-kit Cindy Ghost tools.",
      `Use the claw-kit Ghost plan.create operation to create the session plan titled "${delegateTitle}" with templateFile "${templatePath}".`,
      "The template owns the claim, assignment subplan, and terminal acknowledgement stages.",
      `Finalization id: ${input.finalizeId}`,
      "Use Ghost operations rather than the claw CLI, and do not invoke another finalizer or delegate agent.",
    ].join("\n"),
  };
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
  const docAssignment = input.assignments.find((assignment) => assignment.kind === "doc_updater");
  if (docAssignment) {
    const tasks = template.tasks as Array<Record<string, any>>;
    const adrTask = tasks.find((task) => task.id === 5);
    const reviewTask = tasks.find((task) => task.id === 6);
    if (!adrTask || !reviewTask) {
      throw new Error("Built-in knowledge template is missing the ADR or consistency-review task.");
    }
    const next = adrTask?.guidance?.onDone?.default;
    if (next) {
      next.summary = "The ordered Truth and ADR passes are complete; update affected external documentation next.";
      next.nextsteps = [
        "Use the resulting canonical knowledge state to qualify current-state claims in existing external documentation.",
        "Preserve requirements, future design, and useful history when their scope remains accurate.",
      ];
      next.nextTaskId = 6;
    }
    reviewTask.id = 7;
    reviewTask.title = "Run the cross-corpus consistency review";
    reviewTask.detail = `${reviewTask.detail} Include every affected external document in the review and resolve any remaining material contradiction between its current-state claims, current implementation, Truth, and ADR.`;
    tasks.splice(tasks.indexOf(reviewTask), 0, {
      id: 6,
      title: "Update affected external documentation",
      detail: docAssignment.prompt,
      status: "pending",
      guidance: {
        onDone: {
          default: {
            mergeMode: "override",
            summary: "Affected existing external documentation is governed; review canonical knowledge and external documentation together.",
            nextsteps: [
              "Review related Truth, ADR, and affected external documents as one current-state corpus.",
              "Resolve any remaining material competing claim before completion.",
            ],
            nextTaskId: 7,
          },
        },
      },
    });
  }
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
