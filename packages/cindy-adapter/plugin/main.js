// Cindy Ghost runtime for claw-kit.
// The claw CLI remains user-installed; this resident process only orchestrates
// the CLI through the declared Node worker and uses Cindy's public Agent slot.

const contexts = new Map();
const workdirs = new Map();
const injectedSessions = new Set();
const closeoutRequested = new Set();
const capturedTurnKeys = new Set();
const projections = new Map();
// Cindy has no public native Goal API. This is the adapter-owned continuation
// state: the .claw plan remains canonical, while the hook uses it to decide
// whether one background continuation may be queued for the session.
const goalSessions = new Map();
const workflowCards = new Map();
const goalAuthorizationCards = new Map();
// Cindy authorization is a Host interaction concern, not a claw plan state.
// Keep its card-issued marker independent from the Goal lifecycle marker above.
const cindyAuthorizationCardIssued = new Set();
const expandedWorkflowCards = new Map();
const cardSessions = new Map();
const cardInteractionTimers = new Map();
const cardLastUpdatedAt = new Map();

const CINDY_CLAW_ENTRY_PROMPT = [
  'This session uses claw-kit through Cindy.',
  'Enter the workflow through the `using-claw-kit` skill before taking any claw workflow action.',
  'If the user explicitly names another claw-kit skill, load and follow that named bundled skill directly after entering the main route.',
  'First call the Ghost tool `list_tools`; then call `call_tool` with the returned operation name and JSON arguments.',
  'Do not search MCP resources, discover MCP server names, inspect `.claw` as a substitute for the tools, or invoke claw shell commands.',
].join('\n');

function traceHook(hook, fields = {}) {
  // Keep a machine-readable runtime trace so Hook delivery can be proven from
  // the Cindy plugin log instead of inferred from the model's reply.
  console.error(`[claw-kit hook] ${JSON.stringify({ hook, ts: new Date().toISOString(), ...fields })}`);
}

function sendVerdict(hookId, action, extra = {}) {
  cindy.send({ type: 'event-verdict', hookId, action, ...extra });
}

async function nodeRequest(method, params, timeoutMs = 10000) {
  const response = await cindy.node.request({ method, params, timeoutMs });
  if (!response?.ok) return { ok: false, error: response?.message || 'Node worker failed' };
  return response.result || { ok: true };
}

async function requestSessionPrompt(sessionId, workdir) {
  if (!workdir) return { context: null, failed: false };
  workdirs.set(sessionId, workdir);
  const result = await nodeRequest('claw/session-start', { sessionId, workdir });
  if (result?.context) contexts.set(sessionId, result.context);
  else if (result?.errorPrompt) contexts.set(sessionId, result.errorPrompt);
  else contexts.set(sessionId, null);
  if (result?.projection?.planStatus) {
    await applyProjection(sessionId, { projection: result.projection }, undefined);
  }
  return { context: contexts.get(sessionId) || null, failed: Boolean(result?.error) };
}

async function warmSessionBackground(sessionId, workdir) {
  if (!workdir) return;
  await nodeRequest('claw/session-background', { sessionId, workdir });
}

async function runAgentTurn(sessionId, prompt, event, userActionToken) {
  const request = {
    mode: 'continue',
    trigger: 'background',
    sessionId,
    // Keep the structured event in the request envelope, but do not expose its
    // path/objective JSON in the user-visible continuation message.
    promptTemplate: '{{user_message}}',
    userMessage: prompt,
    event,
  };
  if (typeof userActionToken === 'string' && userActionToken) {
    delete request.trigger;
    delete request.sessionId;
    request.userActionToken = userActionToken;
  }
  return cindy.agent.run(request);
}

function goalContinuationPrompt(goal) {
  const taskTitle = typeof goal?.taskTitle === 'string' && goal.taskTitle.trim()
    ? `「${goal.taskTitle.trim()}」`
    : '当前任务';
  return `继续执行当前 claw 计划，完成${taskTitle}。请先遵循 claw-kit workflow guidance，并用 call_tool 记录状态；进入讨论、等待或终态后停止。`;
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

function renderWorkflowCard(projection, expanded, authorization = false) {
  const card = projection.card || {};
  const total = Number(card.totalTasks) || 0;
  const done = Number(card.completedTasks) || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  // The compact card is an execution view: never use the plan title here.
  const current = card.currentTask?.title || (projection.planStatus === 'process.wait' ? '已暂停，等待恢复' : '暂无待办任务');
  const active = expanded && projection.planStatus === 'process.active';
  const shimmer = active
    ? '<style>@keyframes clawProgressShimmer{from{transform:translateX(-130%)}to{transform:translateX(130%)}}</style><div style="position:absolute;inset:0;width:42%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.42),transparent);animation:clawProgressShimmer 1.8s linear infinite"></div>'
    : '';
  const taskRows = (Array.isArray(card.tasks) ? card.tasks : []).map((task) => {
    const state = taskStatus(task);
    const taskNumber = Number.isInteger(task?.id) ? `${task.id}. ` : '';
    const completed = task?.status === 'done';
    return `<li style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:13px"><span style="display:flex;gap:4px;align-items:flex-start;flex:0 0 auto;white-space:nowrap;color:${completed ? 'var(--claw-card-muted,var(--text-secondary,#6f968a))' : 'var(--claw-card-text,var(--text-primary,#245246))'}"><span style="width:16px;flex:0 0 16px;font-weight:650;opacity:${completed ? '.5' : '1'}">${state.icon}</span><span>${escapeHtml(taskNumber)}</span></span><span style="flex:1;min-width:0;color:${completed ? 'var(--claw-card-muted,var(--text-secondary,#6f968a))' : 'var(--claw-card-text,var(--text-primary,#245246))'}">${escapeHtml(task.title || '未命名任务')}</span></li>`;
  }).join('');
  const detail = expanded
    ? `<div style="margin-top:11px;padding-top:10px;border-top:1px solid var(--border-default,#d6d9dc)"><div style="font-size:13px;opacity:.8">${escapeHtml(card.goal || '未设置目标')}</div><ul style="list-style:none;margin:8px 0 0;padding:0">${taskRows || '<li style="font-size:13px;opacity:.7">暂无任务</li>'}</ul></div>`
    : '';
  const buttonLabel = authorization ? '授权并继续执行计划' : (expanded ? '收起任务' : '查看全部任务');
  const iconStyle = expanded
    ? 'transform:rotate(-135deg);margin-top:4px'
    : 'transform:rotate(45deg);margin-top:-3px';
  const cardHeight = workflowCardHeight(projection, expanded);
  const canContinue = projection.planStatus === 'process.active' && !authorization;
  const continueButton = canContinue
    ? '<button data-ghost-action="claw-continue-goal" aria-label="继续执行计划" title="继续执行计划" style="height:24px;padding:0 8px;border:0;border-radius:4px;background:var(--claw-progress-fill,#69b99f);color:#fff;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;font-size:11px;font-weight:650">继续</button>'
    : '';
  const action = authorization ? 'claw-continue-goal' : 'claw-toggle-tasks';
  const disclosure = authorization
    ? ''
    : `<button aria-label="${buttonLabel}" title="${buttonLabel}" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;background:transparent;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent"><span style="display:block;width:7px;height:7px;border-right:2px solid var(--claw-card-accent,var(--text-secondary,#3f8f77));border-bottom:2px solid var(--claw-card-accent,var(--text-secondary,#3f8f77));${iconStyle}"></span></button>`;
  return `<div data-ghost-action="${action}" role="button" aria-label="${buttonLabel}" title="${buttonLabel}" style="width:100%;height:${cardHeight}px;min-width:0;box-sizing:border-box;padding:14px 12px 11px;background:var(--panel-bg,var(--surface,#dff6ee));color:var(--claw-card-text,var(--text-primary,#245246));border:0;border-radius:0;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent"><div style="font-size:13px;color:var(--claw-card-text,var(--text-primary,#245246));white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(current)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:11px"><div style="position:relative;flex:1;height:18px;background:var(--claw-progress-track,#bde6d8);border-radius:0;overflow:hidden"><div style="position:relative;width:${percent}%;height:100%;background:var(--claw-progress-fill,#69b99f);overflow:hidden">${shimmer}</div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:650;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.22)">${done} / ${total}</div></div>${continueButton}${disclosure}</div>${detail}</div>`;
}

function workflowCardHeight(projection, expanded) {
  const taskCount = Array.isArray(projection?.card?.tasks) ? projection.card.tasks.length : 0;
  return expanded ? Math.min(180 + taskCount * 31, 600) : 120;
}

function updateInteractiveCard(cardId, sessionId) {
  const projection = projections.get(sessionId);
  if (!projection) return;
  const expanded = expandedWorkflowCards.get(cardId) === true;
  const authorization = goalAuthorizationCards.get(cardId) === true;
  cardLastUpdatedAt.set(cardId, Date.now());
  cindy.send({ type: 'card-update', callId: cardId, v: 2, state: projection.planStatus === 'process.active' ? 'working' : 'done', html: renderWorkflowCard(projection, expanded, authorization), height: workflowCardHeight(projection, expanded) });
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
  if (projection.goal === 'resume' && projection.planStatus === 'process.active') {
    const previousGoal = goalSessions.get(sessionId);
    const task = projection.card?.currentTask || projection.card?.nextTask;
    const taskId = Number.isInteger(task?.id) ? task.id : null;
    const taskChanged = previousGoal && taskId !== previousGoal.taskId;
    goalSessions.set(sessionId, {
      status: 'active',
      planPath: projection.planPath || previousGoal?.planPath || '',
      objective: projection.card?.goal || previousGoal?.objective || '',
      taskId,
      taskTitle: typeof task?.title === 'string' ? task.title : previousGoal?.taskTitle || '',
      retryCount: taskChanged ? 0 : previousGoal?.retryCount || 0,
      attemptPending: taskChanged ? false : previousGoal?.attemptPending === true,
      continuationQueued: taskChanged ? false : previousGoal?.continuationQueued === true,
    });
  } else if (projection.goal === 'pause' || projection.goal === 'complete' || projection.goal === 'stop') {
    goalSessions.delete(sessionId);
  }
  // Create a card only at plan creation, resume, or completion. Other workflow operations
  // update the current session card so task mutations do not leave duplicates.
  const operation = execution?.operation;
  const createsCard = operation === 'plan.create' || operation === 'plan.resume' || operation === 'plan.done';
  const cardId = createsCard ? callId : workflowCards.get(sessionId);
  if (cardId && mergedProjection.card) {
    const firstActiveCard = createsCard
      && mergedProjection.planStatus === 'process.active'
      && !cindyAuthorizationCardIssued.has(sessionId);
    if (firstActiveCard) {
      goalAuthorizationCards.set(cardId, true);
      cindyAuthorizationCardIssued.add(sessionId);
      expandedWorkflowCards.set(cardId, true);
    }
    workflowCards.set(sessionId, cardId);
    cardSessions.set(cardId, sessionId);
    cardLastUpdatedAt.set(cardId, Date.now());
    const expanded = expandedWorkflowCards.get(cardId) === true;
    cindy.send({ type: 'card-update', callId: cardId, v: 2, state: mergedProjection.planStatus === 'process.active' ? 'working' : 'done', html: renderWorkflowCard(mergedProjection, expanded, goalAuthorizationCards.get(cardId) === true), height: workflowCardHeight(mergedProjection, expanded) });
  }
  // A plan end only registers a pending report in Core. The writer is queued
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
  const message = assistantMessageText(msg.data);
  const turnId = assistantTurnId(msg);
  const workdir = workdirs.get(sessionId);
  if (!sessionId || !workdir || !message) {
    traceHook('will-assistant-message', {
      sessionId: sessionId || null,
      phase: 'capture-skipped',
      reason: !sessionId ? 'missing-session-id' : !workdir ? 'missing-workdir' : 'empty-message',
    });
    return { status: 'skipped' };
  }
  const captureKey = `${sessionId}:${turnId}`;
  if (capturedTurnKeys.has(captureKey)) return { status: 'duplicate' };
  const capture = await nodeRequest('claw/capture-report', {
    sessionId,
    workdir,
    turnId,
    message,
  }, 30000);
  if (capture?.ok && capture.captured) {
    capturedTurnKeys.add(captureKey);
  }
  if (capture?.ok && capture.jobPath && capture.finalizeId) {
    traceHook('will-assistant-message', { sessionId, phase: 'capture-succeeded', finalizeId: capture.finalizeId, jobPath: capture.jobPath });
    await dispatchKnowledgeWriter(sessionId, capture);
    return { status: 'captured', finalizeId: capture.finalizeId };
  }
  if (capture?.ok && capture.captured) {
    traceHook('will-assistant-message', { sessionId, phase: 'capture-succeeded', reportPath: capture.reportPath || null });
    return { status: 'captured' };
  }
  traceHook('will-assistant-message', {
    sessionId,
    phase: 'capture-failed',
    reason: capture?.error || 'capture-report-did-not-return-job',
  });
  return { status: 'capture-failed' };
}

function assistantMessageText(data) {
  const candidates = [data?.text, data?.message, data?.content, data?.assistantMessage];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

async function pauseGoalAfterRetries(sessionId, goal) {
  goal.pausing = true;
  const result = await nodeRequest('claw/execute', {
    operation: 'plan.wait',
    args: {},
    readOnly: false,
    sessionId,
    workdir: workdirs.get(sessionId),
  });
  if (result?.projection?.planStatus) {
    await applyProjection(sessionId, result, undefined);
  } else {
    goalSessions.delete(sessionId);
  }
}

async function continueGoalAfterTurnEnd(msg) {
  const sessionId = typeof msg.data?.sessionId === 'string' ? msg.data.sessionId : '';
  const goal = goalSessions.get(sessionId);
  if (!sessionId || !goal || goal.status !== 'active' || goal.pausing) return;

  if (goal.attemptPending) {
    goal.attemptPending = false;
    goal.continuationQueued = false;
    if (goal.taskId === goal.attemptTaskId) {
      goal.retryCount += 1;
    } else {
      goal.retryCount = 0;
    }
    if (goal.retryCount >= 2) {
      await pauseGoalAfterRetries(sessionId, goal);
      return;
    }
  }

  if (goal.continuationQueued) return;

  // Mark before calling agent.run: the new turn can reach this same hook
  // before the current callback has returned on a fast host.
  goal.continuationQueued = true;
  goal.attemptPending = true;
  goal.attemptTaskId = goal.taskId;
  const result = await runAgentTurn(
    sessionId,
    goalContinuationPrompt(goal),
    { kind: 'claw-goal-continuation', planPath: goal.planPath, objective: goal.objective },
  );
  if (!result?.ok) {
    goal.attemptPending = false;
    goal.continuationQueued = false;
    goal.retryCount += 1;
    if (goal.retryCount >= 2) {
      await pauseGoalAfterRetries(sessionId, goal);
    }
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
  if (msg.name === 'card-action' && (actionId === 'claw-toggle-tasks' || actionId === 'claw-continue-goal')) {
    const cardId = typeof msg.callId === 'string' ? msg.callId : msg.data?.callId;
    const sessionId = typeof msg.sessionId === 'string'
      ? msg.sessionId
      : typeof msg.data?.sessionId === 'string' ? msg.data.sessionId : cardSessions.get(cardId);
    const projection = projections.get(sessionId);
    if (!sessionId || !projection || !cardId) return;
    if (actionId === 'claw-continue-goal') {
      const token = typeof msg.userActionToken === 'string'
        ? msg.userActionToken
        : typeof msg.data?.userActionToken === 'string' ? msg.data.userActionToken : '';
      const outputCallId = typeof msg.spawnCallId === 'string' ? msg.spawnCallId : cardId;
      if (!token) {
        cindy.send({ type: 'card-update', callId: outputCallId, v: 2, state: 'done', html: '<div style="padding:12px">无法获取本次点击授权，请重新点击“继续”。</div>', height: 80 });
        return;
      }
      const goal = goalSessions.get(sessionId);
      if (!goal || goal.status !== 'active' || projection.planStatus !== 'process.active') {
        cindy.send({ type: 'card-update', callId: outputCallId, v: 2, state: 'done', html: '<div style="padding:12px">当前计划没有可继续执行的活动任务。</div>', height: 80 });
        return;
      }
      if (goalAuthorizationCards.get(cardId) === true) {
        goalAuthorizationCards.delete(cardId);
        expandedWorkflowCards.set(cardId, false);
        cindy.send({ type: 'card-update', callId: cardId, v: 2, state: 'working', html: renderWorkflowCard(projection, false), height: workflowCardHeight(projection, false) });
      }
      cindy.send({ type: 'card-update', callId: outputCallId, v: 2, state: 'working', html: '<div style="padding:12px">授权已完成，正在继续执行…</div>', height: 80 });
      const result = await runAgentTurn(
        sessionId,
        goalContinuationPrompt(goal),
        { kind: 'claw-goal-click-continuation', planPath: goal.planPath, objective: goal.objective, sourceCardId: cardId },
        token,
      );
      if (!result?.ok) {
        cindy.send({ type: 'card-update', callId: outputCallId, v: 2, state: 'done', html: `<div style="padding:12px">继续执行未启动：${escapeHtml(result?.message || result?.error || '主机拒绝了本次点击授权。')}</div>`, height: 100 });
      }
      return;
    }
    expandedWorkflowCards.set(cardId, expandedWorkflowCards.get(cardId) !== true);
    queueInteractiveCardUpdate(cardId, sessionId);
    return;
  }

  if (msg.name === 'did-session-created') {
    const data = msg.data || {};
    if (data.sessionId && data.workdir) {
      workdirs.set(data.sessionId, data.workdir);
      traceHook('did-session-created', { sessionId: data.sessionId, workdir: data.workdir });
      void warmSessionBackground(data.sessionId, data.workdir);
    }
    return;
  }

  if (msg.name === 'did-turn-end') {
    await continueGoalAfterTurnEnd(msg);
    return;
  }

  if (msg.name === 'will-user-message') {
    const sessionId = msg.data?.sessionId;
    traceHook('will-user-message', {
      sessionId: sessionId || null,
      phase: 'received',
      hasWorkdir: Boolean(msg.data?.workdir || workdirs.get(sessionId)),
    });
    if (!sessionId || injectedSessions.has(sessionId)) {
      sendVerdict(msg.hookId, 'allow');
      traceHook('will-user-message', { sessionId: sessionId || null, phase: 'verdict', action: 'allow', reason: !sessionId ? 'missing-session-id' : 'already-injected' });
      return;
    }
    const workdir = msg.data?.workdir || workdirs.get(sessionId);
    const promptResult = await requestSessionPrompt(sessionId, workdir);
    if (!promptResult.context) {
      if (!promptResult.failed) injectedSessions.add(sessionId);
      sendVerdict(msg.hookId, 'allow');
      traceHook('will-user-message', { sessionId, phase: 'verdict', action: 'allow', reason: promptResult.failed ? 'session-start-failed-retryable' : 'no-session-context' });
      return;
    }
    injectedSessions.add(sessionId);
    sendVerdict(msg.hookId, 'rewrite', { text: `${CINDY_CLAW_ENTRY_PROMPT}\n\n${promptResult.context}\n\n${msg.data.text}` });
    traceHook('will-user-message', { sessionId, phase: 'verdict', action: 'rewrite' });
    return;
  }

  if (msg.name === 'will-assistant-message') {
    const sessionId = typeof msg.data?.sessionId === 'string' ? msg.data.sessionId : '';
    traceHook('will-assistant-message', { sessionId: sessionId || null, phase: 'received', hasWorkdir: Boolean(workdirs.get(sessionId)) });
    try {
      await captureAssistantReport(msg);
    } finally {
      sendVerdict(msg.hookId, 'allow');
      traceHook('will-assistant-message', { sessionId: sessionId || null, phase: 'verdict', action: 'allow' });
    }
    return;
  }

});
