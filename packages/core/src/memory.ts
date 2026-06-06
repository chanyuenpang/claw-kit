import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProjectContext, resolveTaskContext } from "./context.js";
import { ClawError } from "./errors.js";
import { readJsonFile, readTextFile } from "./io.js";
import type {
  MemoryGetInput,
  MemoryGetResult,
  MemoryIndexInput,
  MemoryIndexResult,
  MemoryScope,
  MemorySearchInput,
  MemorySearchResult,
  MemorySearchResultEntry,
  MemorySourceEntry,
  PlanDocument,
  ProjectContext,
  TaskContext,
} from "./types.js";

export function buildMemoryIndex(input: MemoryIndexInput): MemoryIndexResult {
  const { scope, project, task } = resolveMemoryScope(input);
  const storePath = getMemoryStorePath(project, scope, task);
  const sources = collectMemorySources(project, scope, task);

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const db = new DatabaseSync(storePath);
  try {
    prepareSchema(db);
    db.exec("DELETE FROM docs;");
    db.exec("DELETE FROM docs_fts;");
    const insertDoc = db.prepare(
      "INSERT INTO docs (source_path, kind, content) VALUES (?, ?, ?)",
    );
    const insertFts = db.prepare(
      "INSERT INTO docs_fts (rowid, source_path, kind, content) VALUES (?, ?, ?, ?)",
    );

    for (const source of sources) {
      const result = insertDoc.run(source.sourcePath, source.kind, source.content);
      insertFts.run(result.lastInsertRowid, source.sourcePath, source.kind, source.content);
    }
  } finally {
    db.close();
  }

  return {
    scope,
    storePath,
    indexedCount: sources.length,
    sources: sources.map((entry) => entry.sourcePath),
  };
}

export function searchMemory(input: MemorySearchInput): MemorySearchResult {
  if (!input.query.trim()) {
    throw new ClawError("MEMORY_QUERY_REQUIRED", "memory search requires a non-empty query.");
  }
  const { scope, project, task } = resolveMemoryScope(input);
  const storePath = getMemoryStorePath(project, scope, task);
  if (!fs.existsSync(storePath)) {
    buildMemoryIndex({
      cwd: input.cwd,
      scope,
      ...(task ? { taskName: task.taskName } : {}),
    });
  }

  const db = new DatabaseSync(storePath);
  try {
    prepareSchema(db);
    const limit = input.limit ?? 10;
    const rows = db
      .prepare(
        [
          "SELECT source_path, kind, snippet(docs_fts, 2, '[', ']', ' ... ', 18) AS snippet, bm25(docs_fts) AS score",
          "FROM docs_fts",
          "WHERE docs_fts MATCH ?",
          "ORDER BY score ASC",
          "LIMIT ?",
        ].join(" "),
      )
      .all(input.query, limit) as Array<{ source_path: string; kind: string; snippet: string; score: number }>;

    const results: MemorySearchResultEntry[] = rows.map((row) => ({
      sourcePath: row.source_path,
      kind: row.kind,
      snippet: row.snippet,
      score: row.score,
    }));

    return {
      scope,
      storePath,
      results,
    };
  } finally {
    db.close();
  }
}

export function getMemory(input: MemoryGetInput): MemoryGetResult {
  const { scope, project, task } = resolveMemoryScope(input);
  const storePath = getMemoryStorePath(project, scope, task);
  const sources = collectMemorySources(project, scope, task);
  return {
    scope,
    storePath,
    sources,
  };
}

function resolveMemoryScope(input: MemoryIndexInput | MemorySearchInput): {
  scope: MemoryScope;
  project: ProjectContext;
  task?: TaskContext;
} {
  const project = resolveProjectContext(input.cwd);
  const scope = input.scope ?? "project";
  if (scope === "task") {
    if (!input.taskName) {
      throw new ClawError("TASK_NOT_FOUND", "Task scope memory commands require --task.", { scope });
    }
    return {
      scope,
      project,
      task: resolveTaskContext(project, input.taskName),
    };
  }
  return { scope, project };
}

function getMemoryStorePath(project: ProjectContext, scope: MemoryScope, task?: TaskContext): string {
  if (scope === "task" && task) {
    return path.join(task.taskDir, "memory.sqlite");
  }
  return path.join(project.clawDir, "memory.sqlite");
}

function collectMemorySources(project: ProjectContext, scope: MemoryScope, task?: TaskContext): MemorySourceEntry[] {
  if (scope === "task" && task) {
    return collectTaskMemorySources(task);
  }
  return collectProjectMemorySources(project);
}

function collectProjectMemorySources(project: ProjectContext): MemorySourceEntry[] {
  const sources: MemorySourceEntry[] = [];
  addTextSourceIfExists(sources, path.join(project.clawDir, "memory.md"), "project_memory");
  for (const truthPath of listFiles(project.truthDir, (entry) => entry.endsWith(".md"))) {
    addTextSourceIfExists(sources, truthPath, "truth_doc");
  }
  for (const knowledgePath of listFiles(path.join(project.clawDir, ".knowledge"), (entry) => /\.(md|txt|json)$/i.test(entry))) {
    addTextSourceIfExists(sources, knowledgePath, "knowledge");
  }
  for (const externalPath of project.projectConfig?.memory?.externalDocPaths ?? []) {
    addExternalDocSources(sources, project.projectRoot, externalPath);
  }
  return sources;
}

function collectTaskMemorySources(task: TaskContext): MemorySourceEntry[] {
  const sources: MemorySourceEntry[] = [];
  const plan = readJsonFile<PlanDocument>(task.activePlanPath);
  sources.push({
    sourcePath: task.activePlanPath,
    kind: "active_plan",
    content: renderStructuredPlanMemory(plan),
  });
  addTextSourceIfExists(sources, path.join(task.taskDir, "memory.md"), "task_memory");
  return sources;
}

function addTextSourceIfExists(sources: MemorySourceEntry[], sourcePath: string, kind: string): void {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    return;
  }
  sources.push({
    sourcePath,
    kind,
    content: readTextFile(sourcePath),
  });
}

function addExternalDocSources(
  sources: MemorySourceEntry[],
  projectRoot: string,
  externalPath: string,
): void {
  const resolved = path.isAbsolute(externalPath)
    ? externalPath
    : path.resolve(projectRoot, externalPath);
  if (!fs.existsSync(resolved)) {
    return;
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    addTextSourceIfExists(sources, resolved, "external_doc");
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  for (const filePath of listFiles(resolved, isExternalDocFile)) {
    addTextSourceIfExists(sources, filePath, "external_doc");
  }
}

function renderStructuredPlanMemory(plan: PlanDocument): string {
  const parts: string[] = [
    `# ${plan.title}`,
    `Status: ${plan.status}`,
    `Goal: ${plan.goal.text}`,
  ];
  if (plan.rules?.length) {
    parts.push("Rules:");
    parts.push(...plan.rules.map((rule) => `- ${rule}`));
  }
  if (plan.references?.length) {
    parts.push("References:");
    parts.push(...plan.references.map((reference) => `- ${reference.why}: ${reference.path}`));
  }
  if (plan.keyDecisions?.length) {
    parts.push("Key Decisions:");
    parts.push(...plan.keyDecisions.map((decision) => `- ${decision}`));
  }
  if (plan.retrospective) {
    parts.push("Retrospective:");
    parts.push(`- Summary: ${plan.retrospective.summary}`);
    for (const item of plan.retrospective.whatWorked ?? []) {
      parts.push(`- Worked: ${item}`);
    }
    for (const item of plan.retrospective.issues ?? []) {
      parts.push(`- Issue: ${item}`);
    }
  }
  if (plan.tasks.length) {
    parts.push("Tasks:");
    parts.push(...plan.tasks.map((task) => `- [${task.status}] ${task.id}: ${task.title}`));
  }
  return `${parts.join("\n")}\n`;
}

function prepareSchema(db: DatabaseSync): void {
  db.exec(
    [
      "CREATE TABLE IF NOT EXISTS docs (",
      "  id INTEGER PRIMARY KEY,",
      "  source_path TEXT NOT NULL,",
      "  kind TEXT NOT NULL,",
      "  content TEXT NOT NULL",
      ");",
      "CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(",
      "  source_path,",
      "  kind,",
      "  content",
      ");",
    ].join("\n"),
  );
}

function listFiles(rootDir: string, matcher: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries: string[] = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, child.name);
      if (child.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (matcher(fullPath)) {
        entries.push(fullPath);
      }
    }
  }
  return entries;
}

function isExternalDocFile(filePath: string): boolean {
  return /\.(md|mdx|txt|json)$/i.test(filePath);
}
