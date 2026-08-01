import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../plugin/', import.meta.url);

test('Cindy plugin exposes the full claw-kit skill surface', async () => {
  const manifest = JSON.parse(await readFile(new URL('ghost.json', root), 'utf8'));
  const names = manifest.skill.items.map((item) => item.name).sort();
  assert.deepEqual(names, ['cindy-claw-e2e', 'planning', 'researcher', 'using-claw-kit']);

  for (const entry of [
    'skills/using-claw-kit/SKILL.md',
    'skills/config/SKILL.md',
    'skills/planning/SKILL.md',
    'skills/researcher/SKILL.md',
    'skills/cindy-claw-e2e/SKILL.md',
    'skills/create-claw-skill/SKILL.md',
    'skills/update/SKILL.md',
  ]) {
    await readFile(new URL(entry, root), 'utf8');
  }
});

test('Cindy release and update contracts retain one rollback package and install the latest matching GitHub asset', async () => {
  const [releaseRule, skill, template, fallback, coverage] = await Promise.all([
    readFile(new URL('../../../.agents/skills/release-cindy-plugin/references/artifact.md', import.meta.url), 'utf8'),
    readFile(new URL('skills/update/SKILL.md', root), 'utf8'),
    readFile(new URL('skills/update/TEMPLATE.json', root), 'utf8'),
    readFile(new URL('skills/update/non-claw-fallback.md', root), 'utf8'),
    readFile(new URL('skills/update/CONTENT-COVERAGE.md', root), 'utf8'),
  ]);

  assert.match(releaseRule, /target release artifact.*single\s+rollback package/is);
  assert.match(releaseRule, /parse version segments numerically/is);
  assert.match(releaseRule, /Delete every other matching local build output/is);

  for (const source of [skill, template, fallback, coverage]) {
    assert.match(source, /vcindy-/);
    assert.match(source, /\.cindy/);
    assert.match(source, /GitHub Release/i);
  }
  assert.match(skill, /Do not use the\s+repository-wide `releases\/latest` shortcut/is);
  assert.match(template, /immutable official GitHub Release URL/);
  assert.match(fallback, /If the newest stable `vcindy-\*`\s+release has no matching `\.cindy` asset/is);
  assert.doesNotMatch(`${skill}\n${template}\n${fallback}`, /marketplace (?:add|upgrade)|--ref main/);
});

test('Cindy E2E skill rejects session-scope and reconstructed dispatch samples', async () => {
  const source = await readFile(new URL('skills/cindy-claw-e2e/SKILL.md', root), 'utf8');
  assert.match(source, /literal argument `"scope": "project"`/);
  assert.match(source, /under `<project-root>\/\.claw\/tasks\/`/);
  assert.match(source, /never under a user-level `\.claw\/runtime\/sessions\/`/);
  assert.match(source, /exact 64-hex `finalizeId`/);
  assert.match(source, /never derive a finalize id, reconstruct a Writer prompt/);
  assert.match(source, /Dispatch `knowledgeDispatch\.prompt` byte-for-byte unchanged/);
  assert.match(source, /Worker agent must be `codex`/);
  assert.match(source, /never inherit the Lead agent kind or substitute `claude-code`/);
  assert.match(source, /writer\.executionPolicy: subagent/);
  assert.match(source, /Do not manually call `did-turn-end`, `capture-report`/);
});

test('Cindy omits WUM prompt injection and keeps session-start work asynchronous', async () => {
  const [source, skill, manifestSource, worker] = await Promise.all([
    readFile(new URL('main.js', root), 'utf8'),
    readFile(new URL('skills/using-claw-kit/SKILL.md', root), 'utf8'),
    readFile(new URL('ghost.json', root), 'utf8'),
    readFile(new URL('node/claw-worker.cjs', root), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);
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
  assert.match(worker, /hook', 'auto-claw/);
  assert.deepEqual(manifest.subscribe.topics, ['session', 'turn']);
  assert.match(source, /runSessionMaintenance/);
  assert.match(source, /claw\/session-background/);
  assert.match(source, /Promise\.all\(\[\s*refreshSessionStart\(sessionId, workdir\),\s*runSessionMaintenance\(sessionId, workdir\)/);
  assert.doesNotMatch(source, /cindy\.agent\.errand|cindy\.agent\.queryErrand/);
  assert.deepEqual(manifest.subscribe.hooks, ['will-assistant-message']);
  assert.match(source, /function toolFailure\(callId, reason, errorCode = 'CLAW_OPERATION_FAILED'\)/);
  assert.match(source, /tool-result', callId, ok: false, errorCode, message: reason/);
  assert.doesNotMatch(source, /sessionModels|CINDY_CLAW_ENTRY_PROMPT_GPT|data\.model/);
  assert.match(skill, /know.*GPT\/Codex.*Shell \+ bridge/is);
  assert.match(skill, /not sure.*Ghost tool/is);
  assert.match(skill, /Use the Ghost tools in this exact order/);
  assert.match(skill, /Never pass `list_tools` itself as `call_tool\.name`/);
  assert.match(skill, /Host-forged `args\.session_context`/);
  assert.match(skill, /Do not\s+add, reconstruct, or override this field/);
  assert.match(skill, /knowledgeDispatch/);
  assert.match(skill, /cindy_orca\.get_workspace_info/);
  assert.match(skill, /cindy_orca\.start_team/);
  assert.match(skill, /cindy_orca\.create_worker/);
  assert.match(skill, /cindy_orca\.send_to_worker/);
  assert.match(skill, /knowledge-finalizer/);
  assert.match(skill, /Do not wait for the Worker/i);
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
  assert.match(source, /state: projection\.planStatus === 'process\.active' \? 'working' : 'done'/);
  assert.match(source, /msg\.name === 'will-assistant-message'/);
  assert.match(source, /msg\.name === 'did-turn-end'/);
  assert.match(source, /function captureTurnEndReport\(msg\)/);
  assert.match(source, /capturedTurnKeys/);
});
