const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

// Host supplies sessionId. Reserve before returning a verdict: after an unknown
// outcome, prefer the catalog fallback over repeating the session introduction.
function claimEntryHook(sessionId, stateRoot = path.join(os.homedir(), '.agents', '.claw-kit-cindy-hooks')) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw Object.assign(new Error('Missing Host session identity.'), { code: 'SESSION_CONTEXT_UNAVAILABLE' });
  const filename = createHash('sha256').update(sessionId).digest('hex') + '.json';
  fs.mkdirSync(stateRoot, { recursive: true });
  try {
    fs.writeFileSync(path.join(stateRoot, filename), JSON.stringify({ introducedAt: new Date().toISOString() }), { flag: 'wx' });
    return { ok: true, claimed: true };
  } catch (error) {
    if (error.code === 'EEXIST') return { ok: true, claimed: false };
    throw error;
  }
}
module.exports = { claimEntryHook };
