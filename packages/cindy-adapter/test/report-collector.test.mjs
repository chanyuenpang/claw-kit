import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

test("Cindy claim collector keeps window conversation and nearest trigger, filters structures and forwards endedAt", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-cindy-report-"));
  try {
    const db = new DatabaseSync(path.join(root, "cindy-test.db"));
    try {
      db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY);
        INSERT INTO sessions VALUES ('parent');
        CREATE TABLE messages (id TEXT, client_id TEXT, session_id TEXT, role TEXT, content TEXT, tool_use_id TEXT, created_at INTEGER, rewind_at INTEGER);`);
      const insert = db.prepare("INSERT INTO messages VALUES (?, 'same-turn', 'parent', ?, ?, NULL, ?, NULL)");
      const rows = [
        ['user', 'old request', 1], ['assistant', 'old response', 2],
        ['user', 'trigger', 3], ['assistant', 'preceding commentary', 4],
        ['assistant', [{ type: 'text', text: 'first commentary' }, { type: 'thinking', text: 'private' }, { type: 'reasoning', text: 'private' }, { type: 'tool_result', text: 'private' }], 5],
        ['assistant', 'second commentary', 5], ['user', [{ type: 'input_text', text: 'correction' }], 6],
        ['system', 'private', 6], ['tool_result', 'private', 6], ['thinking', 'private', 6],
        ['assistant', { type: 'reasoning', text: 'private' }, 6],
        ['assistant', { type: 'output_text', text: 'final' }, 7],
        ['assistant', 'at upper boundary', 8], ['user', 'after boundary', 9],
      ];
      rows.forEach(([role, content, time], index) => insert.run(String(index), role, JSON.stringify(content), time));
    } finally { db.close(); }
    const report = path.join(root, 'report.jsonl');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../plugin/node/report-collector.cjs', import.meta.url))], {
      env: { ...process.env, CINDY_USER_DATA: root }, encoding: 'utf8',
      input: JSON.stringify({ host: 'cindy', sessionId: 'parent', startedAt: '1970-01-01T00:00:05Z', endedAt: '1970-01-01T00:00:08Z', stagingReportPath: report }),
    });
    assert.equal(result.status, 0, result.stderr);
    const events = fs.readFileSync(report, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(({ role, message }) => [role, message]), [
      ['user', 'trigger'], ['assistant', 'first commentary'], ['assistant', 'second commentary'],
      ['user', 'correction'], ['assistant', 'final'],
    ]);
    assert.ok(events.every(event => event.turnId === 'same-turn'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
