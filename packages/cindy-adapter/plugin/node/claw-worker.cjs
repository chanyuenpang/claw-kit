const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const { readTurnCaptureWithRetry } = require('./cindy-sqlite-reader.cjs');
const writerJobs = new Map();

const OPERATION_CATALOG = {
  plan: [
    {
      name: 'plan.create',
      description: 'Create a claw plan for the current Cindy session.',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Plan title.' },
          goal: { type: 'string', description: 'Optional plan goal.' },
          scope: { type: 'string', enum: ['project', 'session'], description: 'Optional plan scope.' },
          template: { type: 'string', description: 'Optional template name.' },
          templateFile: { type: 'string', description: 'Optional template file path.' },
        },
        required: ['title'],
      },
    },
    { name: 'plan.show', description: 'Show the session-bound plan.', mutates: false, parameters: objectParameters({ taskName: stringParameter('Optional task name.'), planFile: stringParameter('Optional plan file.') }) },
    {
      name: 'plan.start',
      description: 'Start the current plan, optionally supplying the planning fields required by the CLI.',
      mutates: true,
      parameters: objectParameters({
        taskName: stringParameter('Optional task name.'),
        requirements: stringParameter('Optional requirements summary.'),
        acceptance: { type: 'array', items: { type: 'string' }, description: 'Optional acceptance criteria.' },
        addTasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title'] }, description: 'Optional tasks to append before starting.' },
      }),
    },
    { name: 'plan.wait', description: 'Pause the current plan.', mutates: true, parameters: objectParameters({ taskName: stringParameter('Optional task name.') }) },
    { name: 'plan.resume', description: 'Resume the current plan.', mutates: true, parameters: objectParameters({ taskName: stringParameter('Optional task name.') }) },
    {
      name: 'plan.edit',
      description: 'Update supported plan fields or its status.',
      mutates: true,
      parameters: objectParameters({
        status: stringParameter('Optional plan status.'),
        goal: stringParameter('Optional goal text.'),
        summary: stringParameter('Optional plan summary.'),
        taskName: stringParameter('Optional task name.'),
      }),
    },
    {
      name: 'plan.done',
      description: 'Complete the current plan and save its retrospective.',
      mutates: true,
      parameters: objectParameters({
        retrospective: { type: 'string', description: 'Required retrospective summary.' },
        keyDecision: stringParameter('Optional durable decision.'),
      }, ['retrospective']),
    },
  ],
  task: [
    {
      name: 'task.add',
      description: 'Add a task to the current plan.',
      mutates: true,
      parameters: objectParameters({ title: stringParameter('Task title.'), detail: stringParameter('Optional task detail.'), taskName: stringParameter('Optional task name.') }, ['title']),
    },
    {
      name: 'task.edit',
      description: 'Update a task title, detail, or status.',
      mutates: true,
      parameters: objectParameters({ id: { type: 'number', description: 'Task id.' }, title: stringParameter('Optional task title.'), detail: stringParameter('Optional task detail.'), status: stringParameter('Optional task status.'), choice: stringParameter('Optional route choice when completing.'), taskName: stringParameter('Optional task name.') }, ['id']),
    },
    {
      name: 'task.done',
      description: 'Mark one task done.',
      mutates: true,
      parameters: objectParameters({ id: { type: 'number', description: 'Task id.' }, choice: stringParameter('Optional route choice.'), taskName: stringParameter('Optional task name.') }, ['id']),
    },
  ],
  subplan: [
    {
      name: 'subplan.create',
      description: 'Create a subplan for a parent task.',
      mutates: true,
      parameters: objectParameters({ parent: { type: 'string', description: 'Parent task name.' }, taskId: { type: 'number', description: 'Parent task id.' }, template: stringParameter('Optional template name.'), templateFile: stringParameter('Optional template file path.') }, ['parent', 'taskId']),
    },
  ],
  search: [
    {
      name: 'search',
      description: 'Search project knowledge with a query.',
      mutates: false,
      parameters: objectParameters({ query: { type: 'string', description: 'Search query.' } }, ['query']),
    },
  ],
};

// This operation is deliberately absent from the Agent-visible catalog.  Only
// the Host-dispatched knowledge writer receives its finalization id and may use
// it to acknowledge the already-claimed job.
const PRIVATE_OPERATIONS = [
  {
    name: 'knowledge.complete',
    mutates: true,
    parameters: objectParameters({ finalizeId: stringParameter('Finalization id supplied to the background writer.'), result: stringParameter('Concise closeout result.') }, ['finalizeId', 'result']),
  },
];

const OPERATIONS = new Map([...Object.values(OPERATION_CATALOG).flat(), ...PRIVATE_OPERATIONS].map((operation) => [operation.name, operation]));

function stringParameter(description) {
  return { type: 'string', description };
}

function objectParameters(properties, required = []) {
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

function invocation(args) {
  if (process.platform === 'win32') {
    return {
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'claw.cmd', ...args],
    };
  }
  return { executable: 'claw', args };
}

function runClaw(args, cwd, input, timeoutMs, sessionId) {
  return new Promise((resolve) => {
    const command = invocation(args);
    const child = spawn(command.executable, command.args, {
      cwd,
      env: {
        ...process.env,
        ...(sessionId ? { CLAW_SESSION_ID: sessionId } : {}),
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: 'claw CLI timed out.' });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `claw CLI is unavailable: ${error.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, error: stderr.trim() || `claw CLI exited with code ${code}.` });
        return;
      }
      // A session-start hook may intentionally have nothing to inject when no
      // workflow is bound. Treat its empty successful stdout as that outcome,
      // not as a malformed CLI response.
      if (!stdout.trim()) {
        resolve({ ok: true, output: {} });
        return;
      }
      try {
        resolve({ ok: true, output: JSON.parse(stdout.trim()) });
      } catch (error) {
        resolve({ ok: false, error: `claw CLI returned invalid JSON: ${error.message}` });
      }
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

function appendOption(command, flag, value) {
  if (value === undefined || value === null || value === '') return;
  command.push(flag, String(value));
}

function requiredString(args, name) {
  const value = typeof args[name] === 'string' ? args[name].trim() : '';
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredNumber(args, name) {
  const value = args[name];
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

function operationCommand(name, args) {
  switch (name) {
    case 'plan.create': {
      const command = ['plan', 'create', '--title', requiredString(args, 'title')];
      appendOption(command, '--goal', args.goal);
      appendOption(command, '--scope', args.scope);
      appendOption(command, '--template', args.template);
      appendOption(command, '--template-file', args.templateFile);
      return command;
    }
    case 'plan.show': return withPlanTarget(['plan', 'show'], args);
    case 'plan.start': {
      const command = withPlanTarget(['plan', 'start'], args);
      appendOption(command, '--requirements', args.requirements);
      appendRepeatedOption(command, '--acceptance', args.acceptance);
      appendAddedTasks(command, args.addTasks);
      return command;
    }
    case 'plan.wait': return withPlanTarget(['plan', 'wait'], args);
    case 'plan.resume': return withPlanTarget(['plan', 'resume'], args);
    case 'plan.edit': {
      const command = withPlanTarget(['plan', 'edit'], args);
      appendOption(command, '--status', args.status);
      appendOption(command, '--goal', args.goal);
      appendOption(command, '--summary', args.summary);
      return command;
    }
    case 'plan.done': {
      const command = ['plan', 'done', '--retrospective', requiredString(args, 'retrospective')];
      appendOption(command, '--key-decision', args.keyDecision);
      return command;
    }
    case 'task.add': {
      const command = ['task', 'add', '--title', requiredString(args, 'title')];
      appendOption(command, '--detail', args.detail);
      appendOption(command, '--task-name', args.taskName);
      return command;
    }
    case 'task.edit': {
      const command = ['task', 'edit', '--id', String(requiredNumber(args, 'id'))];
      appendOption(command, '--title', args.title);
      appendOption(command, '--detail', args.detail);
      appendOption(command, '--status', args.status);
      appendOption(command, '--choice', args.choice);
      appendOption(command, '--task-name', args.taskName);
      return command;
    }
    case 'task.done': {
      const command = ['task', 'done', '--id', String(requiredNumber(args, 'id'))];
      appendOption(command, '--choice', args.choice);
      appendOption(command, '--task-name', args.taskName);
      return command;
    }
    case 'subplan.create': {
      const command = ['subplan', 'create', '--parent', requiredString(args, 'parent'), '--task-id', String(requiredNumber(args, 'taskId'))];
      appendOption(command, '--template', args.template);
      appendOption(command, '--template-file', args.templateFile);
      return command;
    }
    case 'search': return ['search', '--query', requiredString(args, 'query')];
    case 'knowledge.complete': {
      const finalizeId = requiredString(args, 'finalizeId');
      const job = writerJobs.get(finalizeId);
      if (!job) throw new Error('Knowledge finalization job is unavailable or has already been acknowledged.');
      return [
        'knowledge', 'done',
        '--job', job.jobPath,
        '--claim-token', job.claimToken,
        '--status', 'succeeded',
        '--result', requiredString(args, 'result'),
      ];
    }
    default: throw new Error(`Unknown claw-kit operation: ${name}`);
  }
}

function withPlanTarget(command, args) {
  appendOption(command, '--task-name', args.taskName);
  appendOption(command, '--plan-file', args.planFile);
  return command;
}

function appendRepeatedOption(command, flag, values) {
  if (!Array.isArray(values)) return;
  for (const value of values) appendOption(command, flag, typeof value === 'string' ? value : undefined);
}

function appendAddedTasks(command, tasks) {
  if (!Array.isArray(tasks)) return;
  for (const task of tasks) {
    const title = typeof task?.title === 'string' ? task.title.trim() : '';
    if (!title) throw new Error('Each addTasks entry requires a title.');
    command.push('--add-task', title);
    appendOption(command, '--detail', typeof task?.detail === 'string' ? task.detail : undefined);
  }
}

function projectionFor(output) {
  const planStatus = output && typeof output.planStatus === 'string' ? output.planStatus : null;
  if (!planStatus) return null;
  const plan = output.plan && typeof output.plan === 'object' ? output.plan : null;
  const planView = output.planView && typeof output.planView === 'object' ? output.planView : null;
  // The Cindy card follows the CLI's presentation order.  In particular this
  // keeps unfinished tasks ahead of completed planning work.
  const tasks = Array.isArray(planView?.tasks?.items) ? planView.tasks.items : Array.isArray(plan?.tasks) ? plan.tasks : [];
  const summary = typeof output.planSummary === 'string'
    ? output.planSummary
    : typeof planView?.collapsedSummary === 'string' ? planView.collapsedSummary : '';
  const summaryMatch = summary.match(/^\s*(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  const completedTasks = Number.isInteger(planView?.counts?.completed)
    ? planView.counts.completed
    : summaryMatch ? Number(summaryMatch[1]) : tasks.filter((task) => task?.status === 'done').length;
  const totalTasks = Number.isInteger(planView?.counts?.total)
    ? planView.counts.total
    : summaryMatch ? Number(summaryMatch[2]) : tasks.length;
  const title = typeof plan?.title === 'string'
    ? plan.title
    : typeof planView?.title === 'string'
      ? planView.title
      : summaryMatch?.[3]?.trim();
  const goal = typeof plan?.goal?.text === 'string'
    ? plan.goal.text
    : typeof planView?.goal?.text === 'string' ? planView.goal.text : undefined;
  // `nextTask` is guidance and can be omitted by some plan mutations.  The
  // card needs a stable execution subject, so derive it from canonical plan
  // tasks first: an explicitly running task wins, then the next pending task.
  const currentTask = tasks.find((task) => task?.status === 'in_progress')
    || tasks.find((task) => task?.status === 'pending')
    || (output.nextTask && typeof output.nextTask === 'object' ? output.nextTask : undefined);
  const card = {
    ...(typeof output.planPath === 'string' ? { planPath: output.planPath } : {}),
    ...(title ? { title } : {}),
    ...(goal ? { goal } : {}),
    completedTasks,
    totalTasks,
    ...(tasks.length ? {
      tasks: tasks.map((task) => ({
        ...(Number.isInteger(task?.id) ? { id: task.id } : {}),
        ...(typeof task?.title === 'string' ? { title: task.title } : {}),
        ...(typeof task?.status === 'string' ? { status: task.status } : {}),
      })),
    } : {}),
    ...(currentTask ? {
      currentTask: {
        ...(Number.isInteger(currentTask.id) ? { id: currentTask.id } : {}),
        ...(typeof currentTask.title === 'string' ? { title: currentTask.title } : {}),
        ...(typeof currentTask.status === 'string' ? { status: currentTask.status } : {}),
      },
    } : {}),
    ...(output.nextTask && typeof output.nextTask === 'object' ? { nextTask: output.nextTask } : {}),
  };
  if (planStatus === 'process.active') return { goal: 'resume', planStatus, ...(typeof output.planPath === 'string' ? { planPath: output.planPath } : {}), card };
  if (planStatus === 'process.wait' || planStatus === 'process.discussing') return { goal: 'pause', planStatus, ...(typeof output.planPath === 'string' ? { planPath: output.planPath } : {}), card };
  if (planStatus === 'end.completed') return {
    goal: 'complete',
    planStatus,
    ...(typeof output.planPath === 'string' ? { planPath: output.planPath } : {}),
    closeout: true,
    completionKey: `${output.planPath || ''}:${output.achievement?.completedAt || ''}`, card,
  };
  if (planStatus === 'end.closed' || planStatus === 'end.leave') return { goal: 'stop', planStatus, ...(typeof output.planPath === 'string' ? { planPath: output.planPath } : {}), card };
  return { goal: 'none', planStatus, ...(typeof output.planPath === 'string' ? { planPath: output.planPath } : {}), card };
}

// The Agent sees a Cindy workflow contract, never raw CLI/Host integration
// instructions. The Worker already owns host selection, session binding,
// command execution, closeout dispatch, and future Goal projection.
function cindyAgentResult(output) {
  if (!output || typeof output !== 'object') return output;
  const {
    hostActions: _hostActions,
    commandHints: rawCommandHints,
    goalMode: _goalMode,
    goalTool: _goalTool,
    nextsteps: _nextsteps,
    notes: _notes,
    planView: _planView,
    ...result
  } = output;
  const planStatus = typeof output.planStatus === 'string' ? output.planStatus : '';
  const nextTask = output.nextTask && typeof output.nextTask === 'object' ? output.nextTask : undefined;
  const askUser = output.askUser && typeof output.askUser === 'object' ? output.askUser : undefined;
  const guidance = cindyGuidance(planStatus, nextTask, askUser, rawCommandHints);
  return { ...result, ...(guidance ? { guidance } : {}) };
}

function cindyGuidance(planStatus, nextTask, askUser, rawCommandHints) {
  const nextStep = {
    'prepare.requirements': 'Clarify the requirements, then update the plan through claw-kit tools.',
    'prepare.review': 'Review the plan with the user; start it through claw-kit tools only after approval.',
    'process.discussing': 'Resolve the open workflow question before advancing the plan.',
    'process.active': 'Work on the current plan task, then record its completion through claw-kit tools.',
    'process.wait': 'Wait for the user or dependency to resume this workflow.',
    'end.completed': 'The workflow is complete. No further plan action is required in this turn.',
    'end.closed': 'The workflow is closed. Do not continue it automatically.',
    'end.leave': 'The workflow was left. Do not continue it automatically.',
  }[planStatus];
  const commandHints = Array.isArray(rawCommandHints)
    ? rawCommandHints.map((hint) => commandHintToWorkerInstruction(hint, nextTask)).filter(Boolean)
    : [];
  if (!nextStep && !nextTask && !askUser && commandHints.length === 0) return null;
  return {
    ...(nextStep ? { nextStep } : {}),
    ...(nextTask ? { nextTask } : {}),
    ...(askUser ? { askUser } : {}),
    ...(commandHints.length ? { commandHints } : {}),
  };
}

function commandHintToWorkerInstruction(hint, nextTask) {
  if (typeof hint !== 'string') return null;
  const normalized = hint.replace(/`/g, '').trim();
  const instruction = (operation, args, description, requiredArgs = []) => ({
    tool: 'call_tool',
    arguments: { name: operation, ...(Object.keys(args).length ? { args } : {}) },
    ...(requiredArgs.length ? { requiredArgs } : {}),
    description,
  });
  if (/^claw plan resume\b/.test(normalized)) {
    return instruction('plan.resume', {}, 'Resume the current workflow.');
  }
  if (/^claw plan start\b/.test(normalized)) {
    return instruction('plan.start', {}, 'Start the current plan after supplying any required planning fields.');
  }
  if (/^claw plan done\b/.test(normalized)) {
    return instruction('plan.done', {}, 'Complete the plan after providing its retrospective.', ['retrospective']);
  }
  if (/^claw task done\b/.test(normalized)) {
    const id = normalized.match(/--id\s+(\d+)/)?.[1];
    const args = id ? { id: Number(id) } : Number.isInteger(nextTask?.id) ? { id: nextTask.id } : {};
    return instruction('task.done', args, 'Record completion for the indicated task.', Object.keys(args).length ? [] : ['id']);
  }
  if (/^claw task edit\b/.test(normalized)) {
    const id = normalized.match(/--id\s+(\d+)/)?.[1];
    const status = normalized.match(/--status\s+([^\s]+)/)?.[1];
    const args = {
      ...(id ? { id: Number(id) } : Number.isInteger(nextTask?.id) ? { id: nextTask.id } : {}),
      ...(status ? { status } : {}),
    };
    return instruction('task.edit', args, 'Update the indicated task.', 'id' in args ? [] : ['id']);
  }
  const status = normalized.match(/^claw plan edit\b.*--status\s+([^\s]+)/)?.[1];
  if (status) {
    return instruction('plan.edit', { status }, 'Update the current plan status.');
  }
  if (/^claw search\b/.test(normalized)) {
    return instruction('search', {}, 'Search project knowledge.', ['query']);
  }
  // Hints without a matching Cindy operation (for example plan sync) are
  // Host/Worker concerns and intentionally stay out of the Agent contract.
  return null;
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  const params = request.params || {};
  if (request.method === 'claw/catalog') {
    reply(request.id, { categories: Object.entries(OPERATION_CATALOG).map(([name, operations]) => ({ name, operations })) });
    return;
  }
  if (request.method === 'claw/session-start') {
    const result = await runClaw(
      ['hook', 'auto-claw', '--host', 'cindy'],
      params.workdir,
      JSON.stringify({ cwd: params.workdir, session_id: params.sessionId }),
      10000,
      params.sessionId,
    );
    const context = result.output?.hookSpecificOutput?.additionalContext;
    reply(request.id, {
      ...(typeof context === 'string' && context.trim() ? { context } : {}),
      ...(projectionFor(result.output) ? { projection: projectionFor(result.output) } : {}),
      ...(result.error ? { error: result.error } : {}),
    });
    return;
  }
  if (request.method === 'claw/session-background') {
    const result = await runClaw(
      ['internal-background-maintenance', '--cwd', params.workdir, '--session-key', params.sessionId],
      params.workdir,
      JSON.stringify({ cwd: params.workdir, session_id: params.sessionId }),
      10000,
      params.sessionId,
    );
    reply(request.id, result.ok ? { ok: true } : { ok: false, error: result.error });
    return;
  }
  if (request.method === 'claw/capture-report') {
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
    const workdir = typeof params.workdir === 'string' ? params.workdir : '';
    const captureInput = await readTurnCaptureWithRetry(sessionId);
    if (!captureInput) {
      reply(request.id, { ok: true, captured: false, error: 'Cindy SQLite did not expose a completed assistant message yet.' });
      return;
    }
    const { turnId, message, taskConclusions } = captureInput;
    const result = await runClaw(
      ['internal-knowledge-capture', '--host', 'cindy'],
      workdir,
      JSON.stringify({ cwd: workdir, session_id: sessionId, turn_id: turnId, message, task_conclusions: taskConclusions }),
      10000,
      sessionId,
    );
    reply(request.id, result.ok
      ? { ok: true, turnId, message, ...(result.output || {}) }
      : { ok: false, error: result.error });
    return;
  }
  if (request.method === 'claw/register-knowledge-writer') {
    const finalizeId = typeof params.finalizeId === 'string' ? params.finalizeId : '';
    const jobPath = typeof params.jobPath === 'string' ? params.jobPath : '';
    const executorSessionId = typeof params.sessionId === 'string' ? params.sessionId.trim() : '';
    if (!finalizeId || !jobPath || !executorSessionId) {
      reply(request.id, { ok: false, error: 'finalizeId, jobPath, and executor session id are required.' });
      return;
    }
    const claimed = await runClaw(['knowledge', 'claim', '--job', jobPath], params.workdir, undefined, 10000, executorSessionId);
    if (!claimed.ok || !claimed.output?.claimed || typeof claimed.output.claimToken !== 'string') {
      reply(request.id, { ok: false, error: claimed.error || 'Knowledge finalization job is already claimed.' });
      return;
    }
    writerJobs.set(finalizeId, { jobPath, sessionId: executorSessionId, claimToken: claimed.output.claimToken });
    reply(request.id, { ok: true });
    return;
  }
  if (request.method === 'claw/fail-knowledge-writer') {
    const jobPath = typeof params.jobPath === 'string' ? params.jobPath : '';
    let job;
    try { job = JSON.parse(fs.readFileSync(jobPath, 'utf8')); } catch {
      reply(request.id, { ok: false, error: 'Knowledge finalization job is unavailable.' });
      return;
    }
    const executorSessionId = typeof params.sessionId === 'string' ? params.sessionId.trim() : '';
    if (!executorSessionId) {
      reply(request.id, { ok: false, error: 'Knowledge finalization executor session id is unavailable.' });
      return;
    }
    let claimToken = typeof job.claimToken === 'string' ? job.claimToken : '';
    if (!claimToken) {
      const claimed = await runClaw(['knowledge', 'claim', '--job', jobPath], params.workdir, undefined, 10000, executorSessionId);
      claimToken = typeof claimed.output?.claimToken === 'string' ? claimed.output.claimToken : '';
      if (!claimed.ok || !claimToken) {
        reply(request.id, { ok: false, error: claimed.error || 'Knowledge finalization claim failed.' });
        return;
      }
    }
    const result = await runClaw([
      'knowledge', 'done',
      '--job', jobPath,
      '--claim-token', claimToken,
      '--status', 'failed',
      '--error', params.message || 'Cindy background writer could not start.',
    ], params.workdir, undefined, 10000, executorSessionId);
    reply(request.id, result.ok ? { ok: true } : { ok: false, error: result.error });
    return;
  }
  if (request.method === 'claw/execute') {
    const operation = typeof params.operation === 'string' ? params.operation : '';
    const specification = OPERATIONS.get(operation);
    if (!specification) {
      reply(request.id, { ok: false, error: `Unknown operation: ${operation}` });
      return;
    }
    if (params.readOnly && specification.mutates) {
      reply(request.id, { ok: false, operation, error: 'The current Cindy workspace is read-only.' });
      return;
    }
    try {
      const command = operationCommand(operation, params.args && typeof params.args === 'object' ? params.args : {});
      const result = await runClaw([...command, '--host', 'cindy'], params.workdir, undefined, 30000, params.sessionId);
      if (!result.ok) {
        reply(request.id, { ok: false, operation, error: result.error });
        return;
      }
      reply(request.id, {
        ok: true,
        operation,
        result: cindyAgentResult(result.output),
        ...(projectionFor(result.output) ? { projection: projectionFor(result.output) } : {}),
      });
      if (operation === 'knowledge.complete' && result.output?.completed) {
        writerJobs.delete(String(params.args?.finalizeId || ''));
      }
    } catch (error) {
      reply(request.id, { ok: false, operation, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  reply(request.id, { ok: false, error: 'Unknown claw worker method' });
});
