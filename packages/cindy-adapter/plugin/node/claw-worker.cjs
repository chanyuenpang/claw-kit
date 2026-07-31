const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const { readTurnCaptureWithRetry } = require('./cindy-sqlite-reader.cjs');
const sessions = new Map();

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

class NativeClawSession {
  constructor(sessionId, workdir) {
    this.sessionId = sessionId;
    this.workdir = path.resolve(workdir);
    this.child = null;
    this.stderr = '';
    this.buffer = '';
    this.pending = null;
    this.openPromise = null;
    this.closed = false;
    this.chain = Promise.resolve();
  }

  open() {
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise((resolve, reject) => {
      const command = invocation(['session', 'open', this.workdir, this.sessionId, '--host', 'cindy']);
      const child = spawn(command.executable, command.args, {
        cwd: this.workdir,
        env: process.env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;
      const timer = setTimeout(() => {
        this.failPending(sessionError('CLAW_SESSION_OPEN_TIMEOUT', 'claw session open timed out.', 'known'));
        child.kill();
      }, 5000);
      this.pending = {
        resolve: (value) => {
          clearTimeout(timer);
          if (!value?.ok || value.command !== 'session.open') {
            reject(sessionResponseError(value, 'CLAW_SESSION_OPEN_FAILED'));
            return;
          }
          resolve(this);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      child.stdout.on('data', (chunk) => this.consume(String(chunk)));
      child.stderr.on('data', (chunk) => {
        this.stderr = (this.stderr + String(chunk)).slice(-8192);
      });
      child.on('error', (error) => {
        this.closed = true;
        this.failPending(sessionError('CLAW_CLI_UNAVAILABLE', `claw CLI is unavailable: ${error.message}`, 'known'));
      });
      child.on('close', (code) => {
        this.closed = true;
        const detail = this.stderr.trim();
        this.failPending(sessionError(
          'SESSION_CONNECTION_LOST',
          detail || `claw session exited with code ${String(code)}.`,
          'unknown',
        ));
      });
    });
    return this.openPromise;
  }

  consume(chunk) {
    this.buffer += chunk;
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let value;
      try { value = JSON.parse(line); } catch {
        this.failPending(sessionError('CLAW_CLI_INVALID_JSON', 'claw session returned invalid JSON.', 'unknown'));
        continue;
      }
      const pending = this.pending;
      this.pending = null;
      pending?.resolve(value);
    }
  }

  request(request, timeoutMs = 30000) {
    const execute = async () => {
      await this.open();
      if (this.closed || !this.child?.stdin?.writable) {
        throw sessionError('SESSION_CONNECTION_LOST', 'claw session connection is unavailable.', 'known');
      }
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending = null;
          this.child?.kill();
          reject(sessionError('CLAW_SESSION_TIMEOUT', `claw session command timed out after ${timeoutMs}ms.`, 'unknown'));
        }, timeoutMs);
        this.pending = {
          resolve: (value) => {
            clearTimeout(timer);
            if (!value?.ok) reject(sessionResponseError(value, 'CLAW_OPERATION_FAILED'));
            else resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
          if (!error) return;
          const pending = this.pending;
          this.pending = null;
          pending?.reject(sessionError('SESSION_CONNECTION_LOST', error.message, 'known'));
        });
      });
    };
    const result = this.chain.then(execute, execute);
    this.chain = result.catch(() => undefined);
    return result;
  }

  close() {
    if (this.closed || !this.child) return Promise.resolve();
    return new Promise((resolve) => {
      const child = this.child;
      const timer = setTimeout(() => {
        if (!this.closed) child.kill();
        resolve();
      }, 1000);
      child.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      if (child.stdin.writable) child.stdin.write('session close\n');
      else child.kill();
    });
  }

  failPending(error) {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }
}

function sessionError(code, message, outcome) {
  const error = new Error(message);
  error.code = code;
  error.outcome = outcome;
  return error;
}

function sessionResponseError(response, fallbackCode) {
  const raw = response?.error;
  if (raw && typeof raw === 'object') {
    return sessionError(
      typeof raw.code === 'string' ? raw.code : fallbackCode,
      typeof raw.message === 'string' ? raw.message : fallbackCode,
      raw.outcome === 'unknown' ? 'unknown' : 'known',
    );
  }
  return sessionError(fallbackCode, typeof raw === 'string' ? raw : fallbackCode, 'known');
}

function validateSessionIdentity(sessionId, workdir) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw sessionError('SESSION_IDENTITY_UNAVAILABLE', 'Cindy did not provide a session id.', 'known');
  }
  if (typeof workdir !== 'string' || !workdir.trim()) {
    throw sessionError('SESSION_WORKDIR_UNAVAILABLE', 'Cindy did not provide a workdir for this session.', 'known');
  }
  const resolved = path.resolve(workdir);
  try {
    if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
  } catch {
    throw sessionError('SESSION_WORKDIR_INVALID', `Cindy session workdir is not an accessible directory: ${workdir}`, 'known');
  }
  return { sessionId: sessionId.trim(), workdir: resolved };
}

async function ensureSession(sessionId, workdir) {
  const identity = validateSessionIdentity(sessionId, workdir);
  const key = `${identity.workdir}\0${identity.sessionId}`;
  let session = sessions.get(key);
  if (!session || session.closed) {
    session = new NativeClawSession(identity.sessionId, identity.workdir);
    sessions.set(key, session);
    try {
      await session.open();
    } catch (error) {
      if (sessions.get(key) === session) sessions.delete(key);
      throw error;
    }
  }
  return session;
}

let shuttingDown = false;
async function shutdownWorker() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.allSettled([...sessions.values()].map((session) => session.close()));
  process.exit(0);
}
process.on('SIGINT', () => { void shutdownWorker(); });
process.on('SIGTERM', () => { void shutdownWorker(); });

function sessionRequest(name, args) {
  switch (name) {
    case 'plan.create': return { operation: name, input: {
      title: requiredString(args, 'title'),
      ...(typeof args.goal === 'string' ? { goalText: args.goal } : {}),
      ...(args.scope === 'project' || args.scope === 'session' ? { scope: args.scope } : {}),
      ...(typeof args.template === 'string' ? { templateName: args.template } : {}),
      ...(typeof args.templateFile === 'string' ? { templateFile: path.resolve(args.templateFile) } : {}),
    } };
    case 'plan.show': return { operation: name, input: { simple: false } };
    case 'plan.start': {
      const updates = {
        ...(typeof args.requirements === 'string' ? { requirementsSummary: args.requirements } : {}),
        ...(Array.isArray(args.acceptance) ? { acceptanceCriteria: args.acceptance } : {}),
      };
      return { operation: name, input: {
        ...(Object.keys(updates).length ? { updates } : {}),
        ...(Array.isArray(args.addTasks) ? { appendTasks: args.addTasks } : {}),
      } };
    }
    case 'plan.wait': return { operation: name, input: {} };
    case 'plan.resume': return { operation: 'plan.edit', input: { operations: [{ type: 'plan.status', status: 'process.active' }] } };
    case 'plan.edit': {
      const updates = {};
      if (typeof args.goal === 'string') updates.goalText = args.goal;
      if (typeof args.summary === 'string') updates.planSummary = args.summary;
      const operations = [];
      if (Object.keys(updates).length) operations.push({ type: 'plan.update', updates });
      if (typeof args.status === 'string') operations.push({ type: 'plan.status', status: args.status });
      return { operation: name, input: { operations } };
    }
    case 'plan.done': return { operation: name, input: {
      retrospectiveSummary: requiredString(args, 'retrospective'),
      ...(typeof args.keyDecision === 'string' ? { keyDecisions: [args.keyDecision] } : {}),
    } };
    case 'task.add': return { operation: name, input: { tasks: [{ title: requiredString(args, 'title'), ...(typeof args.detail === 'string' ? { detail: args.detail } : {}) }] } };
    case 'task.edit': return { operation: name, input: {
      taskId: requiredNumber(args, 'id'),
      ...(typeof args.title === 'string' ? { taskTitle: args.title } : {}),
      ...(typeof args.detail === 'string' ? { taskDetail: args.detail } : {}),
      ...(typeof args.status === 'string' ? { taskStatus: args.status } : {}),
      ...(typeof args.choice === 'string' ? { taskChoiceId: args.choice } : {}),
    } };
    case 'task.done': return { operation: name, input: { tasks: [{ id: requiredNumber(args, 'id'), ...(typeof args.choice === 'string' ? { choiceId: args.choice } : {}) }] } };
    case 'subplan.create': return { operation: name, input: {
      parentTaskName: requiredString(args, 'parent'),
      parentTaskId: requiredNumber(args, 'taskId'),
      ...(typeof args.template === 'string' ? { templateName: args.template } : {}),
      ...(typeof args.templateFile === 'string' ? { templateFile: path.resolve(args.templateFile) } : {}),
    } };
    case 'search': return { operation: name, input: { query: requiredString(args, 'query') } };
    default: throw new Error(`Operation ${name} is not available through a claw session.`);
  }
}

function runClaw(args, cwd, input, timeoutMs, sessionId) {
  return new Promise((resolve) => {
    if (typeof cwd !== 'string' || !cwd.trim()) {
      resolve({
        ok: false,
        errorCode: 'SESSION_WORKDIR_UNAVAILABLE',
        reason: 'Cindy did not provide a workdir for this session.',
      });
      return;
    }
    try {
      if (!fs.statSync(cwd).isDirectory()) throw new Error('not a directory');
    } catch {
      resolve({
        ok: false,
        errorCode: 'SESSION_WORKDIR_INVALID',
        reason: `Cindy session workdir is not an accessible directory: ${cwd}`,
      });
      return;
    }
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
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        errorCode: 'CLAW_CLI_TIMEOUT',
        reason: `claw CLI timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      finish({
        ok: false,
        errorCode: 'CLAW_CLI_UNAVAILABLE',
        reason: `claw CLI is unavailable: ${error.message}`,
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const failure = operationFailure(stderr, 'CLAW_CLI_EXITED');
        finish({
          ok: false,
          errorCode: failure.errorCode,
          reason: failure.errorCode === 'CLAW_CLI_EXITED'
            ? (stderr.trim()
              ? `claw CLI exited with code ${code}: ${failure.reason}`
              : `claw CLI exited with code ${code} without stderr output.`)
            : failure.reason,
          exitCode: code,
        });
        return;
      }
      // A session-start hook may intentionally have nothing to inject when no
      // workflow is bound. Treat its empty successful stdout as that outcome,
      // not as a malformed CLI response.
      if (!stdout.trim()) {
        finish({ ok: true, output: {} });
        return;
      }
      try {
        finish({ ok: true, output: JSON.parse(stdout.trim()) });
      } catch (error) {
        finish({
          ok: false,
          errorCode: 'CLAW_CLI_INVALID_JSON',
          reason: `claw CLI returned invalid JSON: ${error.message}`,
        });
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

function operationFailure(rawReason, fallbackCode = 'CLAW_OPERATION_FAILED') {
  const reason = typeof rawReason === 'string' && rawReason.trim()
    ? rawReason.trim()
    : 'claw-kit operation failed.';
  try {
    const parsed = JSON.parse(reason);
    const error = parsed?.error;
    const errorCode = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
      ? error.code
      : fallbackCode;
    const message = typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim()
      : reason;
    return { errorCode, reason: message };
  } catch {
    return { errorCode: fallbackCode, reason };
  }
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
      throw new Error('knowledge.complete must be routed through the durable writer supervisor.');
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

const rpcInput = readline.createInterface({ input: process.stdin });
rpcInput.on('line', async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  const params = request.params || {};
  if (request.method === 'claw/catalog') {
    reply(request.id, { categories: Object.entries(OPERATION_CATALOG).map(([name, operations]) => ({ name, operations })) });
    return;
  }
  if (request.method === 'claw/session-start') {
    try {
      await ensureSession(params.sessionId, params.workdir);
    } catch (error) {
      reply(request.id, {
        ok: false,
        errorCode: error?.code || 'CLAW_SESSION_OPEN_FAILED',
        reason: error instanceof Error ? error.message : String(error),
        errorPrompt: `${error instanceof Error ? error.message : String(error)} Install or update the claw CLI, then retry this message.`,
      });
      return;
    }
    const result = await runClaw(
      ['hook', 'auto-claw', '--host', 'cindy'],
      params.workdir,
      JSON.stringify({ cwd: params.workdir, session_id: params.sessionId }),
      2000,
      params.sessionId,
    );
    if (!result.ok) {
      reply(request.id, {
        ok: false,
        errorCode: result.errorCode,
        reason: result.reason,
        errorPrompt: `${result.reason} Install or update the claw CLI, then retry this message.`,
      });
      return;
    }
    const reconciliation = await runClaw([
      'knowledge', 'list',
      '--project-root', params.workdir,
      '--session-key', params.sessionId,
      '--job-host', 'cindy',
    ], params.workdir, undefined, 10000, params.sessionId);
    const context = result.output?.hookSpecificOutput?.additionalContext;
    reply(request.id, {
      ok: true,
      ...(typeof context === 'string' && context.trim() ? { context } : {}),
      ...(projectionFor(result.output) ? { projection: projectionFor(result.output) } : {}),
      ...(Array.isArray(reconciliation.output?.jobs) ? { knowledgeJobs: reconciliation.output.jobs } : {}),
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
    let persisted;
    try { persisted = JSON.parse(fs.readFileSync(jobPath, 'utf8')); } catch {
      reply(request.id, { ok: false, error: 'Knowledge finalization job is unavailable.' });
      return;
    }
    if (persisted.finalizeId !== finalizeId || persisted.host !== 'cindy') {
      reply(request.id, { ok: false, error: 'Knowledge finalization job does not belong to this Cindy closeout.' });
      return;
    }
    if (persisted.status === 'succeeded') {
      reply(request.id, { ok: true, alreadyCompleted: true });
      return;
    }
    if (persisted.status === 'running' && typeof persisted.claimToken === 'string' && persisted.claimToken) {
      reply(request.id, { ok: true, resumed: true });
      return;
    }
    const claimed = await runClaw(['knowledge', 'claim', '--job', jobPath], params.workdir, undefined, 10000, executorSessionId);
    if (!claimed.ok || !claimed.output?.claimed || typeof claimed.output.claimToken !== 'string') {
      reply(request.id, { ok: false, error: claimed.error || 'Knowledge finalization job is not claimable.' });
      return;
    }
    reply(request.id, { ok: true, claimed: true });
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
      reply(request.id, {
        ok: false,
        operation,
        errorCode: 'UNKNOWN_OPERATION',
        reason: `Unknown claw-kit operation: ${operation || '(empty)'}.`,
      });
      return;
    }
    if (params.readOnly && specification.mutates) {
      reply(request.id, {
        ok: false,
        operation,
        errorCode: 'WORKSPACE_READ_ONLY',
        reason: 'The current Cindy workspace is read-only.',
      });
      return;
    }
    try {
      const operationArgs = params.args && typeof params.args === 'object' ? params.args : {};
      let output;
      let envelope = {};
      if (operation === 'knowledge.complete') {
        const finalizeId = requiredString(operationArgs, 'finalizeId');
        const resultText = requiredString(operationArgs, 'result');
        const located = await runClaw([
          'knowledge', 'wait',
          '--project-root', params.workdir,
          '--session-key', params.sessionId,
          '--finalize-id', finalizeId,
          '--timeout-ms', '0',
          '--host', 'cindy',
        ], params.workdir, undefined, 10000, params.sessionId);
        if (!located.ok || typeof located.output?.jobPath !== 'string') {
          reply(request.id, {
            ok: false,
            operation,
            errorCode: located.errorCode || 'KNOWLEDGE_JOB_UNAVAILABLE',
            reason: located.reason || 'Knowledge finalization job is unavailable.',
          });
          return;
        }
        const result = await runClaw([
          'internal-knowledge-complete',
          '--job', located.output.jobPath,
          '--result', resultText,
          '--host', 'cindy',
        ], params.workdir, undefined, 30000, params.sessionId);
        if (!result.ok) {
          reply(request.id, {
            ok: false,
            operation,
            errorCode: result.errorCode,
            reason: result.reason,
          });
          return;
        }
        output = result.output;
      } else {
        const session = await ensureSession(params.sessionId, params.workdir);
        const response = await session.request(sessionRequest(operation, operationArgs));
        output = response.output;
        envelope = {
          ...(Array.isArray(response.hostActions) ? { hostActions: response.hostActions } : {}),
          ...(Array.isArray(response.postCommitEffects) ? { postCommitEffects: response.postCommitEffects } : {}),
          ...(response.knowledgeDispatch ? { knowledgeDispatch: response.knowledgeDispatch } : {}),
        };
      }
      reply(request.id, {
        ok: true,
        operation,
        result: cindyAgentResult(output),
        ...(projectionFor(output) ? { projection: projectionFor(output) } : {}),
        ...envelope,
      });
    } catch (error) {
      const structured = typeof error?.code === 'string'
        ? { errorCode: error.code, reason: error.message }
        : operationFailure(error instanceof Error ? error.message : String(error), 'INVALID_OPERATION_ARGUMENTS');
      reply(request.id, {
        ok: false,
        operation,
        ...structured,
      });
    }
    return;
  }
  reply(request.id, {
    ok: false,
    errorCode: 'UNKNOWN_WORKER_METHOD',
    reason: `Unknown claw worker method: ${request.method || '(empty)'}.`,
  });
});
rpcInput.on('close', () => { void shutdownWorker(); });
