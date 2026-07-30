// Cindy Ghost runtime for claw-kit.
// The claw CLI remains user-installed; this resident process only orchestrates
// the CLI through the declared Node worker and uses Cindy's public Agent slot.

const contexts = new Map();
const workdirs = new Map();
const injectedSessions = new Set();
const closeoutRequested = new Set();
const projections = new Map();
const workflowCards = new Map();
const expandedWorkflowCards = new Map();
const cardSessions = new Map();
const cardInteractionTimers = new Map();
const cardLastUpdatedAt = new Map();

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
  for (const job of Array.isArray(result?.knowledgeJobs) ? result.knowledgeJobs : []) {
    void dispatchKnowledgeWriter(sessionId, job);
  }
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function taskStatus(task) {
  const status = typeof task?.status === 'string' ? task.status : 'pending';
  if (status === 'done') return { icon: '✓', label: '已完成' };
  if (status === 'in_progress') return { icon: '◐', label: '进行中' };
  if (status === 'blocked') return { icon: '!', label: '受阻' };
  return { icon: '○', label: '待办' };
}

function renderWorkflowCard(projection, expanded) {
  const card = projection.card || {};
  const total = Number(card.totalTasks) || 0;
  const done = Number(card.completedTasks) || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  // The compact card is an execution view: never use the plan title here.
  const current = card.currentTask?.title || (projection.planStatus === 'process.wait' ? '已暂停，等待恢复' : '暂无待办任务');
  const active = projection.planStatus === 'process.active';
  const shimmer = active
    ? '<style>@keyframes clawProgressShimmer{from{transform:translateX(-130%)}to{transform:translateX(130%)}}</style><div style="position:absolute;inset:0;width:42%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);animation:clawProgressShimmer 1.8s linear infinite"></div>'
    : '';
  const taskRows = (Array.isArray(card.tasks) ? card.tasks : []).map((task) => {
    const state = taskStatus(task);
    const taskNumber = Number.isInteger(task?.id) ? `${task.id}. ` : '';
    const completed = task?.status === 'done';
    return `<li style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:13px"><span style="display:flex;gap:4px;align-items:flex-start;flex:0 0 auto;white-space:nowrap;color:${completed ? '#6f968a' : '#245246'}"><span style="width:16px;flex:0 0 16px;font-weight:650;opacity:${completed ? '.5' : '1'}">${state.icon}</span><span>${escapeHtml(taskNumber)}</span></span><span style="flex:1;min-width:0;color:${completed ? '#6f968a' : '#245246'}">${escapeHtml(task.title || '未命名任务')}</span></li>`;
  }).join('');
  const detail = expanded
    ? `<div style="margin-top:11px;padding-top:10px;border-top:1px solid var(--border-default,#d6d9dc)"><div style="font-size:13px;opacity:.8">${escapeHtml(card.goal || '未设置目标')}</div><ul style="list-style:none;margin:8px 0 0;padding:0">${taskRows || '<li style="font-size:13px;opacity:.7">暂无任务</li>'}</ul></div>`
    : '';
  const buttonLabel = expanded ? '收起任务' : '查看全部任务';
  const iconStyle = expanded
    ? 'transform:rotate(-135deg);margin-top:4px'
    : 'transform:rotate(45deg);margin-top:-3px';
  return `<div style="width:80%;box-sizing:border-box;padding:14px 12px 11px;background:#dff6ee;color:#245246;border:1px solid #b7e3d5;border-radius:10px"><div style="font-size:13px;color:#245246;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(current)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:11px"><div style="position:relative;flex:1;height:18px;background:#bde6d8;border-radius:999px;overflow:hidden"><div style="position:relative;width:${percent}%;height:100%;background:#69b99f;overflow:hidden">${shimmer}</div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:650;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.22)">${done} / ${total}</div></div><button data-ghost-action="claw-toggle-tasks" aria-label="${buttonLabel}" title="${buttonLabel}" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;cursor:pointer"><span style="display:block;width:7px;height:7px;border-right:2px solid #3f8f77;border-bottom:2px solid #3f8f77;${iconStyle}"></span></button></div>${detail}</div>`;
}

function workflowCardHeight(projection, expanded) {
  const taskCount = Array.isArray(projection?.card?.tasks) ? projection.card.tasks.length : 0;
  return expanded ? Math.min(180 + taskCount * 31, 600) : 135;
}

function updateInteractiveCard(cardId, sessionId) {
  const projection = projections.get(sessionId);
  if (!projection) return;
  const expanded = expandedWorkflowCards.get(cardId) === true;
  cardLastUpdatedAt.set(cardId, Date.now());
  cindy.send({ type: 'card-update', callId: cardId, v: 2, state: 'done', html: renderWorkflowCard(projection, expanded), height: workflowCardHeight(projection, expanded) });
}

function queueInteractiveCardUpdate(cardId, sessionId) {
  const elapsed = Date.now() - (cardLastUpdatedAt.get(cardId) || 0);
  const delay = Math.max(0, 1050 - elapsed);
  const priorTimer = cardInteractionTimers.get(cardId);
  if (priorTimer) clearTimeout(priorTimer);
  if (delay === 0) {
    updateInteractiveCard(cardId, sessionId);
    return;
  }
  cardInteractionTimers.set(cardId, setTimeout(() => {
    cardInteractionTimers.delete(cardId);
    updateInteractiveCard(cardId, sessionId);
  }, delay));
}

async function applyProjection(sessionId, execution, callId) {
  const projection = execution?.projection;
  if (!projection?.planStatus) return;
  const previous = projections.get(sessionId);
  const mergedProjection = {
    ...previous,
    ...projection,
    card: { ...(previous?.card || {}), ...(projection.card || {}) },
  };
  projections.set(sessionId, mergedProjection);
  // Cindy's working state adds a host-wide running sweep to the card.  Use a
  // completed card for each workflow operation so only the explicit progress
  // bar is visualized, never the full card canvas.
  const cardId = callId;
  if (cardId && mergedProjection.card) {
    workflowCards.set(sessionId, cardId);
    cardSessions.set(cardId, sessionId);
    cardLastUpdatedAt.set(cardId, Date.now());
    cindy.send({ type: 'card-update', callId: cardId, v: 2, state: 'done', html: renderWorkflowCard(mergedProjection, expandedWorkflowCards.get(cardId) === true), height: workflowCardHeight(mergedProjection, expandedWorkflowCards.get(cardId) === true) });
  }
  // The card is a Host-local projection of canonical .claw state. Native Cindy
  // Goal/Progress still wait for a stable public Host API.
  // A plan end only registers a pending report in Core.  The writer is queued
  // after will-assistant-message captures this turn's final report.
}

function assistantTurnId(msg) {
  const supplied = typeof msg.data?.turnId === 'string' ? msg.data.turnId.trim() : '';
  if (supplied) return supplied;
  return `cindy-hook-${String(msg.seq ?? `${Date.now()}-${Math.random()}`)}`;
}

async function dispatchKnowledgeWriter(sessionId, job) {
  const finalizeId = typeof job?.finalizeId === 'string' ? job.finalizeId : '';
  const jobPath = typeof job?.jobPath === 'string' ? job.jobPath : '';
  if (!finalizeId || !jobPath || closeoutRequested.has(finalizeId)) return;
  closeoutRequested.add(finalizeId);
  const registered = await nodeRequest('claw/register-knowledge-writer', { sessionId, finalizeId, jobPath, workdir: workdirs.get(sessionId) });
  if (!registered?.ok) {
    closeoutRequested.delete(finalizeId);
    return;
  }
  const dispatched = await runAgentTurn(
    sessionId,
    'Run the knowledge-writer closeout for the completed claw plan. Inspect its captured report and completed-work files; update canonical Truth first and then ADRs. Do not reopen plan tasks. When the closeout is genuinely finished, call claw-kit `call_tool` with name `knowledge.complete` and args `{ "finalizeId": "' + finalizeId + '", "result": "<concise outcome>" }` before your final response. If it cannot be completed, state the recoverable failure and do not acknowledge the job.',
    { kind: 'claw-knowledge-closeout', finalizeId },
  );
  if (!dispatched?.ok) {
    await nodeRequest('claw/fail-knowledge-writer', { sessionId, workdir: workdirs.get(sessionId), jobPath, message: dispatched?.message || 'Cindy background writer could not start.' });
    closeoutRequested.delete(finalizeId);
  }
}

async function captureAssistantReport(msg) {
  const sessionId = typeof msg.data?.sessionId === 'string' ? msg.data.sessionId : '';
  const message = typeof msg.data?.text === 'string' ? msg.data.text.trim() : '';
  const workdir = workdirs.get(sessionId);
  if (!sessionId || !workdir || !message) return;
  const capture = await nodeRequest('claw/capture-report', {
    sessionId,
    workdir,
    turnId: assistantTurnId(msg),
    message,
  }, 30000);
  if (capture?.ok && capture.jobPath && capture.finalizeId) {
    await dispatchKnowledgeWriter(sessionId, capture);
  }
}

function toolFailure(callId, message) {
  cindy.send({ type: 'tool-result', callId, ok: false, error: message });
}

async function handleToolCall(msg) {
  if (msg.tool === 'list_tools') {
    const catalog = await nodeRequest('claw/catalog', {});
    const category = typeof msg.args?.category === 'string' ? msg.args.category : '';
    const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
    const result = category
      ? categories.find((item) => item.name === category) || { error: `Unknown category: ${category}` }
      : { categories: categories.map((item) => ({ name: item.name, operationCount: item.operations.length })) };
    cindy.send({ type: 'tool-result', callId: msg.callId, ok: !result.error, result });
    return;
  }
  if (msg.tool !== 'call_tool') return;

  const context = msg.args?.session_context;
  if (!context?.session_id || !context?.workdir) {
    toolFailure(msg.callId, 'Cindy did not provide a session workspace for this claw-kit operation.');
    return;
  }
  if (!context.workdir_is_local) {
    toolFailure(msg.callId, 'claw-kit workflow operations require a local Cindy workspace.');
    return;
  }
  const operation = typeof msg.args?.name === 'string' ? msg.args.name : '';
  const operationArgs = msg.args?.args && typeof msg.args.args === 'object' ? msg.args.args : {};
  const execution = await nodeRequest('claw/execute', {
    operation,
    args: operationArgs,
    readOnly: Boolean(context.workdir_is_read_only),
    sessionId: context.session_id,
    workdir: context.workdir,
  });
  if (!execution?.ok) {
    toolFailure(msg.callId, execution?.error || 'claw-kit operation failed.');
    return;
  }
  await applyProjection(context.session_id, execution, msg.callId);
  if (operation === 'knowledge.complete' && execution.result?.completed) {
    closeoutRequested.delete(String(operationArgs.finalizeId || ''));
  }
  // Projection is Host-only lifecycle state. The Agent receives only the
  // operation result and its Cindy-safe guidance.
  cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result: execution.result });
}

cindy.onHostMessage(async (msg) => {
  if (msg.type === 'tool-call') {
    await handleToolCall(msg);
    return;
  }
  if (msg.type !== 'event') return;

  const actionId = typeof msg.actionId === 'string' ? msg.actionId : msg.data?.actionId;
  if (msg.name === 'card-action' && actionId === 'claw-toggle-tasks') {
    const cardId = typeof msg.callId === 'string' ? msg.callId : msg.data?.callId;
    const sessionId = typeof msg.sessionId === 'string'
      ? msg.sessionId
      : typeof msg.data?.sessionId === 'string' ? msg.data.sessionId : cardSessions.get(cardId);
    const projection = projections.get(sessionId);
    if (!sessionId || !projection || !cardId) return;
    expandedWorkflowCards.set(cardId, expandedWorkflowCards.get(cardId) !== true);
    queueInteractiveCardUpdate(cardId, sessionId);
    return;
  }

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

  if (msg.name === 'will-assistant-message') {
    try {
      await captureAssistantReport(msg);
    } finally {
      sendVerdict(msg.hookId, 'allow');
    }
    return;
  }

});
