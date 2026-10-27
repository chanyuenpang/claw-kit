// Cindy Ghost runtime for claw-kit.
// The claw CLI remains user-installed; this resident process only orchestrates
// the CLI through the declared Node worker and uses Cindy's public Agent slot.

const CINDY_HOST_IDENTITY = "[claw host]\nplatform: cindy\nHost/session identity is adapter-owned, independent of model/provider. Host/session arguments remain adapter-owned.\nClaw workflow entry: using-claw-kit. Use standard skill names without a plugin namespace.";
const CINDY_DEVELOPMENT_ENTRY = '\n\n[claw]当前是 Cindy Host。本次会话先按可用技能列表中的路径读取公共技能 using-claw-kit 的 SKILL.md，再读取其 Cindy 路由说明，完成后开展任务。[/claw]';
const entryHookSessions = new Set();
async function developmentEntryVerdict(msg) {
  const original = msg.data?.text;
  const sessionId = msg.data?.sessionId;
  const allow = { type: 'event-verdict', hookId: msg.hookId, action: 'allow' };
  if (!sessionId || entryHookSessions.has(sessionId)) return allow;
  // The Host truncates rewrite text at 16,000 UTF-16 code units. Never risk
  // truncating user content to add an advisory instruction. Catalog fallback
  // remains available when the message exceeds this actual transport limit.
  if (typeof original !== 'string' || original.length + CINDY_DEVELOPMENT_ENTRY.length > 16000) {
    traceHook('will-user-message', { phase: 'entry-skipped', reason: 'message-not-rewritable-without-truncation' });
    return allow;
  }
  entryHookSessions.add(sessionId);
  const claim = await nodeRequest('claw/claim-entry-hook', { sessionId }, 1500);
  if (!claim?.ok || !claim.claimed) return allow;
  return { type: 'event-verdict', hookId: msg.hookId, action: 'rewrite', text: original + CINDY_DEVELOPMENT_ENTRY };
}
function withCindyHostIdentity(result) {
  const body = result && typeof result === "object" && !Array.isArray(result) ? result : { value: result };
  return { ...body, clawHost: { platform: "cindy" }, skillResolution: 'Claw workflow entry: using-claw-kit. Use standard skill names without a plugin namespace.' };
}

const workdirs = new Map();
const reconcilingSessions = new Set();
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
function traceHook(hook, fields = {}) {
  // Keep a machine-readable runtime trace so Hook delivery can be proven from
  // the Cindy plugin log instead of inferred from the model's reply.
  console.error(`[claw-kit hook] ${JSON.stringify({ hook, ts: new Date().toISOString(), ...fields })}`);
}

async function nodeRequest(method, params, timeoutMs = 10000) {
  try {
    const response = await cindy.node.request({ method, params, timeoutMs });
    if (!response?.ok) {
      const brokerCode = typeof response?.errorCode === 'string' ? response.errorCode : 'UNKNOWN';
      const brokerReason = typeof response?.message === 'string' && response.message.trim()
        ? response.message.trim()
        : 'Node worker failed without an error message';
      return {
        ok: false,
        errorCode: `NODE_${brokerCode}`,
        reason: `Node request "${method}" failed (${brokerCode}): ${brokerReason}`,
        data: response?.data,
      };
    }
    return response.result || { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errorCode: 'NODE_REQUEST_REJECTED',
      reason: `Node request "${method}" was rejected: ${reason}`,
    };
  }
}

async function refreshSessionStart(sessionId, workdir) {
  if (!workdir) {
    return { failed: true };
  }
  workdirs.set(sessionId, workdir);
  const result = await nodeRequest('claw/session-start', { sessionId, workdir }, 12000);
  if (result?.projection?.planStatus) {
    await applyProjection(sessionId, { projection: result.projection }, undefined);
  }
  return {
    failed: result?.ok === false,
  };
}

async function runSessionMaintenance(sessionId, workdir) {
  if (!workdir) return;
  try {
    const result = await nodeRequest('claw/session-background', { sessionId, workdir });
    if (!result?.ok) {
      traceHook('did-session-created', { sessionId, phase: 'maintenance-failed', reason: result?.reason || result?.error || 'unknown-error' });
    }
  } catch (error) {
    traceHook('did-session-created', {
      sessionId,
      phase: 'maintenance-failed',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function prepareSessionBackground(sessionId, workdir) {
  if (!sessionId) return;
  // Advisory and independent of workflow recovery. Never install/download in a hook.
  void checkSharedSkills();
  if (workdir) workdirs.set(sessionId, workdir);
  try {
    if (!workdir) {
      traceHook('did-session-created', { sessionId, phase: 'background-skipped', reason: 'missing-workdir' });
      return;
    }
    const [sessionStartResult] = await Promise.all([
      refreshSessionStart(sessionId, workdir),
      runSessionMaintenance(sessionId, workdir),
    ]);
    traceHook('did-session-created', {
      sessionId,
      phase: 'background-complete',
      autoClawFailed: sessionStartResult.failed,
    });
  } catch (error) {
    traceHook('did-session-created', {
      sessionId,
      phase: 'background-failed',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

let sharedSkillsNotice = '';
async function checkSharedSkills() {
  try {
    const result = await nodeRequest('claw/skills-status', {});
    if (result?.compatible) { sharedSkillsNotice = ''; return; }
    const key = result?.status || result?.errorCode || 'unavailable';
    if (sharedSkillsNotice === key) return;
    sharedSkillsNotice = key;
    await cindy.send({ type: 'notify', tone: 'warning', text: 'claw-kit 共享技能需要修复。请调用 skills_status 查看原因，再显式调用 install_skills。安装后新建会话验证；正常工作流可继续。' });
  } catch (error) {
    traceHook('skills-check', { reason: String(error) });
  }
}

function scheduleSessionBackground(sessionId, workdir) {
  setTimeout(() => {
    void prepareSessionBackground(sessionId, workdir);
  }, 0);
}

async function reconcileFocusedSession(sessionId, workdir) {
  if (!sessionId || !workdir || reconcilingSessions.has(sessionId)) return;
  reconcilingSessions.add(sessionId);
  try {
    workdirs.set(sessionId, workdir);
    await refreshSessionStart(sessionId, workdir);
  } finally {
    reconcilingSessions.delete(sessionId);
  }
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
  return CINDY_HOST_IDENTITY + "\n\n" + `继续执行当前 claw 计划，完成${taskTitle}。请先遵循 claw-kit workflow guidance，并用 call_tool 记录状态；进入讨论、等待或终态后停止。`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function taskStatus(task) {
  const status = typeof task?.status === 'string' ? task.status : 'pending';
  if (status === 'done') return { status, label: '已完成' };
  if (status === 'in_progress') return { status, label: '进行中' };
  if (status === 'blocked') return { status, label: '受阻' };
  return { status: 'pending', label: '待办' };
}

function taskStatusIcon(status) {
  const circle = 'display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:18px;height:18px;border:1.5px solid currentColor;border-radius:50%;font-size:11px;font-weight:700;line-height:1';
  if (status === 'done') return `<span aria-hidden="true" style="${circle}">✓</span>`;
  if (status === 'in_progress') return `<span aria-hidden="true" style="${circle};border-top-color:transparent;animation:claw-task-spin 3s linear infinite"></span>`;
  if (status === 'blocked') return `<span aria-hidden="true" style="${circle}">!</span>`;
  return `<span aria-hidden="true" style="${circle}"></span>`;
}

function renderWorkflowCard(projection, expanded, authorization = false) {
  const card = projection.card || {};
  const total = Number(card.totalTasks) || 0;
  const done = Number(card.completedTasks) || 0;
  // The title remains task-focused, matching Cindy's native workflow bubble.
  const tasks = Array.isArray(card.tasks) ? card.tasks : [];
  const hasInProgressTask = tasks.some((task) => task?.status === 'in_progress');
  const current = card.currentTask?.title
    || card.nextTask?.title
    || tasks.at(-1)?.title
    || (projection.planStatus === 'process.wait' ? '已暂停，等待恢复' : '暂无待办任务');
  const taskRows = tasks.map((task) => {
    const state = taskStatus(task);
    const active = state.status === 'done' || state.status === 'in_progress';
    const color = active ? '#454a51' : '#6d737c';
    const weight = active ? '600' : '400';
    const opacity = active ? '1' : '.6';
    return `<li style="display:flex;height:30px;align-items:center;gap:10px;color:${color};opacity:${opacity}"><span aria-label="${state.label}" style="display:inline-flex;flex:0 0 18px;width:18px;height:18px">${taskStatusIcon(state.status)}</span><span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:normal;font-weight:${weight}">${escapeHtml(task.title || '未命名任务')}</span></li>`;
  }).join('');
  const detail = expanded
    ? `<div style="padding:10px 14px 12px;border-top:1px solid #dfe2e6"><ul style="display:flex;flex-direction:column;gap:2px;list-style:none;margin:0;padding:0">${taskRows || '<li style="height:30px;font-size:13px;line-height:normal;color:#6d737c">暂无任务</li>'}</ul></div>`
    : '';
  const buttonLabel = authorization ? '授权并继续执行计划' : (expanded ? '收起任务' : '查看全部任务');
  const cardHeight = workflowCardHeight(projection, expanded);
  const action = authorization ? 'claw-continue-goal' : 'claw-toggle-tasks';
  const disclosure = `<span aria-hidden="true" style="display:block;width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);margin-top:-3px"></span>`;
  const listIcon = `<span aria-hidden="true" style="display:flex;flex-direction:column;gap:2px;width:16px;height:16px"><span style="display:flex;align-items:center;gap:2px;height:4px"><span style="font-size:5px;line-height:1">✓</span><span style="display:block;width:9px;height:1px;background:currentColor"></span></span><span style="display:flex;align-items:center;gap:2px;height:4px"><span style="font-size:5px;line-height:1">✓</span><span style="display:block;width:9px;height:1px;background:currentColor"></span></span><span style="display:flex;align-items:center;gap:2px;height:4px"><span style="font-size:5px;line-height:1">✓</span><span style="display:block;width:9px;height:1px;background:currentColor"></span></span></span>`;
  const animation = hasInProgressTask ? '<style>@keyframes claw-task-spin{to{transform:rotate(360deg)}}</style>' : '';
  return `${animation}<div data-ghost-action="${action}" role="button" aria-label="${buttonLabel}" title="${buttonLabel}" style="width:100%;height:${cardHeight}px;min-width:0;box-sizing:border-box;overflow:hidden;background:#fbfbfc;color:#22262b;border:1px solid #dfe2e6;border-radius:12px;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent"><div style="display:flex;align-items:center;gap:8px;min-height:36px;padding:10px 14px;box-sizing:border-box"><span style="display:inline-flex;align-items:center;justify-content:center;flex:0 0 14px;width:14px;height:14px;color:#6d737c">${disclosure}</span><span aria-hidden="true" style="display:inline-flex;flex:0 0 16px;width:16px;height:16px;color:#454a51">${listIcon}</span><span style="flex:0 0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:normal;font-weight:600;color:#454a51">${done}/${total}</span><span aria-hidden="true" style="color:#6d737c;font-size:13px;line-height:normal">·</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:normal;font-weight:400;color:#454a51">${escapeHtml(current)}</span></div>${detail}</div>`;
}

function workflowCardState(projection) {
  return projection?.card?.tasks?.some((task) => task?.status === 'in_progress') ? 'working' : 'done';
}

function workflowCardHeight(projection, expanded) {
  const taskCount = Array.isArray(projection?.card?.tasks) ? projection.card.tasks.length : 0;
  return expanded ? Math.min(89 + taskCount * 48, 600) : 58;
}

function updateInteractiveCard(cardId, sessionId) {
  const projection = projections.get(sessionId);
  if (!projection) return;
  const expanded = expandedWorkflowCards.get(cardId) === true;
  const authorization = goalAuthorizationCards.get(cardId) === true;
  cardLastUpdatedAt.set(cardId, Date.now());
  cindy.send({ type: 'card-update', callId: cardId, v: 2, state: workflowCardState(projection), html: renderWorkflowCard(projection, expanded, authorization), height: workflowCardHeight(projection, expanded) });
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
  // Only plan creation owns a new card id. Every later workflow operation
  // updates the current session card so resume and completion do not leave duplicates.
  const operation = execution?.operation;
  const createsCard = operation === 'plan.create';
  const cardId = createsCard ? callId : workflowCards.get(sessionId);
  if (cardId && mergedProjection.card) {
    const firstActiveCard = mergedProjection.planStatus === 'process.active'
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
    cindy.send({ type: 'card-update', callId: cardId, v: 2, state: workflowCardState(mergedProjection), html: renderWorkflowCard(mergedProjection, expanded, goalAuthorizationCards.get(cardId) === true), height: workflowCardHeight(mergedProjection, expanded) });
  }
  // Cindy closeout is already durable here: the terminal mutation returns an
  // Orca Worker dispatch.
  // Turn-end hooks do not create or claim Cindy knowledge jobs.
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

function toolFailure(callId, reason, errorCode = 'CLAW_OPERATION_FAILED', failure = {}) {
  reason = CINDY_HOST_IDENTITY + '\n\n' + reason;
  const details = {};
  for (const key of ['outcome', 'phase', 'effect', 'operation', 'recoveryCommand', 'diagnostics', 'recovery']) {
    if (failure[key] !== undefined) details[key] = failure[key];
  }
  cindy.send({ type: 'tool-result', callId, ok: false, errorCode, message: reason, ...details });
}

async function dispatchToolCall(msg) {
  if (msg.tool === 'skills_status' || msg.tool === 'install_skills') {
    const context = msg.args?.session_context;
    if (!context?.session_id || !context?.workdir || !context.workdir_is_local) {
      toolFailure(msg.callId, '共享技能操作需要 Cindy 提供本地会话身份。', 'LOCAL_WORKSPACE_REQUIRED');
      return;
    }
    if (msg.tool === 'install_skills' && context.workdir_is_read_only) {
      toolFailure(msg.callId, '当前会话只读，无法安装全局技能。请在可写的本地会话中执行。', 'WORKSPACE_READ_ONLY');
      return;
    }
    const result = await nodeRequest(msg.tool === 'skills_status' ? 'claw/skills-status' : 'claw/skills-install', {}, 120000);
    if (!result?.ok) { toolFailure(msg.callId, result?.reason || '共享技能操作失败。', result?.errorCode || 'SKILLS_INSTALL_FAILED', result); return; }
    cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result: withCindyHostIdentity(result) });
    return;
  }
  if (msg.tool === 'list_tools') {
    const catalog = await nodeRequest('claw/catalog', { workdir: msg.args?.session_context?.workdir });
    if (!catalog?.categories) {
      toolFailure(
        msg.callId,
        catalog?.reason || 'The claw-kit operation catalog is unavailable.',
        catalog?.errorCode || 'CLAW_CATALOG_UNAVAILABLE',
      );
      return;
    }
    const category = typeof msg.args?.category === 'string' ? msg.args.category : '';
    const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
    const result = category
      ? categories.find((item) => item.name === category) || { error: `Unknown category: ${category}` }
      : { categories: categories.map((item) => ({ name: item.name, operationCount: item.operations.length })) };
    cindy.send({ type: 'tool-result', callId: msg.callId, ok: !result.error, result: withCindyHostIdentity(result) });
    return;
  }
  if (msg.tool !== 'call_tool') return;

  const context = msg.args?.session_context;
  if (!context?.session_id || !context?.workdir) {
    toolFailure(msg.callId, 'Cindy did not provide a session workspace for this claw-kit operation.', 'SESSION_CONTEXT_UNAVAILABLE');
    return;
  }
  if (!context.workdir_is_local) {
    toolFailure(msg.callId, 'claw-kit workflow operations require a local Cindy workspace.', 'LOCAL_WORKSPACE_REQUIRED');
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
    toolFailure(
      msg.callId,
      execution?.reason || execution?.error || 'claw-kit operation failed.',
      execution?.errorCode || 'CLAW_OPERATION_FAILED',
      execution,
    );
    return;
  }
  await applyProjection(context.session_id, execution, msg.callId);
  // Projection is Host-only lifecycle state. The Agent receives only the
  // operation result and its Cindy-safe guidance.
  const agentResult = execution.knowledgeDispatch && execution.result && typeof execution.result === 'object'
    ? { ...execution.result, knowledgeDispatch: execution.knowledgeDispatch }
    : execution.result;
  cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result: withCindyHostIdentity(agentResult) });
}

async function handleToolCall(msg) {
  try {
    await dispatchToolCall(msg);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    toolFailure(
      msg.callId,
      `claw-kit tool dispatch failed unexpectedly: ${reason}`,
      'CLAW_TOOL_DISPATCH_FAILED',
    );
  }
}

cindy.onHostMessage(async (msg) => {
  if (msg.type === 'tool-call') {
    await handleToolCall(msg);
    return;
  }
  if (msg.type !== 'event') return;

  if (msg.name === 'will-user-message') {
    cindy.send(await developmentEntryVerdict(msg));
    return;
  }

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
      if (!token) return;
      const goal = goalSessions.get(sessionId);
      if (!goal || goal.status !== 'active' || projection.planStatus !== 'process.active') return;
      if (goalAuthorizationCards.get(cardId) === true) {
        goalAuthorizationCards.delete(cardId);
        expandedWorkflowCards.set(cardId, false);
        cindy.send({ type: 'card-update', callId: cardId, v: 2, state: workflowCardState(projection), html: renderWorkflowCard(projection, false), height: workflowCardHeight(projection, false) });
      }
      await runAgentTurn(
        sessionId,
        goalContinuationPrompt(goal),
        { kind: 'claw-goal-click-continuation', planPath: goal.planPath, objective: goal.objective, sourceCardId: cardId },
        token,
      );
      return;
    }
    expandedWorkflowCards.set(cardId, expandedWorkflowCards.get(cardId) !== true);
    queueInteractiveCardUpdate(cardId, sessionId);
    return;
  }

  if (msg.name === 'did-turn-end') {
    await continueGoalAfterTurnEnd(msg);
    return;
  }

  if (msg.name === 'did-session-created') {
    const data = msg.data || {};
    if (data.sessionId) {
      traceHook('did-session-created', {
        sessionId: data.sessionId,
        phase: 'received',
        hasWorkdir: Boolean(data.workdir),
      });
      scheduleSessionBackground(data.sessionId, data.workdir);
    }
    return;
  }

  if (msg.name === 'did-session-switched') {
    const data = msg.data || {};
    const workdir = data.workdir || workdirs.get(data.sessionId);
    if (data.sessionId && workdir) {
      traceHook('did-session-switched', {
        sessionId: data.sessionId,
        phase: 'received',
        hasWorkdir: true,
      });
      void reconcileFocusedSession(data.sessionId, workdir);
    }
    return;
  }

});
