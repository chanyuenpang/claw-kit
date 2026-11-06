import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildSharedSkillsArtifact, fingerprintSkill } from './shared-skills-artifact.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claw-shared-data-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const built = await buildSharedSkillsArtifact({ sourceRoot, outputRoot: path.join(dir, 'package') });
  return { dir, ...built };
}

test('shared publication contains complete canonical skills and metadata, not installation code', async t => {
  const f = await fixture(t);
  const pkg = JSON.parse(await fs.readFile(path.join(f.outputRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@veewo/claw-skills');
  assert.equal(pkg.version, f.manifest.version);
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.scripts, undefined);
  assert.deepEqual((await fs.readdir(f.outputRoot)).sort(), ['README.md', 'package.json', 'skills', 'skills-manifest.json']);
  assert.equal(Object.keys(f.manifest.skills).length, 7);
  for (const [id, hash] of Object.entries(f.manifest.skills)) {
    await fs.access(path.join(f.outputRoot, 'skills', id, 'SKILL.md'));
    assert.equal(await fingerprintSkill(path.join(f.outputRoot, 'skills', id)), hash);
  }
  await fs.access(path.join(f.outputRoot, 'skills/using-claw-kit/references/hosts/cindy.md'));
  await fs.access(path.join(f.outputRoot, 'skills/create-claw-skill/TEMPLATE.json'));
});

test('a moved data package retains complete resources without any source-tree fallback', async t => {
  const f = await fixture(t), moved = path.join(f.dir, 'detached');
  await fs.rename(f.outputRoot, moved);
  const manifest = JSON.parse(await fs.readFile(path.join(moved, 'skills-manifest.json'), 'utf8'));
  assert.deepEqual(manifest, f.manifest);
  assert.match(await fs.readFile(path.join(moved, 'skills/using-claw-kit/SKILL.md'), 'utf8'), /Select the execution route first/);
  assert.equal(await fingerprintSkill(path.join(moved, 'skills/planning')), manifest.skills.planning);
});

test('per-skill integrity preserves the published sorted d:/f: relative-path algorithm', async t => {
  const f = await fixture(t), dir = path.join(f.dir, 'hash-fixture');
  await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
  await fs.writeFile(path.join(dir, 'templates/TEMPLATE.json'), '{}');
  await fs.writeFile(path.join(dir, 'SKILL.md'), 'a');
  const expected = createHash('sha256').update('f:SKILL.md\0').update('a')
    .update('d:templates\0').update('f:templates/TEMPLATE.json\0').update('{}').digest('hex');
  assert.equal(await fingerprintSkill(dir), expected);
  await fs.symlink(path.join(dir, 'templates'), path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(fingerprintSkill(dir), /not links/);
});

test('npm pack and offline unpack retain the data-only manifest and all adjacent resources', async t => {
  const f = await fixture(t);
  let npmCli;
  for (const directory of [path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter)]) {
    const file = path.join(directory, 'node_modules/npm/bin/npm-cli.js');
    try { await fs.access(file); npmCli = file; break; } catch { /* next installation */ }
  }
  assert.ok(npmCli, 'npm-cli.js is required for the isolated package test');
  const run = promisify(execFile), options = { cwd: f.dir, windowsHide: true, timeout: 30000 };
  const result = await run(process.execPath, [npmCli, 'pack', f.outputRoot, '--ignore-scripts', '--json', '--offline', '--cache', path.join(f.dir, 'cache')], options);
  const metadata = JSON.parse(result.stdout)[0];
  assert.ok(metadata.files.some(file => file.path === 'skills/create-claw-skill/TEMPLATE.json'));
  assert.ok(metadata.files.some(file => file.path === 'skills/using-claw-kit/references/hosts/cindy.md'));
  assert.ok(!metadata.files.some(file => /(^|\/)(installer|node-runtime)\.cjs$/.test(file.path)));
  const extracted = path.join(f.dir, 'extracted');
  await fs.mkdir(extracted);
  await run('tar', ['-xzf', path.join(f.dir, metadata.filename), '-C', extracted], options);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(extracted, 'package/skills-manifest.json'), 'utf8')), f.manifest);
  for (const [id, hash] of Object.entries(f.manifest.skills)) {
    assert.equal(await fingerprintSkill(path.join(extracted, 'package/skills', id)), hash);
  }
});
