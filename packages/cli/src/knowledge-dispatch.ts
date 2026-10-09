import {
  buildKnowledgeFinalizationTask,
  knowledgeDelegateTemplatePath, cindyKnowledgeDelegateTemplatePath, dshKnowledgeDelegateTemplatePath,
  KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION,
  type KnowledgeFinalizationTask, type KnowledgeDelegateDispatch,
} from "@veewo/claw-core";

/** Adapter presentation only. Host/session authorization stays in the business owner. */
export function renderKnowledgeDispatch(task: KnowledgeFinalizationTask): KnowledgeDelegateDispatch {
  const title = "knowledge-finalizer-" + (task.host === "dsh" ? task.finalizeId : task.finalizeId.slice(0, 12));
  const template = task.host === "dsh" ? dshKnowledgeDelegateTemplatePath()
    : task.host === "cindy" ? cindyKnowledgeDelegateTemplatePath() : knowledgeDelegateTemplatePath();
  const bootstrap = ["plan", "create", "--template-file", template, "--title", title];
  const common = [
    "Execute this already-created claw knowledge-finalization job unattended.",
    "[claw host]",
    "platform: " + task.host,
    "Adapter-owned routing context for this dispatched worker. Model/provider and skill paths do not change the host.",
    "Project root: " + JSON.stringify(task.projectRoot),
    "Use this exact project root as workdir for every operation. Use your own actual child session; never copy the parent session identity.",
    "Finalization id: " + task.finalizeId,
  ];
  const route = task.host === "codex" ? [
    "Read the actual loaded claw-kit:using-claw-kit Codex execution reference before the first operation.",
    "Use its fixed code-mode driver for ALL context, plan, task, subplan and knowledge operations, including claim, done and receipts.",
    "First driver argv: " + JSON.stringify(bootstrap),
    "CLI-looking commandHints and template text describe business syntax only: translate them to driver argv without the claw executable or --host.",
    "Never execute workflow or knowledge mutations through bare shell CLI. The Codex adapter injects host identity and consumes native effects.",
  ] : task.host === "dsh" ? [
    "Use only the native claw_run route, never shell claw commands.",
    "First call claw_run({operation: \"plan.create\", args: {title: " + JSON.stringify(title) + ", template_file: " + JSON.stringify(template) + "}}).",
    "Translate CLI-looking commandHints and template lifecycle text into claw_run operations and snake_case args.",
  ] : task.host === "cindy" ? [
    "Use the claw-kit Cindy Ghost tools, never shell claw commands.",
    "First use Ghost plan.create with title " + JSON.stringify(title) + " and templateFile " + JSON.stringify(template) + ".",
    "The current Ghost route supplies your Cindy session_context and workspace.",
  ] : [
    "Use the OpenCode adapter CLI route. Its shell.env supplies host=opencode and your current session.",
    "First run: claw plan create --template-file " + JSON.stringify(template) + " --title " + JSON.stringify(title),
    "Do not set host or session flags yourself and do not reuse inherited parent or Codex session variables.",
  ];
  return {
    ...task,
    preferReuse: task.host === "dsh",
    ...(task.host === "codex" || task.host === "cindy" ? { leadInstruction: KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION } : {}),
    ...(task.writer?.model ? { model: task.writer.model } : {}),
    ...(task.writer?.reasoningEffort ? { reasoningEffort: task.writer.reasoningEffort } : {}),
    prompt: [...common, ...route,
      "Follow returned workflowGuidance through the non-capturing auxiliary plan and its assignment subplan.",
      "After an accepted or outcome-unknown mutation, never resend. Query the matching authenticated receipt through the same route.",
      "Do not invoke a user-facing delegate skill, start another finalizer, or delegate assignments.",
    ].join("\n"),
  };
}

export function buildKnowledgeDispatch(input: Omit<KnowledgeFinalizationTask, "schemaVersion" | "kind">): KnowledgeDelegateDispatch {
  return renderKnowledgeDispatch(buildKnowledgeFinalizationTask(input));
}
