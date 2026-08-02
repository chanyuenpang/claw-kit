import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../plugin/', import.meta.url);

test('Cindy plugin exposes the full claw-kit skill surface', async () => {
  const manifest = JSON.parse(await readFile(new URL('ghost.json', root), 'utf8'));
  const names = manifest.skill.items.map((item) => item.name).sort();
  assert.deepEqual(names, ['planning', 'researcher', 'using-claw-kit']);

  for (const entry of [
    'skills/using-claw-kit/SKILL.md',
    'skills/config/SKILL.md',
    'skills/planning/SKILL.md',
    'skills/researcher/SKILL.md',
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
  assert.match(skill, /Cindy-owned update implementation/);
  assert.match(skill, /Each supported platform maintains\s+its own adjacent `update` skill/);
  assert.match(skill, /shared\s+global CLI together with that platform's plugin/);
  assert.match(template, /immutable official GitHub Release URL/);
  assert.match(fallback, /If the newest stable `vcindy-\*`\s+release has no matching `\.cindy` asset/is);
  assert.doesNotMatch(`${skill}\n${template}\n${fallback}`, /marketplace (?:add|upgrade)|--ref main/);
});

test('Repository Cindy E2E skill creates separate Codex and non-Codex lanes and leaves lifecycle semantics to using-claw-kit', async () => {
  const [source, interfaceSource] = await Promise.all([
    readFile(new URL('../../../.agents/skills/cindy-claw-e2e/SKILL.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../.agents/skills/cindy-claw-e2e/agents/openai.yaml', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /Use this skill in the controller or implementation thread/);
  assert.match(source, /Run two independent lanes/);
  assert.match(source, /a Codex main session/);
  assert.match(source, /a non-Codex main session/);
  assert.match(source, /Dispatch both lanes in the same controller run/);
  assert.match(source, /Do not end the controller turn\s+after creating only the first lane/);
  assert.match(source, /call\s+`send_to_session` in create mode/);
  assert.match(source, /omit `target_session_id`/);
  assert.match(source, /set `working_dir` to the absolute project root/);
  assert.match(source, /set `use_worktree` to `false`/);
  assert.match(source, /`agent_kind: codex`/);
  assert.match(source, /DeepSeek or other non-GPT model/);
  assert.match(source, /helper create mode inherits the current session's agent and model/);
  assert.match(source, /do not call it from a Codex controller\s+to fabricate the non-Codex lane/);
  assert.match(source, /two-session launcher flow/);
  assert.match(source, /Global\s+New may create `workspaceKind: dialogue`/);
  assert.match(source, /absolute project root as `working_dir`/);
  assert.match(source, /`workspaceKind` is not `dialogue`/);
  assert.match(source, /perform New,[\s\S]*in one UI transaction/);
  assert.match(source, /prompt leaves the composer and a new session id/);
  assert.match(source, /Obtain concrete\s+creation receipts for both lanes before ending the controller turn/i);
  assert.match(source, /测试通道：\{\{lane\}\}/);
  assert.match(source, /唯一计划标题：\{\{title\}\}/);
  assert.match(source, /唯一任务结论标记：\{\{marker\}\}/);
  assert.match(source, /using-claw-kit/);
  assert.match(source, /cindy_helper\.get_chat_history/);
  assert.match(source, /The controller owns this inspection/);
  assert.match(source, /one passing lane never proves the other/);
  assert.doesNotMatch(source, /literal argument `"scope": "project"`/);
  assert.doesNotMatch(source, /cindy_orca\./);
  assert.doesNotMatch(source, /\$cindy-claw-e2e/);
  assert.match(interfaceSource, /dispatch both Codex and non-Codex normal Cindy project lanes in one controller run/);
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
