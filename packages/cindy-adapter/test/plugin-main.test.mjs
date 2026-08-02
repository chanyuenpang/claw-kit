import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pluginMainPath = path.join(testDir, '..', 'plugin', 'main.js');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createHarness({ queryResults, executionPolicy = 'background', inspectedStatus = 'succeeded', inspectedError, knowledgeDispatch, executions = [] }) {
  const hostMessages = [];
  const nodeRequests = [];
  const agentRequests = [];
  const errandRequests = [];
  const errandQueries = [];
  const sent = [];
  const timers = [];
  const sessionId = 'cindy-session-1';
  const finalizeId = 'a'.repeat(64);
  const jobPath = 'C:\\runtime\\task\\.runtime\\knowledge-finalization\\finalize-1.json';
  const projection = {
    planStatus: 'end.completed',
    goal: 'complete',
    planPath: 'C:\\runtime\\task\\plan.json',
    card: {
      goal: 'Verify Cindy knowledge errand',
      totalTasks: 1,
      completedTasks: 1,
      currentTask: null,
      tasks: [{ id: 1, title: 'Complete verification', status: 'done' }],
    },
  };

  const cindy = {
    onHostMessage(handler) {
      hostMessages.push(handler);
    },
    send(payload) {
      sent.push(payload);
      return Promise.resolve({ ok: true });
    },
    node: {
      async request({ method, params }) {
        nodeRequests.push({ method, params });
        if (method === 'claw/execute') {
          if (executions.length > 0) return executions.shift();
          return {
            ok: true,
            result: {
              ok: true,
              operation: 'plan.done',
              result: {},
              projection,
              ...(knowledgeDispatch ? { knowledgeDispatch } : {}),
            },
          };
        }
        if (method === 'claw/catalog') {
          return { ok: true, result: { categories: [{ name: 'plan', operations: [] }] } };
        }
        if (method === 'claw/resolve-session-context') {
          return { ok: true, result: { ok: true, workdir: 'D:\\repo', clawSessionId: sessionId, planPath: projection.planPath } };
        }
        if (method === 'claw/capture-report') {
          return { ok: true, result: { ok: true, captured: true, turnId: 'turn-1', finalizeId, jobPath } };
        }
        if (method === 'claw/register-knowledge-writer') {
          return {
            ok: true,
            result: {
              ok: true,
              claimed: true,
              finalizeId,
              claimToken: 'claim-1',
              templatePath: 'C:\\runtime\\task\\assignments.json',
              projectRoot: 'D:\\repo',
              planPath: projection.planPath,
              reportPath: 'C:\\runtime\\task\\plan.report',
              writer: { executionPolicy, externalSkills: [] },
            },
          };
        }
        if (method === 'claw/inspect-knowledge-writer') {
          return { ok: true, result: { ok: true, finalizeId, status: inspectedStatus, attempts: 1, executionPolicy, ...(inspectedError ? { error: inspectedError } : {}) } };
        }
        if (method === 'claw/fail-knowledge-writer') {
          return { ok: true, result: { ok: true } };
        }
        throw new Error(`Unexpected node request: ${method}`);
      },
    },
    agent: {
      async run(request) {
        agentRequests.push(request);
        return { ok: true, sessionId, disposition: 'queued' };
      },
      async errand(request) {
        errandRequests.push(request);
        return { ok: true, jobId: 'errand-1', status: 'running', sessionId: 'errand-session-1' };
      },
      async queryErrand(request) {
        errandQueries.push(request);
        return queryResults.shift();
      },
    },
  };

  const source = fs.readFileSync(pluginMainPath, 'utf8');
  vm.runInNewContext(source, {
    cindy,
    console: { error() {} },
    Date,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Promise,
    Set,
    String,
    clearTimeout() {},
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
  }, { filename: pluginMainPath });

  async function drainTimers(limit = 20) {
    let count = 0;
    while (timers.length > 0) {
      if (count++ >= limit) throw new Error('Timer drain did not settle.');
      const callback = timers.shift();
      callback();
      await flushAsyncWork();
    }
  }

  return {
    agentRequests,
    drainTimers,
    errandQueries,
    errandRequests,
    finalizeId,
    handle: hostMessages[0],
    jobPath,
    nodeRequests,
    sent,
    sessionId,
  };
}

async function completePlanTurn(harness, { includeTurnEnd = true } = {}) {
  await harness.handle({
    type: 'tool-call',
    tool: 'call_tool',
    callId: 'plan-done-card',
    args: {
      name: 'plan.done',
      args: {},
      session_context: { session_id: harness.sessionId, workdir: 'D:\\repo', workdir_is_local: true },
    },
  });
  if (includeTurnEnd) {
    await harness.handle({ type: 'event', name: 'did-turn-end', data: { sessionId: harness.sessionId } });
  }
  await flushAsyncWork();
  await harness.drainTimers();
}

test('only plan.create creates a workflow card while resume and done update it', async () => {
  const planPath = 'C:\\runtime\\task\\plan.json';
  const projection = (planStatus, goal, completedTasks) => ({
    planStatus,
    goal,
    planPath,
    card: {
      goal: 'Keep one Cindy workflow card',
      totalTasks: 1,
      completedTasks,
      currentTask: completedTasks ? null : { id: 1, title: 'Verify card reuse', status: 'pending' },
      tasks: [{ id: 1, title: 'Verify card reuse', status: completedTasks ? 'done' : 'pending' }],
    },
  });
  const harness = createHarness({
    queryResults: [],
    executions: [
      { ok: true, result: { ok: true, operation: 'plan.create', result: {}, projection: projection('process.active', 'resume', 0) } },
      { ok: true, result: { ok: true, operation: 'plan.resume', result: {}, projection: projection('process.active', 'resume', 0) } },
      { ok: true, result: { ok: true, operation: 'plan.done', result: {}, projection: projection('end.completed', 'complete', 1) } },
    ],
  });

  for (const [name, callId] of [
    ['plan.create', 'plan-create-card'],
    ['plan.resume', 'plan-resume-card'],
    ['plan.done', 'plan-done-card'],
  ]) {
    await harness.handle({
      type: 'tool-call',
      tool: 'call_tool',
      callId,
      args: {
        name,
        args: {},
        session_context: { session_id: harness.sessionId, workdir: 'D:\\repo', workdir_is_local: true },
      },
    });
  }

  const cardUpdates = harness.sent.filter(({ type }) => type === 'card-update');
  assert.equal(cardUpdates.length, 3);
  assert.deepEqual(cardUpdates.map(({ callId }) => callId), [
    'plan-create-card',
    'plan-create-card',
    'plan-create-card',
  ]);
  assert.equal(cardUpdates.at(-1).state, 'done');
  assert.match(cardUpdates[0].html, /background:#fbfbfc/);
  assert.match(cardUpdates[0].html, /border-radius:12px/);
  assert.match(cardUpdates[0].html, /border-top:1px solid #dfe2e6/);
  assert.match(cardUpdates[0].html, /padding:10px 14px/);
  assert.match(cardUpdates[0].html, /height:30px/);
  assert.match(cardUpdates[0].html, /width:18px;height:18px/);
  assert.equal(cardUpdates[0].state, 'done');
  assert.match(cardUpdates[0].html, /0\/1/);
  assert.doesNotMatch(cardUpdates[0].html, /clawProgressShimmer|claw-progress-fill/);
});

test('legacy Cindy background jobs are visible but never launched through errand', async () => {
  const harness = createHarness({
    queryResults: [
      { ok: true, jobId: 'errand-1', status: 'running', sessionId: 'errand-session-1', elapsedSeconds: 5 },
      {
        ok: true,
        jobId: 'errand-1',
        status: 'done',
        sessionId: 'errand-session-1',
        text: JSON.stringify({ status: 'succeeded', result: 'Truth and ADR reviewed.' }),
        agentKind: 'codex',
        model: 'gpt-test',
      },
    ],
  });

  await completePlanTurn(harness);

  assert.equal(harness.errandRequests.length, 0);
  assert.equal(harness.errandQueries.length, 0);
  assert.equal(harness.agentRequests.length, 0);
  assert.ok(harness.nodeRequests.some(({ method }) => method === 'claw/inspect-knowledge-writer'));
  assert.equal(harness.nodeRequests.some(({ method }) => method === 'claw/register-knowledge-writer'), false);
  assert.equal(harness.nodeRequests.some(({ method }) => method === 'claw/fail-knowledge-writer'), false);

  await harness.handle({
    type: 'tool-call',
    tool: 'list_tools',
    callId: 'catalog',
    args: { session_context: { session_id: harness.sessionId, workdir: 'D:\\repo', workdir_is_local: true } },
  });
  const catalog = harness.sent.find(({ type, callId }) => type === 'tool-result' && callId === 'catalog');
  assert.deepEqual(JSON.parse(JSON.stringify(catalog.result.categories)), [{ name: 'plan', operationCount: 0 }]);

});

test('subagent policy returns its Orca dispatch without waiting for did-turn-end', async () => {
  const knowledgeDispatch = {
    schemaVersion: 1,
    policy: 'subagent',
    finalizeId: 'a'.repeat(64),
    prompt: 'Use the claw-kit Ghost knowledge.claim operation for ' + 'a'.repeat(64),
  };
  const harness = createHarness({
    executionPolicy: 'subagent',
    knowledgeDispatch,
    queryResults: [],
  });

  await completePlanTurn(harness, { includeTurnEnd: false });

  assert.equal(harness.errandRequests.length, 0);
  assert.equal(harness.errandQueries.length, 0);
  assert.equal(harness.nodeRequests.some(({ method }) => method === 'claw/register-knowledge-writer'), false);
  assert.equal(harness.nodeRequests.some(({ method }) => method === 'claw/fail-knowledge-writer'), false);
  const planDoneResult = harness.sent.find(({ type, callId }) => type === 'tool-result' && callId === 'plan-done-card');
  assert.deepEqual(JSON.parse(JSON.stringify(planDoneResult.result.knowledgeDispatch)), knowledgeDispatch);
  assert.equal(harness.nodeRequests.some(({ method }) => method === 'claw/capture-report'), false);
  assert.equal(harness.nodeRequests.some(({ method }) => method === 'claw/inspect-knowledge-writer'), false);
});
