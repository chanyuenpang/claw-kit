import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.resolve(import.meta.dirname, "..");
const originalCorpusPath = path.join(repoRoot, "benchmarks", "search", "tiny-world-model-comparison-corpus.json");

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const projectRoot = path.resolve(flag("--project-root") ?? "");
const developmentOutput = path.resolve(repoRoot, flag("--development-output") ?? "benchmarks/search/tiny-world-hybrid-development-corpus.json");
const holdoutOutput = path.resolve(repoRoot, flag("--holdout-output") ?? "benchmarks/search/tiny-world-hybrid-holdout-corpus.json");
if (!flag("--project-root")) throw new Error("--project-root is required.");

const databasePath = path.join(projectRoot, ".claw", "memory.sqlite");
if (!fs.existsSync(databasePath)) throw new Error(`Frozen index not found: ${databasePath}`);

const original = JSON.parse(fs.readFileSync(originalCorpusPath, "utf8"));
const originalQuality = original.queries.filter((entry) => entry.category !== "lexical_control");
const originalControls = original.queries.filter((entry) => entry.category === "lexical_control");
const excludedPaths = new Set(original.queries.flatMap((entry) => entry.relevant));
const categories = ["architecture", "runtime", "testing", "design", "content"];
const modes = ["entity_title", "section_semantic", "workflow_boundary", "document_type", "noisy_natural"];
const categoryLabels = {
  architecture: "架构",
  runtime: "运行时",
  testing: "测试",
  design: "设计",
  content: "内容",
};
const genericSections = /^(?:status|结论|背景|概述|设计概述|测试概述|已完成功能|当前实现|目标|范围|问题|方案|原则)$/iu;

const db = new DatabaseSync(databasePath, { readOnly: true });
const rows = db.prepare("SELECT source_path, kind, content FROM docs ORDER BY source_path ASC").all();
db.close();

function normalizePath(sourcePath) {
  return path.relative(projectRoot, sourcePath).replaceAll("\\", "/");
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanHeading(value) {
  return value
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^ADR\s*[:：-]?\s*/iu, "")
    .replace(/`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractHeadings(content) {
  return content
    .split(/\r?\n/u)
    .filter((line) => /^#{1,3}\s+\S/u.test(line.trim()))
    .map(cleanHeading)
    .filter((entry) => entry.length >= 4);
}

function classify(relativePath, title) {
  const value = `${relativePath} ${title}`.toLowerCase();
  if (/(?:mcp|e2e|test|测试|验证|probe|witness)/iu.test(value)) return "testing";
  if (/(?:15-content|12-world|角色|剧情|章节|世界设定|物品名单|content-design)/iu.test(value)) return "content";
  if (/(?:runtime|manager|运行时|ui|hud|交互|战斗|存档|dialogue)/iu.test(value)) return "runtime";
  if (/(?:\.claw\/truth\/adr|architecture|架构|技术方案|协议|管线|边界)/iu.test(value)) return "architecture";
  return "design";
}

function selectRelevantSection(doc) {
  return doc.sections.find((entry) => entry !== doc.title && !genericSections.test(entry) && entry.length <= 80)
    ?? doc.title;
}

function inferTemporalIntent(query) {
  return /(?:为什么|原因|历史|过去|之前|曾经|当时|回退|回滚|演化|旧方案|\bwhy\b|\bhistory\b|\bprevious\b|\brollback\b)/iu.test(query)
    ? "historical"
    : "current";
}

function inferDocType(relativePath) {
  if (relativePath.startsWith(".claw/truth/adr/") || relativePath.includes("/.claw/truth/adr/")) return "adr";
  if (relativePath.startsWith(".claw/truth/") || relativePath.includes("/.claw/truth/")) return "truth";
  return "other";
}

function annotateTemporalQuery(entry) {
  const expectedIntent = entry.expectedIntent ?? inferTemporalIntent(entry.query);
  return {
    ...entry,
    expectedIntent,
    allowedStates: entry.allowedStates ?? (expectedIntent === "historical"
      ? ["accepted", "historical", "superseded"]
      : ["current", "accepted"]),
    relevantSections: entry.relevantSections ?? entry.relevant.map((sourcePath) => ({
      sourcePath,
      headingPath: null,
      state: null,
      date: null,
      docType: inferDocType(sourcePath),
    })),
    forbiddenHardDistractorChunks: entry.forbiddenHardDistractorChunks ?? [],
  };
}

function buildQuery(doc, mode) {
  const subject = doc.title.replace(/(?:完成报告|实施计划|设计方案|系统设计|开发指南)$/u, "").trim();
  const section = selectRelevantSection(doc);
  if (mode === "entity_title") {
    return `项目里的“${subject}”具体解决什么问题，当前实现和关键约束是什么`;
  }
  if (mode === "section_semantic") {
    return `在${subject}这个主题里，${section}对应的现行机制怎样运作，最容易忽略的边界是什么`;
  }
  if (mode === "workflow_boundary") {
    if (doc.category === "testing") return `验证${subject}时应走哪条测试链路，失败证据和停止条件如何处理`;
    if (doc.category === "content") return `${subject}中的冲突、可玩环节、角色选择和结果如何形成闭环`;
    return `${subject}从入口到运行时结果经过哪些组件，职责分工和异常边界在哪里`;
  }
  if (mode === "document_type") {
    if (doc.relativePath.includes("/.claw/truth/adr/") || doc.relativePath.startsWith(".claw/truth/adr/")) {
      return `项目为什么做出${subject}这项决策，它替代了什么方案，哪些约束不能被后来改回去`;
    }
    if (doc.relativePath.includes("/.claw/truth/features/") || doc.relativePath.startsWith(".claw/truth/features/")) {
      return `${subject}的当前项目真相是什么，代码主链、验证证据和已知限制分别在哪里`;
    }
    return `要查${subject}的正式说明，应以哪份文档为准，里面定义了哪些职责和使用规则`;
  }
  return `我不是只想看泛泛的${categoryLabels[doc.category]}介绍；请定位${subject}在当前项目中的真实做法、上下游关系和验证口径`;
}

const candidates = rows
  .map((row) => {
    const relativePath = normalizePath(row.source_path);
    const headings = extractHeadings(row.content);
    const title = headings[0] ?? cleanHeading(path.parse(relativePath).name);
    return {
      relativePath,
      kind: row.kind,
      contentLength: Array.from(row.content).length,
      title,
      sections: headings.slice(1, 6),
      category: classify(relativePath, title),
    };
  })
  .filter((doc) => doc.relativePath && !doc.relativePath.startsWith(".."))
  .filter((doc) => doc.contentLength >= 300 && doc.title.length >= 4 && doc.title.length <= 100 && !doc.title.includes("\\n"))
  .filter((doc) => !excludedPaths.has(doc.relativePath))
  .filter((doc) => /\.md$/iu.test(doc.relativePath))
  .sort((left, right) => stableHash(left.relativePath).localeCompare(stableHash(right.relativePath)));

const byCategory = Object.fromEntries(categories.map((category) => [category, candidates.filter((doc) => doc.category === category)]));
const usedPaths = new Set();

function take(category, count, split) {
  const available = byCategory[category].filter((doc) => !usedPaths.has(doc.relativePath));
  if (available.length < count) throw new Error(`Not enough ${category} documents for ${split}: ${available.length} < ${count}`);
  return available.slice(0, count).map((doc, index) => {
    usedPaths.add(doc.relativePath);
    const mode = modes[index % modes.length];
    const query = buildQuery(doc, mode);
    const expectedIntent = inferTemporalIntent(query);
    return {
      id: `${split}-${category}-${stableHash(doc.relativePath).slice(0, 10)}`,
      language: "zh",
      category,
      signal: mode,
      critical: index % 4 === 0,
      query,
      relevant: [doc.relativePath],
      expectedIntent,
      allowedStates: expectedIntent === "historical"
        ? ["accepted", "historical", "superseded"]
        : ["current", "accepted"],
      relevantSections: [{
        sourcePath: doc.relativePath,
        headingPath: mode === "section_semantic" ? selectRelevantSection(doc) : null,
        state: null,
        date: null,
        docType: inferDocType(doc.relativePath),
      }],
      forbiddenHardDistractorChunks: [],
    };
  });
}

const developmentGenerated = [];
for (const category of categories) {
  const existingCount = originalQuality.filter((entry) => entry.category === category).length;
  developmentGenerated.push(...take(category, 24 - existingCount, "development"));
}
const development = [...originalQuality, ...developmentGenerated, ...originalControls].map(annotateTemporalQuery);

const holdout = [];
for (const category of categories) {
  holdout.push(...take(category, 24, "holdout"));
}
const annotatedHoldout = holdout.map(annotateTemporalQuery);

function summarize(queries) {
  return {
    total: queries.length,
    quality: queries.filter((entry) => entry.category !== "lexical_control").length,
    lexicalControl: queries.filter((entry) => entry.category === "lexical_control").length,
    byCategory: Object.fromEntries(categories.map((category) => [category, queries.filter((entry) => entry.category === category).length])),
    bySignal: Object.fromEntries(modes.map((mode) => [mode, queries.filter((entry) => entry.signal === mode).length])),
    critical: queries.filter((entry) => entry.critical).length,
  };
}

const developmentDocument = {
  schemaVersion: 3,
  split: "development",
  generatedFromFrozenIndex: databasePath,
  tuningAllowed: true,
  summary: summarize(development),
  queries: development,
};
const holdoutDocument = {
  schemaVersion: 3,
  split: "sealed_holdout",
  generatedFromFrozenIndex: databasePath,
  tuningAllowed: false,
  summary: summarize(annotatedHoldout),
  queries: annotatedHoldout,
};

fs.mkdirSync(path.dirname(developmentOutput), { recursive: true });
fs.writeFileSync(developmentOutput, `${JSON.stringify(developmentDocument, null, 2)}\n`, "utf8");
fs.writeFileSync(holdoutOutput, `${JSON.stringify(holdoutDocument, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  developmentOutput,
  holdoutOutput,
  development: developmentDocument.summary,
  holdout: holdoutDocument.summary,
  overlap: development.filter((entry) => annotatedHoldout.some((candidate) => candidate.relevant.some((target) => entry.relevant.includes(target)))).length,
})}\n`);
