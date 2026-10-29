const fs = require('node:fs');
const path = require('node:path');
const { readPlanFinalAnswers } = require('./cindy-sqlite-reader.cjs');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  let request;
  try { request = JSON.parse(chunks.join('')); } catch { process.exitCode = 2; return; }
  if (request?.host !== 'cindy') { process.exitCode = 2; return; }
  const events = readPlanFinalAnswers(request.sessionId, request.startedAt, request.planPath, request.projectRoot, request.endedAt);
  if (!events) throw Object.assign(new Error('The source Cindy session is unavailable.'), { code: 'CINDY_SOURCE_SESSION_UNAVAILABLE' });
  fs.mkdirSync(path.dirname(request.stagingReportPath), { recursive: true });
  fs.writeFileSync(request.stagingReportPath, events.length ? `${events.map((event) => JSON.stringify(event)).join('\n')}\n` : '', 'utf8');
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ error: { code: error?.code || 'CINDY_HISTORY_READ_FAILED', message: error?.message || String(error) } }) + '\n');
  process.exitCode = 1;
});
