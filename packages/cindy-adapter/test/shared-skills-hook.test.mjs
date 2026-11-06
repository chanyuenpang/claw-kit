import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const source = await fs.readFile(new URL('../plugin/main.js', import.meta.url), 'utf8');
function harness(introduced = new Set(), prepare = async () => ({ ok: true, installed: false, version: '0.2.65' })) {
  const calls = [], sent = [];
  let handle;
  const functions = vm.runInNewContext(source + '\n;({prepareSessionBackground});', {
    console: { error() {} }, setTimeout, clearTimeout,
    cindy: {
      onHostMessage(fn) { handle = fn; },
      send(message) { sent.push(message); return Promise.resolve({ ok: true }); },
      node: { async request(request) {
        calls.push(request);
        if (request.method === 'claw/prepare-skills') return { ok: true, result: await prepare() };
        if (request.method === 'claw/claim-entry-hook') {
          const claimed = !introduced.has(request.params.sessionId);
          introduced.add(request.params.sessionId);
          return { ok: true, result: { ok: true, claimed } };
        }
        return { ok: true, result: { ok: true, result: { workflow: 'continues' } } };
      } },
    },
  });
  return { calls, sent, handle, ...functions };
}
test('entry hook introduces Cindy and the workflow only once per session, including plugin restart', async () => {
  const introduced = new Set();
  const h = harness(introduced);
  const original = '请修复这个问题。\n保留原有行为。';
  await h.handle({ type: 'event', name: 'will-user-message', hookId: 'entry-1', data: { sessionId: 's', text: original, model: 'codex' } });
  const verdict = h.sent.at(-1);
  assert.equal(verdict.type, 'event-verdict');
  assert.equal(verdict.hookId, 'entry-1');
  assert.equal(verdict.action, 'rewrite');
  assert.ok(verdict.text.startsWith(original + '\n\n'));
  assert.equal(verdict.text, original + '\n\n[claw]当前是 Cindy Host。本次会话先按可用技能列表中的路径读取公共技能 using-claw-kit 的 SKILL.md，再读取其 Cindy 路由说明，完成后开展任务。[/claw]');
  assert.equal(h.calls.filter(call => call.method === 'claw/claim-entry-hook').length, 1);
  assert.equal(h.calls.filter(call => call.method === 'claw/prepare-skills').length, 1);
  await h.handle({ type: 'event', name: 'will-user-message', hookId: 'entry-2', data: { sessionId: 's', text: '继续' } });
  assert.equal(h.sent.at(-1).action, 'allow');
  assert.equal(h.calls.filter(call => call.method === 'claw/claim-entry-hook').length, 1);
  const restarted = harness(introduced);
  await restarted.handle({ type: 'event', name: 'will-user-message', hookId: 'entry-3', data: { sessionId: 's', text: '继续' } });
  assert.equal(restarted.sent.at(-1).action, 'allow');
  await h.handle({ type: 'event', name: 'will-user-message', hookId: 'new-session', data: { sessionId: 'new', text: '开发任务' } });
  assert.equal(h.sent.at(-1).action, 'rewrite');
});
test('entry hook never truncates an oversized user message or blocks it', async () => {
  const h = harness();
  await h.handle({ type: 'event', name: 'will-user-message', hookId: 'long', data: { sessionId: 's', text: '原'.repeat(16000) } });
  assert.equal(h.sent.at(-1).action, 'allow');
  assert.equal(h.sent.at(-1).text, undefined);
  assert.equal(h.calls.filter(call => call.method === 'claw/claim-entry-hook').length, 0);
});
test('entry receipt persists across module reload and is isolated by session', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claw-entry-hook-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const require = createRequire(import.meta.url);
  const modulePath = require.resolve('../plugin/node/entry-hook.cjs');
  assert.equal(require(modulePath).claimEntryHook('one', root).claimed, true);
  delete require.cache[modulePath];
  assert.equal(require(modulePath).claimEntryHook('one', root).claimed, false);
  assert.equal(require(modulePath).claimEntryHook('two', root).claimed, true);
});
test('chat startup has no skill installer, repair notice, or workflow admission gate', async () => {
  const h = harness();
  await h.prepareSessionBackground('s', '/project');
  await h.prepareSessionBackground('s2', '/project');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.filter(call => call.method === 'claw/skills-install').length, 0);
  assert.equal(h.calls.filter(call => call.method === 'claw/session-start').length, 2);
  assert.equal(h.calls.filter(call => call.method === 'claw/skills-status').length, 0);
  assert.equal(h.sent.filter(message => message.type === 'notify').length, 0);
  const args = { session_context: { session_id: 's', workdir: '/project', workdir_is_local: true }, name: 'plan.show', args: {} };
  await h.handle({ type: 'tool-call', tool: 'call_tool', callId: 'workflow', args });
  assert.equal(h.calls.filter(call => call.method === 'claw/execute').length, 1);
  assert.equal(h.sent.at(-1).ok, true);
});

test('resident initialization prepares once without a session; pending and failed skills never gate workflow', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const h = harness(new Set(), () => pending);
  assert.equal(h.calls.filter(call => call.method === 'claw/prepare-skills').length, 1);
  await h.handle({ type: 'event', name: 'will-user-message', hookId: 'entry', data: { sessionId: 'new', text: 'task' } });
  assert.equal(h.sent.at(-1).action, 'rewrite');
  await h.handle({ type: 'tool-call', tool: 'call_tool', callId: 'work', args: { session_context: { session_id: 'new', workdir: '/project', workdir_is_local: true }, name: 'plan.show', args: {} } });
  assert.equal(h.calls.filter(call => call.method === 'claw/execute').length, 1);
  resolve({ ok: false, errorCode: 'ENETUNREACH', phase: 'download' });
  await new Promise(done => setImmediate(done));
  assert.equal(h.sent.filter(message => message.type === 'notify').length, 1);
  assert.match(h.sent.find(message => message.type === 'notify').text, /ENETUNREACH/);
  assert.equal(h.calls.filter(call => call.method === 'claw/prepare-skills').length, 1);
});
