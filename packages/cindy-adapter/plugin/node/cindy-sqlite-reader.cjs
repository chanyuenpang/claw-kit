const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE_PATTERN = /^cindy-[^\\/]+\.db$/i;

function candidateUserDataDirs(env = process.env, homeDir = os.homedir()) {
  const dirs = [];
  if (env.CINDY_USER_DATA) dirs.push(env.CINDY_USER_DATA);
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'Cindy'));
  if (env.LOCALAPPDATA) dirs.push(path.join(env.LOCALAPPDATA, 'Cindy'));
  if (env.XDG_CONFIG_HOME) dirs.push(path.join(env.XDG_CONFIG_HOME, 'Cindy'));
  if (env.HOME) dirs.push(path.join(env.HOME, 'Library', 'Application Support', 'Cindy'));
  // Cindy intentionally sanitizes Ghost utilityProcess environments and does
  // not expose APPDATA / LOCALAPPDATA / HOME. os.homedir() uses the platform
  // account API, so derive the standard Cindy roots without weakening Host
  // environment isolation.
  if (homeDir) {
    dirs.push(path.join(homeDir, 'AppData', 'Roaming', 'Cindy'));
    dirs.push(path.join(homeDir, 'AppData', 'Local', 'Cindy'));
    dirs.push(path.join(homeDir, 'Library', 'Application Support', 'Cindy'));
    dirs.push(path.join(homeDir, '.config', 'Cindy'));
  }
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

function findDatabaseForSession(sessionId, options = {}) {
  for (const userDataDir of candidateUserDataDirs(options.env, options.homeDir)) {
    let entries;
    try { entries = fs.readdirSync(userDataDir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !DB_FILE_PATTERN.test(entry.name)) continue;
      const filePath = path.join(userDataDir, entry.name);
      let db;
      try {
        db = new DatabaseSync(filePath, { readOnly: true });
        db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000;');
        let row = db.prepare('SELECT id FROM sessions WHERE id = ? LIMIT 1').get(sessionId);
        if (!row) {
          try { row = db.prepare('SELECT id FROM sessions WHERE sdk_session_id = ? LIMIT 1').get(sessionId); } catch { /* older schema */ }
        }
        if (!row) {
          try {
            row = db.prepare(`
              SELECT session_id AS id
              FROM messages
              WHERE agent_meta IS NOT NULL
                AND json_valid(agent_meta)
                AND json_extract(agent_meta, '$.sdkSessionId') = ?
              ORDER BY created_at DESC
              LIMIT 1
            `).get(sessionId);
          } catch { /* older schema */ }
        }
        if (row?.id) return { db, filePath, cindySessionId: String(row.id) };
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

function containsKnowledgeDispatch(value, finalizeId) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsKnowledgeDispatch(item, finalizeId));
  if (value.knowledgeDispatch?.policy === 'subagent' && value.knowledgeDispatch?.finalizeId === finalizeId) {
    return true;
  }
  return Object.values(value).some((item) => containsKnowledgeDispatch(item, finalizeId));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readHistoricalSdkSessionIds(db, sessionId) {
  try {
    return db.prepare(`
      SELECT DISTINCT json_extract(agent_meta, '$.sdkSessionId') AS session_id
      FROM messages
      WHERE session_id = ?
        AND agent_meta IS NOT NULL
        AND json_valid(agent_meta)
    `).all(sessionId).map((row) => nonEmptyString(row.session_id)).filter(Boolean);
  } catch {
    return [];
  }
}

function readKnowledgeSessionTargetFromClawDir(clawDir, sessionId) {
  const key = createHash('sha256').update(sessionId).digest('hex');
  const registryPath = path.join(clawDir, 'runtime', 'knowledge-sessions', `${key}.json`);
  if (!fs.existsSync(registryPath)) return { status: 'missing' };
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (nonEmptyString(registry?.sessionId) !== sessionId) return { status: 'invalid' };
    return {
      status: 'found',
      pendingPlanPath: nonEmptyString(registry?.pendingTurnOwner?.planPath),
      activePlanPath: nonEmptyString(registry?.activePlanPath),
    };
  } catch {
    return { status: 'invalid' };
  }
}

function readProjectKnowledgeSessionTarget(workdir, sessionId) {
  return readKnowledgeSessionTargetFromClawDir(path.join(workdir, '.claw'), sessionId);
}

function sessionWorkflowBaseDir() {
  const explicit = nonEmptyString(process.env.CLAW_SESSION_RUNTIME_DIR);
  return explicit ? path.resolve(explicit) : path.join(os.homedir(), '.claw', 'runtime', 'sessions');
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readSessionWorkflowTarget(workdir, sessionId) {
  const key = createHash('sha256').update(sessionId).digest('hex');
  const clawDir = path.join(sessionWorkflowBaseDir(), key);
  const manifestPath = path.join(clawDir, 'session.json');
  if (!fs.existsSync(manifestPath)) return { status: 'missing' };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest?.version !== 1
      || manifest?.scope !== 'session'
      || !nonEmptyString(manifest?.originCwd)
      || comparablePath(manifest.originCwd) !== comparablePath(workdir)) {
      return { status: 'invalid' };
    }
    return { ...readKnowledgeSessionTargetFromClawDir(clawDir, sessionId), clawDir };
  } catch {
    return { status: 'invalid' };
  }
}

function resolveCindySessionContext(sessionId, options = {}) {
  const cindySessionId = nonEmptyString(sessionId);
  if (!cindySessionId) {
    return {
      ok: false,
      status: 'session-not-found',
      errorCode: 'CINDY_SESSION_NOT_FOUND',
      reason: 'Cindy session id is unavailable.',
      cindySessionId: '',
    };
  }
  const match = findDatabaseForSession(cindySessionId, options);
  if (!match) {
    return {
      ok: false,
      status: 'session-not-found',
      errorCode: 'CINDY_SESSION_NOT_FOUND',
      reason: 'Cindy session is unavailable in the local database.',
      cindySessionId,
    };
  }
  try {
    const row = match.db.prepare(`
      SELECT id, sdk_session_id, agent_kind, workspace_kind, working_dir
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `).get(match.cindySessionId);
    const workdirValue = nonEmptyString(row?.working_dir);
    if (!workdirValue) {
      return {
        ok: false,
        status: 'missing-workdir',
        errorCode: 'CINDY_SESSION_WORKDIR_UNAVAILABLE',
        reason: 'Cindy session has no working directory.',
        cindySessionId,
      };
    }
    const workdir = path.resolve(workdirValue);
    const currentSdkSessionId = nonEmptyString(row?.sdk_session_id);
    const historicalSdkSessionIds = readHistoricalSdkSessionIds(match.db, match.cindySessionId);
    const candidates = [...new Set([
      currentSdkSessionId,
      cindySessionId,
      ...historicalSdkSessionIds,
    ].filter(Boolean))];
    const bindingPath = path.join(workdir, '.claw', 'runtime', 'session-bindings.json');
    let bindings = {};
    let bindingError = null;
    try {
      const bindingFile = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
      if (bindingFile && typeof bindingFile.bindings === 'object' && !Array.isArray(bindingFile.bindings)) {
        bindings = bindingFile.bindings;
      } else {
        bindingError = {
          errorCode: 'CINDY_SESSION_BINDINGS_INVALID',
          reason: 'The claw session binding registry is invalid.',
        };
      }
    } catch (error) {
      const unavailable = error && typeof error === 'object' && error.code === 'ENOENT';
      if (!unavailable) {
        bindingError = {
          errorCode: 'CINDY_SESSION_BINDINGS_INVALID',
          reason: 'The claw session binding registry is unreadable.',
        };
      }
    }
    let knowledgeRegistryInvalid = false;
    const matches = candidates.flatMap((candidate) => {
      const projectTarget = readProjectKnowledgeSessionTarget(workdir, candidate);
      const sessionTarget = readSessionWorkflowTarget(workdir, candidate);
      if (projectTarget.status === 'invalid' || sessionTarget.status === 'invalid') {
        knowledgeRegistryInvalid = true;
      }
      const projectPlanPath = projectTarget.pendingPlanPath
        || nonEmptyString(bindings[candidate])
        || projectTarget.activePlanPath;
      const sessionPlanPath = sessionTarget.pendingPlanPath || sessionTarget.activePlanPath;
      const candidateMatches = [];
      if (projectPlanPath) {
        candidateMatches.push({
          candidate,
          planPath: projectPlanPath,
          clawDir: path.join(workdir, '.claw'),
        });
      }
      if (sessionPlanPath) {
        candidateMatches.push({ candidate, planPath: sessionPlanPath, clawDir: sessionTarget.clawDir });
      }
      return candidateMatches;
    });
    const plans = new Set(matches.map((candidate) => (
      `${comparablePath(candidate.clawDir)}\0${candidate.planPath}`
    )));
    if (plans.size === 0) {
      return {
        ok: false,
        status: 'unbound',
        errorCode: bindingError?.errorCode
          || (knowledgeRegistryInvalid ? 'CINDY_KNOWLEDGE_SESSION_INVALID' : 'CINDY_SESSION_UNBOUND'),
        reason: bindingError?.reason
          || (knowledgeRegistryInvalid
            ? 'The claw knowledge session registry is unreadable.'
            : 'No claw plan is bound to this Cindy session.'),
        cindySessionId,
        workdir,
      };
    }
    if (plans.size > 1) {
      return {
        ok: false,
        status: 'identity-conflict',
        errorCode: 'CINDY_SESSION_IDENTITY_CONFLICT',
        reason: 'Cindy session identities are bound to different claw plans.',
        cindySessionId,
        workdir,
      };
    }
    const selected = matches[0];
    return {
      ok: true,
      status: 'bound',
      cindySessionId,
      clawSessionId: selected.candidate,
      workdir,
      planPath: selected.planPath,
      agentKind: nonEmptyString(row?.agent_kind),
      workspaceKind: nonEmptyString(row?.workspace_kind),
    };
  } catch {
    return {
      ok: false,
      status: 'session-read-failed',
      errorCode: 'CINDY_SESSION_READ_FAILED',
      reason: 'Cindy session context could not be read.',
      cindySessionId,
    };
  } finally {
    try { match.db.close(); } catch { /* fail open */ }
  }
}

function readTurnCapture(sessionId) {
  if (!sessionId) return null;
  const match = findDatabaseForSession(sessionId);
  if (!match) return null;
  try {
    const rows = readSessionMessages(match.db, match.cindySessionId);
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

function readKnowledgeClaimCapture(sessionId, finalizeId, startedAt) {
  if (!sessionId || !/^[a-f0-9]{64}$/i.test(finalizeId || '')) return null;
  const match = findDatabaseForSession(sessionId);
  if (!match) return null;
  try {
    const startedAtMs = typeof startedAt === 'string' ? Date.parse(startedAt) : Number.NaN;
    const rows = readSessionMessages(match.db, match.cindySessionId).filter((row) => {
      if (!Number.isFinite(startedAtMs)) return true;
      const raw = Number(row.created_at);
      if (!Number.isFinite(raw)) return true;
      const createdAtMs = raw < 100_000_000_000 ? raw * 1000 : raw;
      return createdAtMs >= startedAtMs;
    });
    let latestAssistant = '';
    let latestTurnId = '';
    const conclusions = [];
    const seen = new Set();
    for (const row of rows) {
      if (row.role === 'assistant') {
        const text = messageText(row.content);
        if (text) {
          latestAssistant = text;
          latestTurnId = String(row.client_id || row.id || `row-${row.rowid}`);
        }
        continue;
      }
      if (row.role !== 'tool_result') continue;
      const content = readJsonContent(row.content);
      if (latestAssistant && containsSuccessfulTaskDone(content)) {
        const key = `${latestTurnId}\n${latestAssistant}`;
        if (!seen.has(key)) {
          seen.add(key);
          conclusions.push({ turnId: latestTurnId, message: latestAssistant });
        }
      }
      if (containsKnowledgeDispatch(content, finalizeId)) {
        return {
          sessionId,
          turnId: String(row.client_id || latestTurnId || row.id || `row-${row.rowid}`),
          taskConclusions: conclusions,
        };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    try { match.db.close(); } catch { /* fail open */ }
  }
}

async function readKnowledgeClaimCaptureWithRetry(sessionId, finalizeId, startedAt) {
  const delays = [0, 50, 100, 250, 500, 1000, 2000];
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const capture = readKnowledgeClaimCapture(sessionId, finalizeId, startedAt);
    if (capture) return capture;
  }
  return null;
}

module.exports = {
  candidateUserDataDirs,
  readKnowledgeClaimCapture,
  readKnowledgeClaimCaptureWithRetry,
  readTurnCapture,
  readTurnCaptureWithRetry,
  resolveCindySessionContext,
};
