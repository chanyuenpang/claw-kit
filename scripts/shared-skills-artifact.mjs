import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleSkills, assertArtifactOutput } from './skill-artifacts.mjs';
import { createHash } from 'node:crypto';

// Artifact-only integrity, stable across the data-only package migration.
export async function fingerprintSkill(root) {
  const hash = createHash('sha256');
  async function visit(dir, prefix = '') {
    for (const name of (await fs.readdir(dir)).sort()) {
      const file = path.join(dir, name), relative = prefix + name;
      const stat = await fs.lstat(file);
      if (stat.isDirectory()) { hash.update('d:' + relative + '\0'); await visit(file, relative + '/'); }
      else if (stat.isFile()) hash.update('f:' + relative + '\0').update(await fs.readFile(file));
      else throw new Error('Shared skills must contain regular files, not links: ' + file);
    }
  }
  await visit(root);
  return hash.digest('hex');
}

// The standard declaration already owns the seven complete, host-neutral packages.
// No new skill source or host-specific text transformation is introduced here.
export async function buildSharedSkillsArtifact({ sourceRoot, outputRoot }) {
  ({ sourceRoot, outputRoot } = await assertArtifactOutput({ sourceRoot, outputRoot }));
  try { await fs.lstat(outputRoot); throw new Error('Output already exists: ' + outputRoot); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  const stage = await fs.mkdtemp(path.join(path.dirname(outputRoot), '.shared-skills-'));
  try {
    const inputs = await assembleSkills({ sourceRoot, targetHost: 'standard', outputRoot: stage });
    const pkg = JSON.parse(await fs.readFile(path.join(sourceRoot, 'packages/shared-skills/package.json'), 'utf8'));
    delete pkg.private; // Only a complete composed artifact is publishable.
    const skills = {};
    for (const skill of inputs.skills) skills[skill.id] = await fingerprintSkill(path.join(stage, 'skills', skill.id));
    const manifest = { schemaVersion: 1, name: pkg.name, version: pkg.version, sourceHash: inputs.sourceHash, skills };
    await fs.writeFile(path.join(stage, 'skills-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    await fs.copyFile(path.join(sourceRoot, 'packages/shared-skills/README.md'), path.join(stage, 'README.md'));
    await fs.rename(stage, outputRoot);
    return { outputRoot, manifest };
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputRoot = process.argv[2];
  if (!outputRoot) throw new Error('Usage: node scripts/shared-skills-artifact.mjs <fresh-output-directory>');
  console.log(JSON.stringify(await buildSharedSkillsArtifact({ sourceRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), outputRoot }), null, 2));
}
