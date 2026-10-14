import fs from "node:fs";
import path from "node:path";

const START = "<!-- claw-kit:bootstrap:start -->";
const END = "<!-- claw-kit:bootstrap:end -->";
const BLOCK = [
  START,
  "## claw-kit",
  "在开始项目任务或恢复上下文时，先加载并遵循 `using-claw-kit` skill。",
  "由该 skill 选择当前宿主入口、恢复已有工作流，并判断是否需要创建计划；",
  "不要为每个问题自动创建计划。",
  END,
].join("\n");

/** Only explicit hostless init calls this; automatic setup and native adapters do not. */
export function updateAgentInstructions(projectRoot: string, filename = "AGENTS.md") {
  const matches = fs.readdirSync(projectRoot).filter((name) => name.toLowerCase() === filename.toLowerCase());
  if (matches.length > 1) {
    return { path: path.join(projectRoot, filename), status: "skipped", warning: `Multiple case variants of ${filename}; files were left unchanged.` };
  }
  const filePath = path.join(projectRoot, matches[0] ?? filename);
  const exists = fs.existsSync(filePath);
  const current = exists ? fs.readFileSync(filePath, "utf8") : "";
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const block = BLOCK.replace(/\n/g, eol);
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  // An ambiguous user-edited block is not safe to replace. Leave it untouched.
  if ((start >= 0 || end >= 0) && (start < 0 || end < start ||
      current.indexOf(START, start + START.length) >= 0 ||
      current.indexOf(END, end + END.length) >= 0)) {
    return { path: filePath, status: "skipped", warning: `Malformed or duplicate claw-kit bootstrap markers; ${path.basename(filePath)} was left unchanged.` };
  }
  const next = start >= 0
    ? current.slice(0, start) + block + current.slice(end + END.length)
    : current + (current && !current.endsWith(eol + eol) ? (current.endsWith(eol) ? eol : eol + eol) : "") + block + eol;
  if (next === current) return { path: filePath, status: "unchanged" };
  fs.writeFileSync(filePath, next, "utf8");
  return { path: filePath, status: exists ? "updated" : "created" };
}
