const fs = require('node:fs');
const path = require('node:path');
const { readPlanFinalAnswers } = require('./cindy-sqlite-reader.cjs');

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  let request;
  try { request = JSON.parse(chunks.join('')); } catch { process.exitCode = 2; return; }
  if (request?.host !== 'cindy') { process.exitCode = 2; return; }
  const events = readPlanFinalAnswers(request.sessionId, request.startedAt, request.planPath, request.projectRoot);
  if (!events) { process.exitCode = 3; return; }
  fs.mkdirSync(path.dirname(request.stagingReportPath), { recursive: true });
  fs.writeFileSync(request.stagingReportPath, events.length ? `${events.map((event) => JSON.stringify(event)).join('\n')}\n` : '', 'utf8');
}
main();
