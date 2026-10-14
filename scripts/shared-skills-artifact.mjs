import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleSkills, assertArtifactOutput } from './skill-artifacts.mjs';
import installer from '../packages/shared-skills/installer.cjs';

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
    for (const skill of inputs.skills) skills[skill.id] = await installer.fingerprint(path.join(stage, 'skills', skill.id));
    const manifest = { schemaVersion: 1, name: pkg.name, version: pkg.version, sourceHash: inputs.sourceHash, skills };
    await fs.writeFile(path.join(stage, 'skills-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    await fs.copyFile(path.join(sourceRoot, 'packages/shared-skills/installer.cjs'), path.join(stage, 'installer.cjs'));
    await fs.copyFile(path.join(sourceRoot, 'packages/shared-skills/node-runtime.cjs'), path.join(stage, 'node-runtime.cjs'));
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
