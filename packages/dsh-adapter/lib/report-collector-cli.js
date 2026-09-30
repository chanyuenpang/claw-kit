import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const input = await readInput();
if (!input || input.host !== "dsh")
    process.exit(2);
const root = process.env.CLAW_DSH_REPORT_JOURNAL_DIR ?? path.join(process.env.LOCALAPPDATA ?? (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Local") : path.join(os.homedir(), ".local", "share")), "claw", "dsh-report-journal");
const journalPath = path.join(root, `${input.sessionId}.json`);
// Missing history is not a missing claim: preserve earlier canonical evidence
// and publish an empty capture rather than failing the writer handoff.
const startedAt = typeof input.startedAt === "string" ? Date.parse(input.startedAt) : Number.NaN;
const events = (fs.existsSync(journalPath)
    ? JSON.parse(fs.readFileSync(journalPath, "utf8")).events ?? []
    : []).filter((event) => {
    if (!Number.isFinite(startedAt) || typeof event?.occurredAt !== "string")
        return true;
    return Date.parse(event.occurredAt) >= startedAt;
});
events.sort((left, right) => {
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.NaN;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.NaN;
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime)
        return leftTime - rightTime;
    return 0;
});
fs.mkdirSync(path.dirname(input.stagingReportPath), { recursive: true });
const existing = typeof input.canonicalReportPath === "string" && fs.existsSync(input.canonicalReportPath)
    ? fs.readFileSync(input.canonicalReportPath, "utf8") : "";
const additions = events.map((event) => JSON.stringify(event)).filter((line) => !existing.split(/\r?\n/).includes(line));
fs.writeFileSync(input.stagingReportPath, existing + (existing && !existing.endsWith("\n") && additions.length ? "\n" : "") +
    (additions.length ? `${additions.join("\n")}\n` : ""), "utf8");
async function readInput() { const chunks = []; for await (const chunk of process.stdin)
    chunks.push(String(chunk)); try {
    return JSON.parse(chunks.join(""));
}
catch {
    return null;
} }
//# sourceMappingURL=report-collector-cli.js.map