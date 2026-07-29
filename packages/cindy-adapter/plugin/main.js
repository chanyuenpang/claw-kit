// Cindy Ghost runtime for claw-kit.
// The claw CLI remains user-installed; this resident process only orchestrates
// the CLI through the declared Node worker and uses Cindy's public Agent slot.

const contexts = new Map();
const workdirs = new Map();
const injectedSessions = new Set();
const continuationInFlight = new Set();
const closeoutRequested = new Set();

function sendVerdict(hookId, action, extra = {}) {
  cindy.send({ type: 'event-verdict', hookId, action, ...extra });
}

async function nodeRequest(method, params, timeoutMs = 10000) {
  const response = await cindy.node.request({ method, params, timeoutMs });
  if (!response?.ok) return { ok: false, error: response?.message || 'Node worker failed' };
  return response.result || { ok: true };
}

async function loadSessionContext(sessionId, workdir) {
  if (!workdir || workdirs.get(sessionId) === workdir && contexts.has(sessionId)) {
    return contexts.get(sessionId) || null;
  }
  workdirs.set(sessionId, workdir);
  const result = await nodeRequest('claw/session-start', { sessionId, workdir });
  if (result?.context) contexts.set(sessionId, result.context);
  else if (result?.errorPrompt) contexts.set(sessionId, result.errorPrompt);
  else contexts.set(sessionId, null);
  return contexts.get(sessionId) || null;
}

async function runAgentTurn(sessionId, prompt, event) {
  return cindy.agent.run({
    mode: 'continue',
    trigger: 'background',
    sessionId,
    promptTemplate: '{{user_message}}\n\nClaw event: {{event_json}}',
    userMessage: prompt,
    event,
  });
}

async function handleTurnEnd(msg) {
  const data = msg.data || {};
  if (data.endReason !== 'completed' || !data.sessionId) return;
  const sessionId = data.sessionId;
  const workdir = workdirs.get(sessionId);
  if (!workdir) return;
  const result = await nodeRequest('claw/workflow', { sessionId, workdir });
  if (!result?.planStatus) return;

  if (result.planStatus === 'process.active' && !continuationInFlight.has(sessionId)) {
    continuationInFlight.add(sessionId);
    try {
      await runAgentTurn(
        sessionId,
        'The claw-kit plan is process.active. Continue with the next incomplete plan task, following workflowGuidance. Stop only if the plan enters process.wait, process.discussing, or an end.* state.',
        { kind: 'claw-plan-continuation', planStatus: result.planStatus },
      );
    } finally {
      continuationInFlight.delete(sessionId);
    }
    return;
  }

  if (result.planStatus === 'end.completed' && !closeoutRequested.has(sessionId)) {
    closeoutRequested.add(sessionId);
    const dispatched = await runAgentTurn(
      sessionId,
      'All claw-kit tasks are complete. Run the knowledge-writer closeout now: inspect the completed plan and changed project files, update canonical Truth followed by ADR documentation, and report the closeout result. Do not reopen completed tasks.',
      { kind: 'claw-knowledge-closeout', planStatus: result.planStatus },
    );
    if (!dispatched?.ok) closeoutRequested.delete(sessionId);
  }
}

cindy.onHostMessage(async (msg) => {
  if (msg.type !== 'event') return;

  if (msg.name === 'did-session-created') {
    const data = msg.data || {};
    if (data.sessionId && data.workdir) {
      await loadSessionContext(data.sessionId, data.workdir);
    }
    return;
  }

  if (msg.name === 'will-user-message') {
    const sessionId = msg.data?.sessionId;
    if (!sessionId || injectedSessions.has(sessionId)) {
      sendVerdict(msg.hookId, 'allow');
      return;
    }
    const context = contexts.get(sessionId);
    injectedSessions.add(sessionId);
    if (!context) {
      sendVerdict(msg.hookId, 'allow');
      return;
    }
    sendVerdict(msg.hookId, 'rewrite', { text: `${context}\n\n${msg.data.text}` });
    return;
  }

  if (msg.name === 'did-turn-end') {
    await handleTurnEnd(msg);
  }
});
