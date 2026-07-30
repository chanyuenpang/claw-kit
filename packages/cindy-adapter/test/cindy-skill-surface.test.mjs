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

test('Cindy entry prompt routes through the main skill and leaves Ghost mechanics to it', async () => {
  const [source, skill] = await Promise.all([
    readFile(new URL('main.js', root), 'utf8'),
    readFile(new URL('skills/using-claw-kit/SKILL.md', root), 'utf8'),
  ]);
  assert.match(source, /Load claw-kit:using-claw-kit as the main workflow skill for this session/);
  assert.match(source, /Follow the claw workflowGuidance return fields as the required next-step contract/);
  assert.doesNotMatch(source, /First call the Ghost tool/);
  assert.match(skill, /Use the Ghost tools in this exact order/);
  assert.match(skill, /Never pass `list_tools` itself as `call_tool\.name`/);
  assert.match(skill, /Host-forged `args\.session_context`/);
  assert.match(skill, /Do not\s+add, reconstruct, or override this field/);
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
  assert.match(source, /session-start-failed-retryable/);
  assert.match(source, /msg\.name === 'will-assistant-message'/);
  assert.match(source, /msg\.name === 'did-turn-end'/);
  assert.match(source, /function captureTurnEndReport\(msg\)/);
  assert.match(source, /capturedTurnKeys/);
});
