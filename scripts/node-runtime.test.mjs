import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import runtime from '../packages/shared-skills/node-runtime.cjs';

test('Electron workers launch independent Node, including paths containing spaces', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claw node runtime '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const executable = path.join(root, process.platform === 'win32' ? 'node.exe' : 'node');
  // Windows Node is self-contained; on Unix keep its shared-library location.
  if (process.platform === 'win32') await fs.copyFile(process.execPath, executable);
  else await fs.symlink(process.execPath, executable);
  const resolved = runtime.nodeExecutable({ electron: 'production', executable: path.join(root, 'Cindy.exe'), searchPath: root });
  assert.equal(resolved, executable);
  assert.equal(execFileSync(resolved, ['-e', 'process.stdout.write("independent-node")'], { encoding: 'utf8', windowsHide: true }), 'independent-node');
});

test('missing Node never falls back to the Electron application', () => {
  assert.throws(() => runtime.nodeExecutable({ electron: 'production', executable: 'Cindy.exe', searchPath: '' }), { code: 'NODE_EXECUTABLE_NOT_FOUND' });
  assert.equal(runtime.nodeExecutable({ electron: undefined, executable: process.execPath }), process.execPath);
});
