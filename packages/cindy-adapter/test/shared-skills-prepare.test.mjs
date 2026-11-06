import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { prepareSharedSkills: prepare, fingerprint, npmArguments } = createRequire(import.meta.url)('../plugin/node/shared-skills.cjs');
const minimum = { package: '@veewo/claw-skills', minVersion: '0.2.65' };
const record = '.claw-package-' + encodeURIComponent(minimum.package) + '.json';
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claw-plugin-skills-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'); await fs.mkdir(home);
  const root = path.join(home, '.agents/skills');
  const packages = new Map();
  async function bundle(version, entries) {
    const source = path.join(dir, 'package-' + version); await fs.mkdir(path.join(source, 'skills'), { recursive: true });
    const skills = {};
    for (const [id, files] of Object.entries(entries)) {
      for (const [name, content] of Object.entries(files)) { const file = path.join(source, 'skills', id, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); }
      skills[id] = await fingerprint(path.join(source, 'skills', id));
    }
    await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: minimum.package, version, scripts: { postinstall: 'throw new Error("not executed")' } }));
    await fs.writeFile(path.join(source, 'installer.cjs'), 'throw new Error("must not execute downloaded code")');
    await fs.writeFile(path.join(source, 'skills-manifest.json'), JSON.stringify({ schemaVersion: 1, name: minimum.package, version, sourceHash: 'a'.repeat(64), skills }));
    packages.set(version, source); return source;
  }
  const calls = [];
  const download = async version => { calls.push(version); return packages.get(version); };
  const run = (version = minimum.minVersion, extra = {}) => prepare({ minimum: { ...minimum, minVersion: version }, homeDir: home, download, ...extra });
  return { dir, home, root, bundle, calls, run, packages };
}
const old = { planning: { 'SKILL.md': 'old', 'stale.md': 'old resource' }, retired: { 'SKILL.md': 'retired' } };
const next = { planning: { 'SKILL.md': 'new', 'references/a.md': 'resource' } };

test('first initialization prepares global directories; complete compatible data needs no network', async t => {
  const f = await fixture(t); await f.bundle('0.2.65', old);
  assert.equal((await f.run()).installed, true);
  assert.equal((await f.run()).installed, false);
  assert.deepEqual(f.calls, ['0.2.65']);
  assert.equal(await fs.readFile(path.join(f.root, 'planning/SKILL.md'), 'utf8'), 'old');
  assert.equal(await fs.readFile(path.join(f.root, 'planning/stale.md'), 'utf8'), 'old resource');
  const args = npmArguments('0.2.65', '/isolated', '/config');
  assert.ok(args.includes('--ignore-scripts')); assert.ok(args.includes('--prefix')); assert.ok(!args.includes('--global'));
});

test('official edits are overwritten, removed resources disappear, unrelated skills remain', async t => {
  const f = await fixture(t); await f.bundle('0.2.65', old); await f.run();
  await fs.writeFile(path.join(f.root, 'planning/SKILL.md'), 'user edit');
  await fs.mkdir(path.join(f.root, 'other')); await fs.writeFile(path.join(f.root, 'other/SKILL.md'), 'keep');
  await f.bundle('0.2.66', next); assert.equal((await f.run('0.2.66')).version, '0.2.66');
  assert.equal(await fs.readFile(path.join(f.root, 'planning/SKILL.md'), 'utf8'), 'new');
  for (const file of ['planning/stale.md', 'retired']) await assert.rejects(fs.access(path.join(f.root, file)), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(f.root, 'other/SKILL.md'), 'utf8'), 'keep');
  assert.deepEqual((await fs.readdir(path.join(f.home, '.agents/.claw-kit-skills'))), []);
  await fs.writeFile(path.join(f.root, 'planning/SKILL.md'), 'edited newer');
  assert.equal((await f.run('0.2.65')).version, '0.2.66');
  assert.deepEqual(f.calls, ['0.2.65', '0.2.66', '0.2.66']);
});

test('user-configured global directory links resolve to one captured physical scope', async t => {
  const f = await fixture(t); await f.bundle('0.2.65', old);
  const physical = path.join(f.dir, 'configured-global'); await fs.mkdir(physical);
  await fs.mkdir(path.dirname(f.root), { recursive: true });
  await fs.symlink(physical, f.root, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.run()).installed, true);
  assert.equal(await fs.readFile(path.join(physical, 'planning/SKILL.md'), 'utf8'), 'old');
});

test('a delayed old preparation rechecks the committed newer version before any overwrite', async t => {
  const f = await fixture(t); const a = await f.bundle('0.2.65', old); await f.bundle('0.2.66', next);
  let resume; const blocked = new Promise(resolve => { resume = resolve; }); let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const older = f.run('0.2.65', { download: async () => { entered(); await blocked; return a; } });
  await ready; await f.run('0.2.66'); resume();
  assert.equal((await older).version, '0.2.66');
  assert.equal(await fs.readFile(path.join(f.root, 'planning/SKILL.md'), 'utf8'), 'new');
});

test('failed acquisition/integrity retains previous version and does not manufacture success', async t => {
  const f = await fixture(t); await f.bundle('0.2.65', old); await f.run();
  await assert.rejects(f.run('0.2.66', { download: async () => { throw Object.assign(new Error('private token'), { code: 'ENETUNREACH' }); } }), { code: 'ENETUNREACH', phase: 'download' });
  const source = await f.bundle('0.2.66', next); await fs.appendFile(path.join(source, 'skills/planning/SKILL.md'), 'bad');
  await assert.rejects(f.run('0.2.66'), { phase: 'validate' });
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root, record), 'utf8')).version, '0.2.65');
  assert.equal(await fs.readFile(path.join(f.root, 'planning/SKILL.md'), 'utf8'), 'old');
});

test('a live package lock rejects only preparation without replacing global files', async t => {
  const f = await fixture(t); await f.bundle('0.2.65', old); await f.run(); await f.bundle('0.2.66', next);
  const lease = path.join(f.home, '.agents/.claw-kit-skills/prepare.lock');
  await fs.writeFile(lease, JSON.stringify({ pid: process.pid }));
  await assert.rejects(f.run('0.2.66'), { code: 'SKILLS_BUSY', phase: 'lock' });
  assert.equal(await fs.readFile(path.join(f.root, 'planning/SKILL.md'), 'utf8'), 'old');
  assert.equal(JSON.parse(await fs.readFile(lease, 'utf8')).pid, process.pid);
});

test('failed replacement keeps the last completed version record, never a false new success', async t => {
  const f = await fixture(t); await f.bundle('0.2.65', old); await f.run(); await f.bundle('0.2.66', next);
  const cp = fs.cp;
  t.mock.method(fs, 'cp', async (...args) => {
    if (args[1] === path.join(f.root, 'planning')) throw Object.assign(new Error('private volume detail'), { code: 'ENOSPC' });
    return cp(...args);
  });
  await assert.rejects(f.run('0.2.66'), { code: 'ENOSPC', phase: 'write' });
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root, record), 'utf8')).version, '0.2.65');
});

test('legacy version metadata is not ownership protection and new consumers never downgrade it', async t => {
  const f = await fixture(t); await f.bundle('0.2.66', next); await f.run('0.2.66');
  await fs.rename(path.join(f.root, record), path.join(f.home, '.agents/.claw-kit-skills/receipt.json'));
  await fs.writeFile(path.join(f.root, 'planning/SKILL.md'), 'modified');
  assert.equal((await f.run()).version, '0.2.66');
  assert.equal(await fs.readFile(path.join(f.root, 'planning/SKILL.md'), 'utf8'), 'new');
});

test('published v1 directory/file hash is retained and links cannot be skill resources', async t => {
  const f = await fixture(t), root = path.join(f.dir, 'hash');
  await fs.mkdir(path.join(root, 'empty'), { recursive: true }); await fs.writeFile(path.join(root, 'SKILL.md'), 'doc');
  const expected = createHash('sha256').update('f:SKILL.md\0').update('doc').update('d:empty\0').digest('hex');
  assert.equal(await fingerprint(root), expected);
  await fs.symlink(path.join(root, 'empty'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(fingerprint(root), /Links/);
});
