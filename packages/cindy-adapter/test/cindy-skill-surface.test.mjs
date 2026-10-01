import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import test, { after } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCindyPluginArtifact } from '../../../scripts/cindy-plugin-artifact.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixture = await mkdtemp(path.join(os.tmpdir(), 'claw-cindy-surface-'));
const built = await buildCindyPluginArtifact({ sourceRoot, outputRoot: path.join(fixture, 'artifact') });
after(() => rm(fixture, { recursive: true, force: true }));
const root = pathToFileURL(built.pluginDir + path.sep);

test('Cindy plugin preserves its explicit public skill surface and adjacent resources', async () => {
  const manifest = JSON.parse(await readFile(new URL('ghost.json', root), 'utf8'));
  const names = manifest.skill.items.map((item) => item.name).sort();
  assert.deepEqual(names, ['claw-kit-doc', 'planning', 'researcher', 'using-claw-kit']);
  assert.equal(manifest.skill.items.some((item) => item.dir === 'skills/update'), false);

  for (const entry of [
    'skills/using-claw-kit/SKILL.md',
    'skills/using-claw-kit/references/hosts/cindy.md',
    'skills/researcher/references/host-execution.md',
    'skills/config/SKILL.md',
    'skills/planning/SKILL.md',
    'skills/researcher/SKILL.md',
    'skills/create-claw-skill/SKILL.md',
    'skills/claw-kit-doc/SKILL.md',
    'skills/claw-kit-doc/references/update.md',
    'skills/claw-kit-doc/references/configuration.md',
    'skills/claw-kit-doc/references/knowledge-format.md',
  ]) {
    await readFile(new URL(entry, root), 'utf8');
  }

  for (const name of ['update', 'feature-architecture', 'knowledge-capture', 'delegate-writer', 'knowledge-writer']) {
    await assert.rejects(readFile(new URL(`skills/${name}/SKILL.md`, root), 'utf8'), { code: 'ENOENT' });
  }
});

test('Cindy marketplace remains source-based and documents the UI update path', async () => {
  const [marketplaceSource, readme, updateReference] = await Promise.all([
    readFile(new URL('../.agents/plugins/marketplace.json', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('skills/claw-kit-doc/references/update.md', root), 'utf8'),
  ]);

  const marketplace = JSON.parse(marketplaceSource);
  assert.ok(marketplace.plugins.some((entry) =>
    entry.name === 'claw-kit-cindy' &&
    entry.source?.source === 'local' &&
    entry.source?.path === './plugin'
  ));

  assert.match(readme, /does not expose an `update` Skill/);
  assert.match(readme, /\.agents\/skills\/claw-kit-doc\/references\/update\.md/);
  assert.match(updateReference, /Open the \*\*Plugins\*\* page/);
  assert.match(updateReference, /Click \*\*Market\*\* in the upper-right corner/);
  assert.match(updateReference, /Open \*\*Installed Markets\*\* and refresh/);
  assert.match(updateReference, /Return to the \*\*Plugins\*\* page/);
  assert.match(updateReference, /Update \*\*claw-kit\*\*/);
  assert.match(updateReference, /updates available source metadata/);
  assert.match(updateReference, /accept\s+the claw-kit update separately/);
});

test('Cindy release version follows the CLI base rather than an older Cindy tag', async () => {
  const releasing = await readFile(new URL('../RELEASING.md', import.meta.url), 'utf8');
  assert.match(releasing, /authorized CLI candidate/);
  assert.match(releasing, /published `@veewo\/claw` version/);
  assert.match(releasing, /<cli-base>\.<next-fourth-segment>/);
  assert.match(releasing, /not a separate three-segment version line/);
});

test('Cindy omits WUM prompt injection and keeps session-start work asynchronous', async () => {
  const [source, entry, host, manifestSource, worker] = await Promise.all([
    readFile(new URL('main.js', root), 'utf8'),
    readFile(new URL('skills/using-claw-kit/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/using-claw-kit/references/hosts/cindy.md', root), 'utf8'),
    readFile(new URL('ghost.json', root), 'utf8'),
    readFile(new URL('node/claw-worker.cjs', root), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);
  const skill = `${entry}\n${host}`;
  assert.deepEqual(manifest.agent, { background: true });
  assert.doesNotMatch(source, /CINDY_CLAW_ENTRY_PROMPT|Use claw-kit:using-claw-kit/);
  assert.doesNotMatch(source, /First call the Ghost tool/);
  assert.doesNotMatch(source, /will-user-message/);
  assert.doesNotMatch(source, /sessionPrompts|injectedSessions|preparedSessions|preparingSessions/);
  assert.match(source, /msg\.name === 'did-session-created'/);
  assert.match(source, /scheduleSessionBackground\(data\.sessionId, data\.workdir\)/);
  assert.match(source, /setTimeout\(\(\) => \{\s*void prepareSessionBackground\(sessionId, workdir\)/);
  assert.doesNotMatch(source, /await prepareSessionBackground/);
  assert.match(source, /refreshSessionStart/);
  assert.match(source, /claw\/session-start/);
  assert.match(worker, /claw\/session-start/);
  assert.match(worker, /'context', '--host', 'cindy'/);
  assert.match(worker, /function projectionForContext/);
  assert.deepEqual(manifest.subscribe.topics, ['session', 'turn']);
  assert.match(source, /runSessionMaintenance/);
  assert.match(source, /claw\/session-background/);
  assert.match(source, /Promise\.all\(\[\s*refreshSessionStart\(sessionId, workdir\),\s*runSessionMaintenance\(sessionId, workdir\)/);
  assert.doesNotMatch(source, /cindy\.agent\.errand|cindy\.agent\.queryErrand/);
  assert.equal('hooks' in manifest.subscribe, false);
  assert.match(source, /function toolFailure\(callId, reason, errorCode = 'CLAW_OPERATION_FAILED'\)/);
  assert.match(source, /tool-result', callId, ok: false, errorCode, message: reason/);
  assert.doesNotMatch(source, /sessionModels|CINDY_CLAW_ENTRY_PROMPT_GPT|data\.model/);
  assert.match(entry, /references\/hosts\/cindy\.md/);
  assert.match(host, /trusted active-plugin\/runtime context, not model family/);
  assert.match(host, /Cindy claw-kit Ghost gateway for every\s+workflow operation/);
  assert.match(host, /never fall back from a failed Ghost call to shell/i);
  assert.match(host, /A Codex model inside Cindy is still\s+platform cindy/);
  assert.match(host, /clawHost\.platform/);
  assert.match(host, /no verified first-turn hook prompt injection/);
  assert.doesNotMatch(host, /runClawPlanMutation|cacheKey|driverVersion|```javascript/);
  assert.match(manifest.description, /^\[claw host\]\nplatform: cindy\n/);
  assert.match(skill, /Use the Ghost tools in this exact order/);
  assert.match(skill, /\.\.\/claw-kit-doc\/SKILL\.md/);
  assert.match(entry, /Recovery first/);
  assert.match(entry, /do not\s+create another plan/);
  assert.match(skill, /Never pass `list_tools` itself as `call_tool\.name`/);
  assert.match(skill, /Host-forged `args\.session_context`/);
  assert.match(skill, /Do not\s+add, reconstruct, or override this field/);
  assert.match(skill, /knowledgeDispatch/);
  assert.match(skill, /If the terminal result contains a `knowledgeDispatch`/);
  assert.doesNotMatch(skill, /Session scope is temporary/);
  assert.doesNotMatch(skill, /Project-scoped plans/);
  assert.match(skill, /get_workspace_info/);
  assert.match(skill, /cindy_orca\.start_team/);
  assert.match(skill, /cindy_orca\.create_worker/);
  assert.match(skill, /Do not\s+send a later dispatch to an existing Worker/i);
  assert.match(skill, /knowledge_finalizer/);
  assert.match(skill, /Do not wait for the Worker/i);
  assert.match(skill, /Immediately finish the main response after that acknowledgement/i);
  assert.match(skill, /without polling or reading the\s+Worker/i);
  assert.match(skill, /job already exists/i);
  assert.match(skill, /knowledge\.claim/);
  assert.doesNotMatch(skill, /did-turn-end[^\n]*(capture|create).*job/i);
});

test('Goal continuation keeps structured events out of the visible prompt', async () => {
  const source = await readFile(new URL('main.js', root), 'utf8');
  assert.match(source, /promptTemplate: '\{\{user_message\}\}'/);
  assert.doesNotMatch(source, /promptTemplate: '[^']*event_json/);
  assert.match(source, /data-ghost-action="\$\{action\}"/);
  assert.match(source, /goalAuthorizationCards\.set\(cardId, true\)/);
  assert.match(source, /function goalContinuationPrompt\(goal\)/);
  assert.match(source, /taskTitle/);
  assert.match(source, /cindyAuthorizationCardIssued\.has\(sessionId\)/);
  assert.doesNotMatch(source, /cindyAuthorizationCardIssued\.delete\(sessionId\)/);
  assert.match(source, /function workflowCardState\(projection\)/);
  assert.match(source, /state: workflowCardState\(projection\)/);
  assert.doesNotMatch(source, /will-assistant-message/);
  assert.match(source, /msg\.name === 'did-turn-end'/);
  assert.match(source, /function captureTurnEndReport\(msg\)/);
  assert.match(source, /capturedTurnKeys/);
});
