const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE_PATTERN = /^cindy-[^\\/]+\.db$/i;

function candidateUserDataDirs() {
  const dirs = [];
  if (process.env.CINDY_USER_DATA) dirs.push(process.env.CINDY_USER_DATA);
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'Cindy'));
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Cindy'));
  if (process.env.XDG_CONFIG_HOME) dirs.push(path.join(process.env.XDG_CONFIG_HOME, 'Cindy'));
  if (process.env.HOME) dirs.push(path.join(process.env.HOME, 'Library', 'Application Support', 'Cindy'));
  return [...new Set(dirs.filter(Boolean).map((dir) => path.resolve(dir)))];
}

function readJsonContent(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  try { return JSON.parse(value); } catch { return value; }
}

function containsSuccessfulTaskDone(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSuccessfulTaskDone);
  if (value.ok === true && value.command === 'task.done') return true;
  return Object.values(value).some(containsSuccessfulTaskDone);
}

function findDatabaseForSession(sessionId) {
  for (const userDataDir of candidateUserDataDirs()) {
    let entries;
    try { entries = fs.readdirSync(userDataDir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !DB_FILE_PATTERN.test(entry.name)) continue;
      const filePath = path.join(userDataDir, entry.name);
      let db;
      try {
        db = new DatabaseSync(filePath, { readOnly: true });
        db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000;');
        const row = db.prepare('SELECT 1 AS present FROM sessions WHERE id = ? LIMIT 1').get(sessionId);
        if (row) return { db, filePath };
        db.close();
      } catch {
        try { db?.close(); } catch { /* fail open */ }
      }
    }
  }
  return null;
}

function messageText(value) {
  const content = readJsonContent(value);
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((item) => typeof item === 'string' ? item : item?.text).filter(Boolean).join('\n').trim();
  }
  return typeof content?.text === 'string' ? content.text.trim() : '';
}

function readSessionMessages(db, sessionId) {
  return db.prepare(`
    SELECT rowid, id, client_id, role, content, tool_use_id, created_at
    FROM messages
    WHERE session_id = ? AND rewind_at IS NULL
    ORDER BY created_at ASC, rowid ASC
  `).all(sessionId);
}

function readTurnCapture(sessionId) {
  if (!sessionId) return null;
  const match = findDatabaseForSession(sessionId);
  if (!match) return null;
  try {
    const rows = readSessionMessages(match.db, sessionId);
    let end = -1;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].role === 'assistant' && messageText(rows[index].content)) {
        end = index;
        break;
      }
    }
    if (end < 0) return null;
    let start = 0;
    for (let index = end; index >= 0; index -= 1) {
      if (rows[index].role === 'user') {
        start = index + 1;
        break;
      }
    }
    const finalRow = rows[end];
    const turnId = String(finalRow.client_id || finalRow.id || `row-${finalRow.rowid}`);
    let latestAssistant = '';
    const conclusions = [];
    const seen = new Set();
    for (const row of rows.slice(start, end + 1)) {
      if (row.role === 'assistant') {
        const text = messageText(row.content);
        if (text) latestAssistant = text;
        continue;
      }
      if (row.role !== 'tool_result' || !latestAssistant) continue;
      if (!containsSuccessfulTaskDone(readJsonContent(row.content))) continue;
      if (seen.has(latestAssistant)) continue;
      seen.add(latestAssistant);
      conclusions.push({ turnId, message: latestAssistant });
    }
    return {
      turnId,
      message: messageText(finalRow.content),
      taskConclusions: conclusions,
    };
  } catch {
    return null;
  } finally {
    try { match.db.close(); } catch { /* fail open */ }
  }
}

async function readTurnCaptureWithRetry(sessionId) {
  const delays = [0, 25, 75, 150, 300];
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const capture = readTurnCapture(sessionId);
    if (capture?.message) return capture;
  }
  return null;
}

module.exports = { readTurnCapture, readTurnCaptureWithRetry };
