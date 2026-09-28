// Isolated opt-in measurement; never terminates an existing DSH session.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ClawSession } from '../lib/claw-session.js';

if (process.platform !== 'win32') throw new Error('Windows-only process-tree probe');
const globalRoot = process.env.DSH_INSTALL_DIR ?? path.join(process.env.APPDATA, 'npm/node_modules/@deepseek-ai/dsh');
const loader = (file) => import(pathToFileURL(path.join(globalRoot, 'node_modules', file, 'lib/index.js')).href);
const [{ Context }, { LocalSubprocessRuntime }] = await Promise.all([
  loader('@deepseek-ai/cordis'), loader('@deepseek-ai/dsh-subprocess-local'),
]);
const root = mkdtempSync(path.join(tmpdir(), 'claw-session-probe-'));
const id = 'session-' + randomUUID();
const ids = [id + '-a', id + '-b'];
const snapshotScript = path.resolve('scripts/session-process-snapshot.ps1');
const samplePath = path.join(root, 'sample.json');
function sample(label) {
  const r = spawnSync('pwsh', ['-NoProfile', '-File', snapshotScript, '-OutputPath', samplePath], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('process census failed: ' + r.status);
  const value = JSON.parse(readFileSync(samplePath, 'utf8'));
  if (process.env.CLAW_PROBE_DEBUG) console.error(label, value.rows.filter((row) => row.workdir?.startsWith(root)));
  const rows = value.rows.filter((row) => ids.includes(row.sessionId));
  return { label, at: value.sampledAt,
    count: rows.length, runner: rows.filter((row) => row.kind === 'runner').length,
    claw: rows.filter((row) => row.kind === 'claw').length,
    workingSetMiB: Math.round(rows.reduce((total, row) => total + row.workingSetMiB, 0) * 10) / 10,
    rows: rows.map(({ kind, pid, parentPid, workdir, sessionId }) => ({ kind, pid, parentPid, workdir, sessionId })) };
}
const runtime = new LocalSubprocessRuntime(new Context());
const sessions = [];
const results = [];
const init = spawnSync(process.execPath, [path.join(process.cwd(), '../cli/dist/bin.js'), 'init', '--id', 'session-probe', '--name', 'Session Probe'], { cwd: root, stdio: 'inherit' });
if (init.status !== 0) throw new Error('fixture init failed: ' + init.status);
try {
  results.push(sample('before'));
  const a = new ClawSession(runtime, root, ids[0]); sessions.push(a);
  const t1 = performance.now(); await a.open();
  results.push({ label: 'firstOpenMs', durationMs: Math.round(performance.now() - t1) });
  if (process.env.CLAW_PROBE_PAUSE) await new Promise((resolve) => setTimeout(resolve, Number(process.env.CLAW_PROBE_PAUSE)));
  results.push(sample('open A'));
  const t2 = performance.now(); await a.request('plan.show', { simple: true });
  results.push({ label: 'reuseRequestMs', durationMs: Math.round(performance.now() - t2) });
  results.push(sample('reuse A'));
  const b = new ClawSession(runtime, root, ids[1]); sessions.push(b);
  await b.open(); results.push(sample('switch B'));
  await a.close('probe-close-A'); results.push(sample('close A'));
  const a2 = new ClawSession(runtime, root, ids[0]); sessions.push(a2);
  const t3 = performance.now(); await a2.open();
  results.push({ label: 'reconnectMs', durationMs: Math.round(performance.now() - t3) });
  results.push(sample('reconnect A'));
  await Promise.all([a2.close('probe-final'), b.close('probe-final')]);
  results.push(sample('close all'));
  console.log(JSON.stringify({ fixture: root, ids, results }, null, 2));
} finally {
  await Promise.allSettled(sessions.map((session) => session.close('probe-finally')));
  // The fixture may have a retained record in the user-level registry; it
  // expires normally. Do not touch other sessions or the shared daemon.
  rmSync(root, { recursive: true, force: true });
}
