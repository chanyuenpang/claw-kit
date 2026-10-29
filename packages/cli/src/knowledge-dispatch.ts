import {
  buildKnowledgeFinalizationTask,
  knowledgeDelegateTemplatePath, cindyKnowledgeDelegateTemplatePath, dshKnowledgeDelegateTemplatePath,
  KNOWLEDGE_DISPATCH_LEAD_INSTRUCTION,
  type KnowledgeFinalizationTask, type KnowledgeDelegateDispatch, type SourceKnowledgeTask, type SourceKnowledgeDispatch,
} from "@veewo/claw-core";

export function buildSourceKnowledgeDispatch(task: Omit<SourceKnowledgeTask, "schemaVersion" | "kind">): SourceKnowledgeDispatch {
  const input = { sourceSessionKey: task.sourceSessionKey, sourcePlan: task.sourcePlan };
  const read = task.host === "dsh"
    ? `Use claw_run knowledge.materials with args ${JSON.stringify({ source_session_key: input.sourceSessionKey, source_plan: input.sourcePlan })}.`
    : task.host === "cindy"
      ? `Use the Cindy Ghost knowledge.materials tool with ${JSON.stringify(input)}.`
      : `Use the Codex driver with argv ${JSON.stringify(["knowledge", "materials", "--source-session-key", input.sourceSessionKey, "--source-plan", input.sourcePlan])}.`;
  return { ...task, schemaVersion: 2, kind: "knowledge.finalize", preferReuse: false,
    ...(task.host !== "dsh" ? { leadInstruction: "Start one knowledge writer with the supplied prompt. After accepted handoff, end the lead turn without waiting for the writer." } : {}),
    ...(task.writer?.model ? { model: task.writer.model } : {}),
    ...(task.writer?.reasoningEffort ? { reasoningEffort: task.writer.reasoningEffort } : {}),
    prompt: [
      "Maintain project knowledge from this source plan using ordinary claw plans and subplans.",
      "Host: " + task.host, "Project root: " + JSON.stringify(task.projectRoot),
      "Source session key: " + task.sourceSessionKey, "Complete source plan: " + JSON.stringify(task.sourcePlan),
      "Source plan title: " + task.sourcePlanTitle,
      "Load using-claw-kit for this host and work in the specified project root. Use your own worker session for workflow operations; the source session is only a material-reading target.",
      read,
      "Read the complete source plan and available conversation. You may search for supporting context as needed.",
      "Create an ordinary auxiliary plan with knowledge_capture=false using the returned templatePath. Follow its governance subplan and complete the ordinary plan with the actual outcome.",
      "Report changed documents, justified no-edit results, or unfinished work. Do not start another writer.",
    ].join("\n"),
  };
}

/** Legacy adapter presentation for explicitly invoked old jobs and OpenCode. */
export function renderKnowledgeDispatch(task: KnowledgeFinalizationTask): KnowledgeDelegateDispatch {
  const title = "knowledge-finalizer-" + (task.host === "dsh" ? task.finalizeId : task.finalizeId.slice(0, 12));
  const template = task.host === "dsh" ? dshKnowledgeDelegateTemplatePath()
    : task.host === "cindy" ? cindyKnowledgeDelegateTemplatePath() : knowledgeDelegateTemplatePath();
  const bootstrap = ["knowledge", "claim", "--project-root", task.projectRoot, "--finalize-id", task.finalizeId];
  const common = [
    "Execute this already-created claw knowledge-finalization job unattended.",
    "[claw host]",
    "platform: " + task.host,
    "Adapter-owned routing context for this dispatched worker. Model/provider and skill paths do not change the host.",
    "Project root: " + JSON.stringify(task.projectRoot),
    "Use this exact project root as workdir for every operation. Use your own actual child session; never copy the parent session identity.",
    "Finalization id: " + task.finalizeId,
    "The shared owner prepares the non-capturing auxiliary workflow and claim bookkeeping. Do not create or start a plan to qualify for claim; follow the returned actual workflow or a specific deferred preparation failure.",
  ];
  const route = task.host === "codex" ? [
    "Read the actual loaded claw-kit:using-claw-kit Codex execution reference before the first operation.",
    "Use its fixed code-mode driver for ALL context, plan, task, subplan and knowledge operations, including claim, done and receipts.",
    "First driver argv: " + JSON.stringify(bootstrap),
    "If your current working directory differs from the project root, keep the explicit --project-root argument shown above.",
    "CLI-looking commandHints and template text describe business syntax only: translate them to driver argv without the claw executable or --host.",
    "Never execute workflow or knowledge mutations through bare shell CLI. The Codex adapter injects host identity and consumes native effects.",
  ] : task.host === "dsh" ? [
    "Use only the native claw_run route, never shell claw commands.",
    "First call claw_run({operation: \"knowledge.claim\", args: {finalize_id: " + JSON.stringify(task.finalizeId) + "}}).",
    "Translate CLI-looking commandHints and template lifecycle text into claw_run operations and snake_case args.",
  ] : task.host === "cindy" ? [
    "Use the claw-kit Cindy Ghost tools, never shell claw commands.",
    "First use Ghost knowledge.claim with finalizeId " + JSON.stringify(task.finalizeId) + ".",
    "The current Ghost route supplies your Cindy session_context and workspace.",
  ] : [
    "Use the OpenCode adapter CLI route. Its shell.env supplies host=opencode and your current session.",
    "First run: claw knowledge claim --finalize-id " + JSON.stringify(task.finalizeId),
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
