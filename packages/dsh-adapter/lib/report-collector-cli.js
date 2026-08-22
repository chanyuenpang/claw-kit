import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const input = await readInput();
if (!input || input.host !== "dsh")
    process.exit(2);
const root = process.env.CLAW_DSH_REPORT_JOURNAL_DIR ?? path.join(process.env.LOCALAPPDATA ?? (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Local") : path.join(os.homedir(), ".local", "share")), "claw", "dsh-report-journal");
const journalPath = path.join(root, `${input.sessionId}.json`);
if (!fs.existsSync(journalPath))
    process.exit(3);
const startedAt = typeof input.startedAt === "string" ? Date.parse(input.startedAt) : Number.NaN;
const events = (JSON.parse(fs.readFileSync(journalPath, "utf8")).events ?? []).filter((event) => {
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
fs.writeFileSync(input.stagingReportPath, events.length ? `${events.map((event) => JSON.stringify(event)).join("\n")}\n` : "", "utf8");
async function readInput() { const chunks = []; for await (const chunk of process.stdin)
    chunks.push(String(chunk)); try {
    return JSON.parse(chunks.join(""));
}
catch {
    return null;
} }
//# sourceMappingURL=report-collector-cli.js.map