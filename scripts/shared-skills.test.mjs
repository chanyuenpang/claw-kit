import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildSharedSkillsArtifact } from './shared-skills-artifact.mjs';
import installer from '../packages/shared-skills/installer.cjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claw-shared-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const homeDir = path.join(dir, 'home');
  const built = await buildSharedSkillsArtifact({ sourceRoot, outputRoot: path.join(dir, 'package') });
  const options = { homeDir, packageRoot: built.outputRoot, expected: built.manifest };
  return { dir, homeDir, options, ...installer.locations(homeDir) };
}
async function upgrade(f) {
  const packageRoot = path.join(f.dir, 'upgrade');
  await fs.cp(f.options.packageRoot, packageRoot, { recursive: true });
  await fs.appendFile(path.join(packageRoot, 'skills/planning/SKILL.md'), '\nUpgrade fixture.\n');
  const expected = structuredClone(f.options.expected);
  const parts = expected.version.split('.').map(Number);
  parts[2]++;
  expected.version = parts.join('.');
  expected.sourceHash = 'b'.repeat(64);
  expected.skills.planning = await installer.fingerprint(path.join(packageRoot, 'skills/planning'));
  await fs.writeFile(path.join(packageRoot, 'skills-manifest.json'), JSON.stringify(expected));
  const pkg = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json')));
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ ...pkg, version: expected.version }));
  return { homeDir: f.homeDir, packageRoot, expected };
}

test('complete shared packages discover at the flat root, repeat is a no-op, session loading stays unknown', async t => {
  const f = await fixture(t);
  assert.equal((await installer.status(f.options)).status, 'missing');
  const result = await installer.install(f.options);
  assert.equal(result.compatible, true);
  assert.equal(result.loadedInCurrentSession, 'unknown');
  assert.equal(Object.keys(f.options.expected.skills).length, 7);
  for (const [id, hash] of Object.entries(f.options.expected.skills)) {
    await fs.access(path.join(f.root, id, 'SKILL.md'));
    assert.equal(await installer.fingerprint(path.join(f.root, id)), hash);
  }
  await fs.access(path.join(f.root, 'using-claw-kit/references/hosts/cindy.md'));
  await fs.access(path.join(f.root, 'create-claw-skill/TEMPLATE.json'));
  const before = await fs.stat(path.join(f.root, 'planning'));
  assert.equal((await installer.install(f.options)).unchanged, true);
  assert.equal((await fs.stat(path.join(f.root, 'planning'))).mtimeMs, before.mtimeMs);
});

test('upgrade preserves unrelated skills and activates all content as a recoverable batch', async t => {
  const f = await fixture(t);
  await installer.install(f.options);
  await fs.mkdir(path.join(f.root, 'user-notes'));
  await fs.writeFile(path.join(f.root, 'user-notes/SKILL.md'), 'User data');
  const next = await upgrade(f);
  assert.equal((await installer.install(next)).version, next.expected.version);
  assert.equal(await fs.readFile(path.join(f.root, 'user-notes/SKILL.md'), 'utf8'), 'User data');
  assert.equal((await installer.status(f.options)).status, 'incompatible');
});

test('stage, activation and receipt failures retain the previous usable version', async t => {
  const f = await fixture(t);
  await installer.install(f.options);
  const next = await upgrade(f);
  for (const phase of ['staged', 'backed-up', 'activated', 'receipt']) {
    await assert.rejects(installer.install({ ...next, fault: async current => { if (current === phase) throw new Error('injected-' + phase); } }), /injected/);
    assert.equal((await installer.status(f.options)).compatible, true, phase);
  }
  assert.equal((await installer.install(next)).compatible, true);
});

test('new install failure rolls back without exposing a partial skill set', async t => {
  const f = await fixture(t);
  await assert.rejects(installer.install({ ...f.options, fault: async phase => { if (phase === 'activated') throw new Error('injected'); } }), /injected/);
  assert.deepEqual(await fs.readdir(f.root), []);
  assert.equal((await installer.install(f.options)).compatible, true);
});

test('unowned directories and modified owned companion files are never overwritten', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.root, 'planning'), { recursive: true });
  await fs.writeFile(path.join(f.root, 'planning/user.txt'), 'preserve');
  await assert.rejects(installer.install(f.options), { code: 'SKILLS_USER_CONFLICT' });
  assert.equal(await fs.readFile(path.join(f.root, 'planning/user.txt'), 'utf8'), 'preserve');
  await fs.rename(path.join(f.root, 'planning'), path.join(f.dir, 'user-planning'));
  await installer.install(f.options);
  const resource = path.join(f.root, 'using-claw-kit/references/hosts/cindy.md');
  await fs.appendFile(resource, '\nUser changes');
  await assert.rejects(installer.install(await upgrade(f)), { code: 'SKILLS_USER_CONFLICT' });
  assert.match(await fs.readFile(resource, 'utf8'), /User changes$/);
  assert.equal((await installer.status(f.options)).status, 'needs-repair');
});

test('legacy Ghost links and duplicate names remain host/user owned until migration', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.root, { recursive: true });
  const legacy = path.join(f.root, 'claw-kit--planning');
  await fs.symlink(path.join(f.options.packageRoot, 'skills/planning'), legacy, 'junction');
  await assert.rejects(installer.install(f.options), { code: 'SKILLS_DUPLICATE_ENTRIES' });
  assert.equal((await fs.lstat(legacy)).isSymbolicLink(), true);
  // Simulate Host-owned reconciliation, not installer deletion.
  await fs.unlink(legacy);
  assert.equal((await installer.install(f.options)).compatible, true);
  await fs.cp(path.join(f.root, 'planning'), path.join(f.root, 'old-copy'), { recursive: true });
  assert.equal((await installer.status(f.options)).status, 'duplicate-entries');
});

test('interrupted activation is recovered on retry, retaining the old snapshot outside discovery', async t => {
  const f = await fixture(t);
  await installer.install(f.options);
  const next = await upgrade(f);
  const installerPath = path.join(sourceRoot, 'packages/shared-skills/installer.cjs');
  const code = "const installer = require(process.argv[1]); const options = JSON.parse(process.argv[2]); installer.install({...options, fault: async phase => { if (phase === 'activated') process.exit(42); }}).catch(error => { console.error(error); process.exit(1); });";
  await assert.rejects(promisify(execFile)(process.execPath, ['-e', code, installerPath, JSON.stringify(next)], { windowsHide: true, timeout: 10000 }), { code: 42 });
  assert.equal((await installer.status(f.options)).status, 'recovery-needed');
  assert.equal((await installer.install(f.options)).unchanged, true);
  assert.equal((await installer.status(f.options)).compatible, true);
});

test('download errors and wrong package bytes cannot affect the installed version', async t => {
  const f = await fixture(t);
  await installer.install(f.options);
  await assert.rejects(installer.downloadAndInstall({ ...f.options, download: async () => { throw new Error('network unavailable'); } }), /network unavailable/);
  await fs.appendFile(path.join(f.options.packageRoot, 'skills/planning/SKILL.md'), '\nWrong bytes');
  await assert.rejects(installer.install(f.options), { code: 'SKILLS_PACKAGE_INTEGRITY' });
  assert.equal((await installer.status(f.options)).compatible, true);
});

test('same version cannot be reused for new bytes; path escapes and competing installs are contained', async t => {
  const f = await fixture(t);
  await installer.install(f.options);
  const next = await upgrade(f);
  next.expected.version = f.options.expected.version;
  await fs.writeFile(path.join(next.packageRoot, 'skills-manifest.json'), JSON.stringify(next.expected));
  await fs.writeFile(path.join(next.packageRoot, 'package.json'), JSON.stringify({ name: next.expected.name, version: next.expected.version }));
  await assert.rejects(installer.install(next), { code: 'SKILLS_VERSION_REUSED' });
  const unsafe = structuredClone(f.options.expected);
  unsafe.skills['../escape'] = 'a'.repeat(64);
  await assert.rejects(installer.install({ ...f.options, expected: unsafe }), { code: 'SKILLS_MANIFEST_INVALID' });
  await fs.writeFile(path.join(f.state, 'install.lock'), JSON.stringify({ pid: process.pid }));
  await assert.rejects(installer.install(f.options), { code: 'SKILLS_INSTALL_BUSY' });
  await fs.unlink(path.join(f.state, 'install.lock'));
  const linkedHome = path.join(f.dir, 'linked-home');
  await fs.symlink(f.homeDir, linkedHome, 'junction');
  await assert.rejects(installer.install({ ...f.options, homeDir: linkedHome }), { code: 'SKILLS_PATH_LINK' });
});

test('npm pack and offline extraction preserve the complete installable package', async t => {
  const f = await fixture(t);
  const candidates = [path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter)];
  let npmCli;
  for (const directory of candidates) {
    const file = path.join(directory, 'node_modules/npm/bin/npm-cli.js');
    try { await fs.access(file); npmCli = file; break; } catch { /* next npm installation */ }
  }
  if (!npmCli) { t.skip('npm-cli.js is unavailable'); return; }
  const run = promisify(execFile);
  const options = { cwd: f.dir, windowsHide: true, timeout: 30000 };
  const cache = path.join(f.dir, 'npm-cache');
  const packed = await run(process.execPath, [npmCli, 'pack', f.options.packageRoot, '--ignore-scripts', '--json', '--offline', '--cache', cache], options);
  const metadata = JSON.parse(packed.stdout)[0];
  assert.ok(metadata.files.some(file => file.path === 'skills/create-claw-skill/TEMPLATE.json'));
  assert.ok(metadata.files.some(file => file.path === 'skills/using-claw-kit/references/hosts/cindy.md'));
  const prefix = path.join(f.dir, 'extracted');
  await run(process.execPath, [npmCli, 'install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--offline', '--cache', cache, path.join(f.dir, metadata.filename)], options);
  const result = await installer.install({ ...f.options, packageRoot: path.join(prefix, 'node_modules/@veewo/claw-skills') });
  assert.equal(result.compatible, true);
});

test('an unowned state directory is not adopted or overwritten', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.state, { recursive: true });
  await fs.writeFile(path.join(f.state, 'receipt.json'), 'user data');
  await assert.rejects(installer.install(f.options), { code: 'SKILLS_STATE_CONFLICT' });
  assert.equal(await fs.readFile(path.join(f.state, 'receipt.json'), 'utf8'), 'user data');
  assert.deepEqual(await fs.readdir(f.state), ['receipt.json']);
});
