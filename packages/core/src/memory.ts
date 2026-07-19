import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { resolveProjectContext, resolveTaskContext } from "./context.js";
import { resolveDefaultLocalEmbeddingDimensions } from "./embedding-defaults.js";
import { requestPersistentEmbedding } from "./embedding-daemon-protocol.js";
import { ClawError } from "./errors.js";
import { readJsonFile, readTextFile } from "./io.js";
import { buildProjectKeywordSearchPlan, buildProjectQueryIntent } from "./memory-query.js";
import type {
  MemoryEmbeddingConfig,
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

const DEFAULT_PROJECT_REFRESH_FILE_LIMIT = 100;
const PROJECT_SEARCH_CANDIDATE_MULTIPLIER = 8;
const DEFAULT_EMBEDDING_TARGET_TOKENS = 1024;
const DEFAULT_EMBEDDING_MAX_TOKENS = 2048;
const DEFAULT_EMBEDDING_CHARS_PER_TOKEN = 3;
const DEFAULT_EMBEDDING_TARGET_CHARS =
  DEFAULT_EMBEDDING_TARGET_TOKENS * DEFAULT_EMBEDDING_CHARS_PER_TOKEN;
const DEFAULT_EMBEDDING_MAX_CHARS =
  DEFAULT_EMBEDDING_MAX_TOKENS * DEFAULT_EMBEDDING_CHARS_PER_TOKEN;
const DEFAULT_MEMORY_SQLITE_BUSY_TIMEOUT_MS = 5000;
const PROJECT_QUERY_EMBEDDING_CACHE_LIMIT = 128;
const PROJECT_QUERY_EMBEDDING_CACHE_VERSION = "v1";

type ProjectDocSearchSignals = {
  matchedTerms: string[];
  strongMatchedTerms: string[];
  weakMatchedTerms: string[];
  matchedTermCount: number;
  strongMatchedTermCount: number;
  fileNameHits: number;
  pathHits: number;
  phraseMatch: boolean;
  strongCoverageRatio: number;
  exactBoost: number;
};

export type ProjectEmbeddingWarmupResult = {
  warmed: boolean;
  reason: "warmed" | "disabled" | "non_local" | "index_unavailable" | "persistent_worker_disabled" | "failed";
  runtime?: "mock" | "persistent_daemon" | "one_shot" | "remote";
  error?: string;
};

export function buildMemoryIndex(input: MemoryIndexInput): MemoryIndexResult {
  const { scope, project, task } = resolveMemoryScope(input);
  if (!isProjectMemoryEnabled(project)) {
    return {
      scope,
      storePath: getMemoryStorePath(project, scope, task),
      indexedCount: 0,
      processedFileCount: 0,
      pendingFileCount: 0,
      sources: [],
      ...(scope === "project" ? { embedding: null, vectorIndex: null } : {}),
    };
  }
  const storePath = getMemoryStorePath(project, scope, task);
  const sources = collectMemorySources(project, scope, task);
  const embedding = scope === "project" ? resolveProjectMemoryEmbeddingConfig(project) : undefined;

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  return withMemoryDatabase(storePath, "index refresh", "write", (db) => {
    prepareSchema(db);
    const syncResult =
      scope === "project"
        ? syncProjectMemoryIndex(
            db,
            sources,
            embedding ?? null,
            input.maxFiles ?? DEFAULT_PROJECT_REFRESH_FILE_LIMIT,
          )
        : {
            vectorIndex: rebuildTaskMemoryIndex(db, sources),
            processedFileCount: sources.length,
            pendingFileCount: 0,
          };
    upsertMetadata(db, "scope", scope);
    upsertMetadata(db, "indexed_at", new Date().toISOString());
    if (embedding) {
      upsertMetadata(db, "embedding_config", JSON.stringify(embedding));
    } else {
      deleteMetadata(db, "embedding_config");
    }
    if (syncResult.vectorIndex) {
      upsertMetadata(db, "vector_index", JSON.stringify(syncResult.vectorIndex));
    } else {
      deleteMetadata(db, "vector_index");
    }

    return {
      scope,
      storePath,
      indexedCount: sources.length,
      processedFileCount: syncResult.processedFileCount,
      pendingFileCount: syncResult.pendingFileCount,
      sources: sources.map((entry) => entry.sourcePath),
      ...(scope === "project" ? { embedding, vectorIndex: syncResult.vectorIndex } : {}),
    };
  });
}

function rebuildTaskMemoryIndex(
  db: DatabaseSync,
  sources: MemorySourceEntry[],
): MemoryIndexResult["vectorIndex"] {
  db.exec("DELETE FROM docs;");
  db.exec("DELETE FROM docs_fts;");
  db.exec("DELETE FROM doc_embeddings;");
  const insertDoc = db.prepare(
    "INSERT INTO docs (source_path, kind, content, content_hash) VALUES (?, ?, ?, ?)",
  );
  const insertFts = db.prepare(
    "INSERT INTO docs_fts (rowid, source_path, kind, content) VALUES (?, ?, ?, ?)",
  );

  for (const source of sources) {
    const result = insertDoc.run(
      source.sourcePath,
      source.kind,
      source.content,
      hashMemoryContent(source.content),
    );
    insertFts.run(Number(result.lastInsertRowid), source.sourcePath, source.kind, source.content);
  }
  return null;
}

function syncProjectMemoryIndex(
  db: DatabaseSync,
  sources: MemorySourceEntry[],
  embedding: MemoryEmbeddingConfig | null,
  maxFiles?: number,
): {
  vectorIndex: MemoryIndexResult["vectorIndex"];
  processedFileCount: number;
  pendingFileCount: number;
} {
  const currentEmbeddingConfig = embedding ? JSON.stringify(embedding) : null;
  const storedEmbeddingConfig = getMetadata(db, "embedding_config");
  const shouldIndexVectors = canBuildProjectVectors(embedding);
  const requiresVectorReset = storedEmbeddingConfig !== currentEmbeddingConfig || !shouldIndexVectors;
  const nextSources = sources.map((source) => ({
    ...source,
    contentHash: hashMemoryContent(source.content),
  }));
  const nextByPath = new Map(nextSources.map((source) => [source.sourcePath, source]));
  const existingDocs = db
    .prepare("SELECT id, source_path, kind, content_hash FROM docs")
    .all() as Array<{ id: number; source_path: string; kind: string; content_hash: string | null }>;
  const existingByPath = new Map(existingDocs.map((doc) => [doc.source_path, doc]));
  const docsToDelete = existingDocs.filter((doc) => {
    const next = nextByPath.get(doc.source_path);
    if (!next) {
      return true;
    }
    if (requiresVectorReset) {
      return true;
    }
    return doc.kind !== next.kind || doc.content_hash !== next.contentHash;
  });
  const docsToInsert = nextSources.filter((source) => {
    const existing = existingByPath.get(source.sourcePath);
    if (!existing) {
      return true;
    }
    if (requiresVectorReset) {
      return true;
    }
    return existing.kind !== source.kind || existing.content_hash !== source.contentHash;
  });
  const canLimitFiles = !maxFiles ? false : maxFiles > 0;
  const sortedDocsToInsert = [...docsToInsert].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const limitedDocsToInsert = canLimitFiles ? sortedDocsToInsert.slice(0, maxFiles) : sortedDocsToInsert;
  const pendingFileCount = sortedDocsToInsert.length - limitedDocsToInsert.length;

  db.exec("BEGIN");
  try {
    deleteDocsById(db, docsToDelete.map((doc) => doc.id));
    if (requiresVectorReset) {
      db.exec("DELETE FROM doc_embeddings;");
      db.exec("DELETE FROM query_embeddings;");
    }
    insertDocs(db, limitedDocsToInsert);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (shouldIndexVectors && embedding) {
    const generatedEmbeddings = generateDocEmbeddings(listDocsMissingEmbeddings(db), embedding);
    db.exec("BEGIN");
    try {
      insertDocEmbeddings(db, generatedEmbeddings);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  if (!shouldIndexVectors || !embedding) {
    return {
      vectorIndex: null,
      processedFileCount: limitedDocsToInsert.length,
      pendingFileCount,
    };
  }
  return {
    vectorIndex: summarizeVectorIndex(db, embedding),
    processedFileCount: limitedDocsToInsert.length,
    pendingFileCount,
  };
}

function insertDocs(
  db: DatabaseSync,
  sources: Array<MemorySourceEntry & { contentHash: string }>,
): Array<{ docId: number; sourcePath: string; kind: string; content: string }> {
  const insertDoc = db.prepare(
    "INSERT INTO docs (source_path, kind, content, content_hash) VALUES (?, ?, ?, ?)",
  );
  const insertFts = db.prepare(
    "INSERT INTO docs_fts (rowid, source_path, kind, content) VALUES (?, ?, ?, ?)",
  );
  const indexedDocs: Array<{ docId: number; sourcePath: string; kind: string; content: string }> = [];

  for (const source of sources) {
    const result = insertDoc.run(source.sourcePath, source.kind, source.content, source.contentHash);
    const docId = Number(result.lastInsertRowid);
    insertFts.run(docId, source.sourcePath, source.kind, source.content);
    indexedDocs.push({
      docId,
      sourcePath: source.sourcePath,
      kind: source.kind,
      content: source.content,
    });
  }

  return indexedDocs;
}

function deleteDocsById(db: DatabaseSync, docIds: number[]): void {
  if (docIds.length === 0) {
    return;
  }
  const deleteFts = db.prepare("DELETE FROM docs_fts WHERE rowid = ?");
  const deleteEmbeddings = db.prepare("DELETE FROM doc_embeddings WHERE doc_id = ?");
  const deleteDoc = db.prepare("DELETE FROM docs WHERE id = ?");
  for (const docId of docIds) {
    deleteFts.run(docId);
    deleteEmbeddings.run(docId);
    deleteDoc.run(docId);
  }
}

function upsertMetadata(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    [
      "INSERT INTO index_metadata (key, value) VALUES (?, ?)",
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ].join(" "),
  ).run(key, value);
}

function deleteMetadata(db: DatabaseSync, key: string): void {
  db.prepare("DELETE FROM index_metadata WHERE key = ?").run(key);
}

function getMetadata(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM index_metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function searchMemory(input: MemorySearchInput): MemorySearchResult {
  const startedAt = performance.now();
  if (!input.query.trim()) {
    throw new ClawError("MEMORY_QUERY_REQUIRED", "memory search requires a non-empty query.");
  }
  const { scope, project, task } = resolveMemoryScope(input);
  if (!isProjectMemoryEnabled(project)) {
    throw new ClawError("MEMORY_DISABLED", "Project memory is disabled by .claw/project.json `memory.enabled = false`.", {
      scope,
      projectRoot: project.projectRoot,
    });
  }
  const storePath = getMemoryStorePath(project, scope, task);
  if (!fs.existsSync(storePath)) {
    if (scope === "project") {
      throw new ClawError(
        "MEMORY_VECTOR_INDEX_REQUIRED",
        "Project search requires a refreshed vector index. Run `claw search index --refresh` first.",
      );
    }
    buildMemoryIndex({
      cwd: input.cwd,
      scope,
      ...(task ? { taskName: task.taskName } : {}),
    });
  }

  return withMemoryDatabase(storePath, "search", "read", (db) => {
    prepareSchema(db);
    const searchResult =
      scope === "project"
        ? searchProjectMemoryHybrid(db, input.query, input.limit ?? 10, project)
        : {
            results: searchTaskMemoryFts(db, input.query, input.limit ?? 10),
            telemetry: {
              route: "task_fts" as const,
              queryEmbedding: "skipped" as const,
            },
          };

    return {
      scope,
      storePath,
      results: searchResult.results,
      telemetry: {
        ...searchResult.telemetry,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      },
    };
  });
}

export function getMemory(input: MemoryGetInput): MemoryGetResult {
  const { scope, project, task } = resolveMemoryScope(input);
  const storePath = getMemoryStorePath(project, scope, task);
  const sources = isProjectMemoryEnabled(project) ? collectMemorySources(project, scope, task) : [];
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

function withMemoryDatabase<T>(
  storePath: string,
  operation: string,
  access: "read" | "write",
  callback: (db: DatabaseSync) => T,
): T {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(storePath);
    configureMemoryDatabase(db, access);
    return callback(db);
  } catch (error) {
    if (isSqliteBusyError(error)) {
      throw buildMemoryStoreBusyError(storePath, operation, error);
    }
    throw error;
  } finally {
    db?.close();
  }
}

function configureMemoryDatabase(db: DatabaseSync, access: "read" | "write"): void {
  db.exec(`PRAGMA busy_timeout = ${resolveMemorySqliteBusyTimeoutMs()};`);
  if (access === "write") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
}

function resolveMemorySqliteBusyTimeoutMs(): number {
  const raw = process.env.CLAW_MEMORY_SQLITE_BUSY_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_MEMORY_SQLITE_BUSY_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MEMORY_SQLITE_BUSY_TIMEOUT_MS;
}

function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "ERR_SQLITE_ERROR"
    ? /database is (?:locked|busy)|SQLITE_BUSY/i.test(error.message)
    : /database is (?:locked|busy)|SQLITE_BUSY/i.test(error.message);
}

function buildMemoryStoreBusyError(storePath: string, operation: string, cause: unknown): ClawError {
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  return new ClawError(
    "MEMORY_STORE_BUSY",
    `Memory index store is busy during ${operation}. Another claw search or index refresh is using ${storePath}; retry after that operation finishes.`,
    {
      storePath,
      operation,
      cause: causeMessage,
    },
  );
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
  for (const truthPath of listFiles(
    project.truthDir,
    (entry) => entry.toLowerCase().endsWith(".md") && path.basename(entry).toLowerCase() !== "summary.md",
  )) {
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
      "  content TEXT NOT NULL,",
      "  content_hash TEXT",
      ");",
      "CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(",
      "  source_path,",
      "  kind,",
      "  content",
      ");",
      "CREATE TABLE IF NOT EXISTS index_metadata (",
      "  key TEXT PRIMARY KEY,",
      "  value TEXT NOT NULL",
      ");",
      "CREATE TABLE IF NOT EXISTS doc_embeddings (",
      "  doc_id INTEGER NOT NULL,",
      "  chunk_index INTEGER NOT NULL,",
      "  source_path TEXT NOT NULL,",
      "  kind TEXT NOT NULL,",
      "  chunk_text TEXT NOT NULL,",
      "  embedding_json TEXT NOT NULL,",
      "  PRIMARY KEY (doc_id, chunk_index)",
      ");",
      "CREATE TABLE IF NOT EXISTS query_embeddings (",
      "  cache_key TEXT PRIMARY KEY,",
      "  embedding_fingerprint TEXT NOT NULL,",
      "  query_text TEXT NOT NULL,",
      "  dimensions INTEGER NOT NULL,",
      "  embedding_json TEXT NOT NULL,",
      "  created_at INTEGER NOT NULL",
      ");",
    ].join("\n"),
  );
  const docsColumns = db.prepare("PRAGMA table_info(docs)").all() as Array<{ name: string }>;
  if (!docsColumns.some((column) => column.name === "content_hash")) {
    db.exec("ALTER TABLE docs ADD COLUMN content_hash TEXT;");
  }
}

function resolveProjectMemoryEmbeddingConfig(project: ProjectContext): MemoryEmbeddingConfig | null {
  if (!isProjectMemoryEnabled(project)) {
    return null;
  }
  const configured = project.projectConfig?.memory?.embedding;
  if (!configured) {
    return null;
  }
  return {
    provider: configured.provider,
    model: configured.model,
    ...(configured.remote ? { remote: configured.remote } : {}),
    ...(configured.local ? { local: configured.local } : {}),
    ...(configured.outputDimensionality ? { outputDimensionality: configured.outputDimensionality } : {}),
  };
}

function isProjectMemoryEnabled(project: ProjectContext): boolean {
  return project.projectConfig?.memory?.enabled !== false;
}

export async function warmProjectMemoryEmbedding(input: { cwd: string }): Promise<ProjectEmbeddingWarmupResult> {
  const project = resolveProjectContext(input.cwd);
  const embedding = resolveProjectMemoryEmbeddingConfig(project);
  if (!embedding) {
    return { warmed: false, reason: "disabled" };
  }
  if (embedding.provider !== "local") {
    return { warmed: false, reason: "non_local" };
  }
  if (process.env.CLAW_EMBEDDING_PERSISTENT_WORKER === "0") {
    return { warmed: false, reason: "persistent_worker_disabled" };
  }
  const storePath = path.join(project.clawDir, "memory.sqlite");
  if (!hasProjectVectorIndex(storePath)) {
    return { warmed: false, reason: "index_unavailable" };
  }
  try {
    const output = await requestPersistentEmbedding({
      embedding,
      texts: ["claw context embedding warmup"],
      projectCwd: project.projectRoot,
    });
    if (!output) {
      return { warmed: false, reason: "failed" };
    }
    return {
      warmed: true,
      reason: "warmed",
      runtime: "persistent_daemon",
    };
  } catch (error) {
    return {
      warmed: false,
      reason: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hasProjectVectorIndex(storePath: string): boolean {
  if (!fs.existsSync(storePath)) {
    return false;
  }
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(storePath, { readOnly: true });
    return Boolean(
      db.prepare("SELECT value FROM index_metadata WHERE key = ?")
        .get("vector_index"),
    );
  } catch {
    return false;
  } finally {
    db?.close();
  }
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
  return /\.md$/i.test(filePath);
}

function generateDocEmbeddings(
  docs: Array<{ docId: number; sourcePath: string; kind: string; content: string }>,
  embedding: MemoryEmbeddingConfig | null,
): Array<{
  docId: number;
  chunkIndex: number;
  sourcePath: string;
  kind: string;
  chunkText: string;
  vector: number[];
}> {
  if (!embedding) {
    return [];
  }
  if (!canBuildProjectVectors(embedding)) {
    return [];
  }

  const chunks = docs.flatMap((doc) =>
    chunkMarkdownContent(doc.content).map((chunkText, chunkIndex) => ({
      docId: doc.docId,
      chunkIndex,
      sourcePath: doc.sourcePath,
      kind: doc.kind,
      chunkText,
    })),
  );
  if (chunks.length === 0) {
    return [];
  }

  const output = runEmbeddingWorker({
    embedding,
    texts: chunks.map((chunk) => chunk.chunkText),
  });
  return chunks.map((chunk, index) => ({
    ...chunk,
    vector: output.vectors[index] ?? [],
  }));
}

function insertDocEmbeddings(
  db: DatabaseSync,
  embeddings: ReturnType<typeof generateDocEmbeddings>,
): void {
  const insertEmbedding = db.prepare(
    [
      "INSERT OR REPLACE INTO doc_embeddings (doc_id, chunk_index, source_path, kind, chunk_text, embedding_json)",
      "VALUES (?, ?, ?, ?, ?, ?)",
    ].join(" "),
  );
  embeddings.forEach((embedding) => {
    insertEmbedding.run(
      embedding.docId,
      embedding.chunkIndex,
      embedding.sourcePath,
      embedding.kind,
      embedding.chunkText,
      JSON.stringify(embedding.vector),
    );
  });
}

function listDocsMissingEmbeddings(
  db: DatabaseSync,
): Array<{ docId: number; sourcePath: string; kind: string; content: string }> {
  return db
    .prepare(
      [
        "SELECT d.id AS doc_id, d.source_path, d.kind, d.content",
        "FROM docs d",
        "LEFT JOIN doc_embeddings e ON e.doc_id = d.id",
        "GROUP BY d.id, d.source_path, d.kind, d.content",
        "HAVING COUNT(e.doc_id) = 0",
      ].join(" "),
    )
    .all()
    .map((row) => {
      const typed = row as { doc_id: number; source_path: string; kind: string; content: string };
      return {
        docId: typed.doc_id,
        sourcePath: typed.source_path,
        kind: typed.kind,
        content: typed.content,
      };
    });
}

function summarizeVectorIndex(
  db: DatabaseSync,
  embedding: MemoryEmbeddingConfig,
): MemoryIndexResult["vectorIndex"] {
  const vectorCount = db
    .prepare("SELECT COUNT(*) AS count FROM doc_embeddings")
    .get() as { count: number };
  const firstVector = db
    .prepare("SELECT embedding_json FROM doc_embeddings ORDER BY doc_id ASC, chunk_index ASC LIMIT 1")
    .get() as { embedding_json: string } | undefined;
  const dimensions = firstVector
    ? parseEmbeddingJson(firstVector.embedding_json).length
    : resolveEmbeddingDimensions(embedding, 0);
  return {
    enabled: true,
    provider: embedding.provider,
    model: embedding.model,
    dimensions,
    chunkCount: vectorCount.count,
  };
}

function canBuildProjectVectors(embedding: MemoryEmbeddingConfig | null): boolean {
  if (!embedding) {
    return false;
  }
  if (embedding.provider === "openai" && !resolveEmbeddingApiKey(embedding)) {
    return false;
  }
  return true;
}

function hashMemoryContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function chunkMarkdownContent(content: string): string[] {
  const paragraphChunks = content
    .split(/\r?\n\s*\r?\n/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .flatMap((chunk) => splitOversizedMarkdownChunk(chunk));

  const mergedChunks: string[] = [];
  let current = "";
  for (const chunk of paragraphChunks) {
    if (!current) {
      current = chunk;
      continue;
    }
    if ((`${current}\n\n${chunk}`).length <= DEFAULT_EMBEDDING_TARGET_CHARS) {
      current = `${current}\n\n${chunk}`;
      continue;
    }
    mergedChunks.push(current);
    current = chunk;
  }
  if (current) {
    mergedChunks.push(current);
  }
  return mergedChunks;
}

function splitOversizedMarkdownChunk(chunk: string): string[] {
  if (chunk.length <= DEFAULT_EMBEDDING_MAX_CHARS) {
    return [chunk];
  }

  const pieces: string[] = [];
  let start = 0;
  while (start < chunk.length) {
    const remaining = chunk.length - start;
    if (remaining <= DEFAULT_EMBEDDING_MAX_CHARS) {
      pieces.push(chunk.slice(start).trim());
      break;
    }

    const preferredSplit = findPreferredChunkBoundary(
      chunk,
      start,
      Math.min(start + DEFAULT_EMBEDDING_TARGET_CHARS, chunk.length),
      Math.min(start + DEFAULT_EMBEDDING_MAX_CHARS, chunk.length),
    );
    pieces.push(chunk.slice(start, preferredSplit).trim());
    start = preferredSplit;
    while (start < chunk.length && /\s/.test(chunk[start] ?? "")) {
      start += 1;
    }
  }

  return pieces.filter((piece) => piece.length > 0);
}

function findPreferredChunkBoundary(
  text: string,
  start: number,
  preferredEnd: number,
  hardEnd: number,
): number {
  const lowerBound = Math.max(start + Math.floor(DEFAULT_EMBEDDING_TARGET_CHARS / 2), start + 1);
  for (let index = preferredEnd; index >= lowerBound; index -= 1) {
    const current = text[index];
    const previous = text[index - 1];
    if (current === "\n" || current === " " || current === "\t") {
      return index;
    }
    if (previous && /[.?!,;:。！？；：，、]/.test(previous)) {
      return index;
    }
  }
  return hardEnd;
}

function runEmbeddingWorker(input: {
  embedding: MemoryEmbeddingConfig;
  texts: string[];
}): {
  dimensions: number;
  vectors: number[][];
  runtime?: "mock" | "persistent_daemon" | "one_shot" | "remote";
} {
  const workerPath = fileURLToPath(new URL("./embedding-worker.js", import.meta.url));
  const outputPath = path.join(
    os.tmpdir(),
    `claw-embedding-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const result = spawnSync(
    process.execPath,
    [workerPath],
    {
      input: JSON.stringify({
        ...input,
        outputPath,
      }),
      encoding: "utf-8",
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: resolveEmbeddingWorkerTimeoutMs(),
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    cleanupTemporaryEmbeddingOutput(outputPath);
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "Memory embedding generation failed.",
      {
        stdout: result.stdout,
        stderr: result.stderr,
        ...(result.error ? { workerError: result.error.message } : {}),
        ...(result.signal ? { signal: result.signal } : {}),
        ...(result.error && "code" in result.error ? { errorCode: result.error.code } : {}),
        ...(result.error && "code" in result.error && result.error.code === "ETIMEDOUT"
          ? { timedOut: true, timeoutMs: resolveEmbeddingWorkerTimeoutMs() }
          : {}),
      },
    );
  }
  try {
    const payload = JSON.parse(stripBom(fs.readFileSync(outputPath, "utf-8"))) as {
      dimensions: number;
      vectors: number[][];
      runtime?: "mock" | "persistent_daemon" | "one_shot" | "remote";
    };
    return payload;
  } finally {
    cleanupTemporaryEmbeddingOutput(outputPath);
  }
}

function resolveEmbeddingWorkerTimeoutMs(): number {
  const raw = process.env.CLAW_EMBEDDING_WORKER_TIMEOUT_MS?.trim();
  if (!raw) {
    return 30 * 60 * 1000;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function cleanupTemporaryEmbeddingOutput(outputPath: string): void {
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
}

function resolveEmbeddingApiKey(embedding: MemoryEmbeddingConfig): string | null {
  const envVar = embedding.remote?.apiKeyEnvVar?.trim();
  if (!envVar) {
    return null;
  }
  const value = process.env[envVar];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveEmbeddingDimensions(embedding: MemoryEmbeddingConfig, fallback: number): number {
  if (typeof embedding.outputDimensionality === "number" && embedding.outputDimensionality > 0) {
    return embedding.outputDimensionality;
  }
  if (embedding.provider === "local") {
    return resolveDefaultLocalEmbeddingDimensions(embedding.model);
  }
  return fallback > 0 ? fallback : 1536;
}

function searchTaskMemoryFts(
  db: DatabaseSync,
  query: string,
  limit: number,
): MemorySearchResultEntry[] {
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
    .all(query, limit) as Array<{ source_path: string; kind: string; snippet: string; score: number }>;

  return rows.map((row) => ({
    sourcePath: row.source_path,
    kind: row.kind,
    snippet: row.snippet,
    score: row.score,
  }));
}

function searchProjectMemoryHybrid(
  db: DatabaseSync,
  query: string,
  limit: number,
  project: ProjectContext,
): {
  results: MemorySearchResultEntry[];
  telemetry: {
    route: "lexical_fast_path" | "hybrid";
    queryEmbedding: "skipped" | "cache_hit" | "generated";
    embeddingRuntime?: "mock" | "persistent_daemon" | "one_shot" | "remote";
  };
} {
  const embedding = resolveProjectMemoryEmbeddingConfig(project);
  if (!embedding) {
    throw new ClawError(
      "MEMORY_VECTOR_INDEX_REQUIRED",
      "Project search requires memory.embedding. Configure .claw/project.json and run `claw search index --refresh` first.",
    );
  }

  const vectorIndexMetadata = db
    .prepare("SELECT value FROM index_metadata WHERE key = ?")
    .get("vector_index") as { value: string } | undefined;
  if (!vectorIndexMetadata) {
    throw new ClawError(
      "MEMORY_VECTOR_INDEX_REQUIRED",
      "Project search requires a refreshed vector index. Run `claw search index --refresh` first.",
    );
  }

  const queryIntent = buildProjectQueryIntent(query);
  const candidateLimit = Math.max(limit * PROJECT_SEARCH_CANDIDATE_MULTIPLIER, 40);
  const projectDocs = db
    .prepare("SELECT source_path, kind, content FROM docs")
    .all() as Array<{ source_path: string; kind: string; content: string }>;
  const docSignals = new Map(
    projectDocs.map((row) => [
      row.source_path,
      buildProjectSearchSignals({
        sourcePath: row.source_path,
        content: row.content,
        query,
        queryIntent,
      }),
      ]),
  );
  const ftsRows = searchProjectMemoryKeywords(db, query, candidateLimit);
  const signalRows = searchProjectMemorySignals(projectDocs, docSignals, candidateLimit);
  const lexicalFastPath = tryProjectLexicalFastPath({
    query,
    queryIntent,
    docSignals,
    ftsRows,
    signalRows,
    limit,
  });
  if (lexicalFastPath) {
    return {
      results: lexicalFastPath,
      telemetry: {
        route: "lexical_fast_path",
        queryEmbedding: "skipped",
      },
    };
  }

  const queryEmbedding = resolveProjectQueryEmbedding(
    db,
    embedding,
    queryIntent.embeddingText || query,
  );

  const vectorRows = db
    .prepare(
      [
        "SELECT source_path, kind, chunk_text, embedding_json",
        "FROM doc_embeddings",
      ].join(" "),
    )
    .all() as Array<{ source_path: string; kind: string; chunk_text: string; embedding_json: string }>;
  if (vectorRows.length === 0) {
    throw new ClawError(
      "MEMORY_VECTOR_INDEX_REQUIRED",
      "Project search requires stored vectors. Run `claw search index --refresh` first.",
    );
  }

  const rankedVectors = vectorRows
    .map((row) => {
      const signals = docSignals.get(row.source_path);
      return {
        sourcePath: row.source_path,
        kind: row.kind,
        snippet: buildSnippet(row.chunk_text),
        similarity: cosineSimilarity(queryEmbedding.vector, parseEmbeddingJson(row.embedding_json)),
        exactBoost: signals?.exactBoost ?? 0,
      };
    })
    .filter((row) => Number.isFinite(row.similarity))
    .sort((left, right) => {
      const leftScore = left.similarity + left.exactBoost;
      const rightScore = right.similarity + right.exactBoost;
      return rightScore - leftScore;
    });

  const bestVectorBySource = new Map<string, { kind: string; snippet: string; similarity: number }>();
  for (const row of rankedVectors) {
    const existing = bestVectorBySource.get(row.sourcePath);
    if (!existing || row.similarity > existing.similarity) {
      bestVectorBySource.set(row.sourcePath, {
        kind: row.kind,
        snippet: row.snippet,
        similarity: row.similarity,
      });
    }
  }

  const fused = new Map<
    string,
    MemorySearchResultEntry & {
      vectorRank?: number;
      textRank?: number;
      signalRank?: number;
    }
  >();
  Array.from(bestVectorBySource.entries())
    .sort((left, right) => {
      const leftScore = left[1].similarity + (docSignals.get(left[0])?.exactBoost ?? 0);
      const rightScore = right[1].similarity + (docSignals.get(right[0])?.exactBoost ?? 0);
      return rightScore - leftScore;
    })
    .slice(0, candidateLimit)
    .forEach(([sourcePath, row], index) => {
      const signals = docSignals.get(sourcePath);
      fused.set(sourcePath, {
        sourcePath,
        kind: row.kind,
        snippet: row.snippet,
        score: reciprocalRankScore(index + 1, 0.6) + (signals?.exactBoost ?? 0),
        vectorRank: index + 1,
      });
    });

  ftsRows.forEach((row, index) => {
    const existing = fused.get(row.source_path);
    const signals = docSignals.get(row.source_path);
    const nextScore = (existing?.score ?? 0) + reciprocalRankScore(index + 1, 0.25);
    fused.set(row.source_path, {
      sourcePath: row.source_path,
      kind: existing?.kind ?? row.kind,
      snippet: row.snippet || existing?.snippet || "",
      score: nextScore + (existing ? 0 : (signals?.exactBoost ?? 0)),
      vectorRank: existing?.vectorRank,
      textRank: index + 1,
    });
  });

  signalRows.forEach((row, index) => {
    const existing = fused.get(row.source_path);
    const signals = docSignals.get(row.source_path);
    const nextScore = (existing?.score ?? 0) + reciprocalRankScore(index + 1, 0.15);
    fused.set(row.source_path, {
      sourcePath: row.source_path,
      kind: existing?.kind ?? row.kind,
      snippet: existing?.snippet || row.snippet || "",
      score: nextScore + (existing ? 0 : (signals?.exactBoost ?? 0)),
      vectorRank: existing?.vectorRank,
      textRank: existing?.textRank,
      signalRank: index + 1,
    });
  });

  return {
    results: rerankProjectSearchCandidates(Array.from(fused.values()), docSignals, limit),
    telemetry: {
      route: "hybrid",
      queryEmbedding: queryEmbedding.cacheHit ? "cache_hit" : "generated",
      ...(queryEmbedding.runtime ? { embeddingRuntime: queryEmbedding.runtime } : {}),
    },
  };
}

function tryProjectLexicalFastPath(input: {
  query: string;
  queryIntent: ReturnType<typeof buildProjectQueryIntent>;
  docSignals: Map<string, ProjectDocSearchSignals>;
  ftsRows: Array<{ source_path: string; kind: string; snippet: string; score: number }>;
  signalRows: Array<{ source_path: string; kind: string; snippet: string; score: number }>;
  limit: number;
}): MemorySearchResultEntry[] | null {
  const { queryIntent } = input;
  const primaryKeywordStep = buildProjectKeywordSearchPlan(input.query)[0];
  if (
    queryIntent.strongTerms.length === 0
    || queryIntent.weakTerms.length > 0
    || !primaryKeywordStep
    || primaryKeywordStep.substringTerms.length > 0
  ) {
    return null;
  }

  const fullCoverage = Array.from(input.docSignals.entries()).filter(([, signals]) =>
    signals.strongCoverageRatio === 1,
  );
  const pathMatches = fullCoverage.filter(([, signals]) =>
    signals.fileNameHits >= queryIntent.strongTerms.length
    || signals.pathHits >= queryIntent.strongTerms.length,
  );
  const phraseMatches = fullCoverage.filter(([, signals]) => signals.phraseMatch);
  const confidentSourcePath = pathMatches.length === 1
    ? pathMatches[0]?.[0]
    : phraseMatches.length === 1
      ? phraseMatches[0]?.[0]
      : null;
  if (!confidentSourcePath) {
    return null;
  }

  const candidates = new Map<
    string,
    MemorySearchResultEntry & { textRank?: number; signalRank?: number }
  >();
  input.ftsRows.forEach((row, index) => {
    candidates.set(row.source_path, {
      sourcePath: row.source_path,
      kind: row.kind,
      snippet: row.snippet,
      score: reciprocalRankScore(index + 1, 0.85) + (input.docSignals.get(row.source_path)?.exactBoost ?? 0),
      textRank: index + 1,
    });
  });
  input.signalRows.forEach((row, index) => {
    const existing = candidates.get(row.source_path);
    candidates.set(row.source_path, {
      sourcePath: row.source_path,
      kind: existing?.kind ?? row.kind,
      snippet: existing?.snippet || row.snippet,
      score: (existing?.score ?? 0)
        + reciprocalRankScore(index + 1, 0.15)
        + (existing ? 0 : (input.docSignals.get(row.source_path)?.exactBoost ?? 0)),
      textRank: existing?.textRank,
      signalRank: index + 1,
    });
  });

  const confidentCandidate = candidates.get(confidentSourcePath);
  if (!confidentCandidate) {
    return null;
  }
  confidentCandidate.score += 0.1;
  return rerankProjectSearchCandidates(Array.from(candidates.values()), input.docSignals, input.limit);
}

function resolveProjectQueryEmbedding(
  db: DatabaseSync,
  embedding: MemoryEmbeddingConfig,
  queryText: string,
): {
  vector: number[];
  cacheHit: boolean;
  runtime?: "mock" | "persistent_daemon" | "one_shot" | "remote";
} {
  const normalizedQueryText = queryText.trim().replace(/\s+/g, " ");
  const embeddingFingerprint = createHash("sha256")
    .update(JSON.stringify(embedding))
    .digest("hex");
  const cacheKey = createHash("sha256")
    .update(`${PROJECT_QUERY_EMBEDDING_CACHE_VERSION}\0${embeddingFingerprint}\0${normalizedQueryText}`)
    .digest("hex");
  const cached = db
    .prepare(
      [
        "SELECT dimensions, embedding_json",
        "FROM query_embeddings",
        "WHERE cache_key = ? AND embedding_fingerprint = ? AND query_text = ?",
      ].join(" "),
    )
    .get(cacheKey, embeddingFingerprint, normalizedQueryText) as
      | { dimensions: number; embedding_json: string }
      | undefined;
  if (cached) {
    const vector = parseEmbeddingJson(cached.embedding_json);
    if (cached.dimensions > 0 && vector.length === cached.dimensions) {
      return { vector, cacheHit: true };
    }
    db.prepare("DELETE FROM query_embeddings WHERE cache_key = ?").run(cacheKey);
  }

  const generated = runEmbeddingWorker({
    embedding,
    texts: [normalizedQueryText],
  });
  const vector = generated.vectors[0];
  if (!vector?.length) {
    throw new ClawError("MEMORY_VECTOR_INDEX_REQUIRED", "Unable to generate a query embedding for project search.");
  }
  db.prepare(
    [
      "INSERT INTO query_embeddings",
      "  (cache_key, embedding_fingerprint, query_text, dimensions, embedding_json, created_at)",
      "VALUES (?, ?, ?, ?, ?, ?)",
      "ON CONFLICT(cache_key) DO UPDATE SET",
      "  embedding_fingerprint = excluded.embedding_fingerprint,",
      "  query_text = excluded.query_text,",
      "  dimensions = excluded.dimensions,",
      "  embedding_json = excluded.embedding_json,",
      "  created_at = excluded.created_at",
    ].join(" "),
  ).run(
    cacheKey,
    embeddingFingerprint,
    normalizedQueryText,
    vector.length,
    JSON.stringify(vector),
    Date.now(),
  );
  db.prepare(
    [
      "DELETE FROM query_embeddings",
      "WHERE cache_key IN (",
      "  SELECT cache_key FROM query_embeddings",
      "  ORDER BY created_at DESC, rowid DESC",
      "  LIMIT -1 OFFSET ?",
      ")",
    ].join(" "),
  ).run(PROJECT_QUERY_EMBEDDING_CACHE_LIMIT);
  return { vector, cacheHit: false, ...(generated.runtime ? { runtime: generated.runtime } : {}) };
}

function searchProjectMemoryKeywords(
  db: DatabaseSync,
  query: string,
  limit: number,
): Array<{ source_path: string; kind: string; snippet: string; score: number }> {
  const plan = buildProjectKeywordSearchPlan(query);
  if (plan.length === 0) {
    return [];
  }

  const searchFts = db.prepare(
    [
      "SELECT docs.source_path, docs.kind, snippet(docs_fts, 2, '[', ']', ' ... ', 18) AS snippet, bm25(docs_fts) AS score",
      "FROM docs_fts",
      "JOIN docs ON docs.id = docs_fts.rowid",
      "WHERE docs_fts MATCH ?",
      "ORDER BY score ASC",
      "LIMIT ?",
    ].join(" "),
  );
  const bySource = new Map<
    string,
    {
      source_path: string;
      kind: string;
      snippet: string;
      score: number;
      matchedTerms: Set<string>;
      exactMatches: number;
    }
  >();

  for (const step of plan) {
    const rows = collectProjectKeywordRows(db, searchFts, step, limit);
    for (const row of rows) {
      const existing = bySource.get(row.source_path);
      if (!existing) {
        bySource.set(row.source_path, {
          ...row,
          matchedTerms: new Set(step.matchedTerms),
          exactMatches: step.matchedTerms.length > 1 ? 1 : 0,
        });
        continue;
      }
      if (row.score < existing.score) {
        existing.score = row.score;
      }
      if (row.snippet && row.snippet.length > existing.snippet.length) {
        existing.snippet = row.snippet;
      }
      if (step.matchedTerms.length > 1) {
        existing.exactMatches += 1;
      }
      for (const term of step.matchedTerms) {
        existing.matchedTerms.add(term);
      }
    }
  }

  return Array.from(bySource.values())
    .sort((left, right) => {
      if (right.matchedTerms.size !== left.matchedTerms.size) {
        return right.matchedTerms.size - left.matchedTerms.size;
      }
      if (right.exactMatches !== left.exactMatches) {
        return right.exactMatches - left.exactMatches;
      }
      return left.score - right.score;
    })
    .slice(0, limit)
    .map(({ source_path, kind, snippet, score }) => ({
      source_path,
      kind,
      snippet,
      score,
    }));
}

function collectProjectKeywordRows(
  db: DatabaseSync,
  searchFts: ReturnType<DatabaseSync["prepare"]>,
  step: ReturnType<typeof buildProjectKeywordSearchPlan>[number],
  limit: number,
): Array<{ source_path: string; kind: string; snippet: string; score: number }> {
  const rows: Array<{ source_path: string; kind: string; snippet: string; score: number }> = [];
  const seen = new Set<string>();

  if (step.query) {
    const ftsRows = searchFts.all(step.query, limit) as Array<{
      source_path: string;
      kind: string;
      snippet: string;
      score: number;
    }>;
    for (const row of ftsRows) {
      if (matchesAllSubstrings(db, row.source_path, step.substringTerms)) {
        rows.push(row);
        seen.add(row.source_path);
      }
    }
  }

  if (step.substringTerms.length > 0) {
    const substringRows = searchDocsBySubstring(db, step.substringTerms, limit);
    for (const row of substringRows) {
      if (!seen.has(row.source_path)) {
        rows.push(row);
        seen.add(row.source_path);
      }
    }
  }

  return rows;
}

function searchDocsBySubstring(
  db: DatabaseSync,
  substringTerms: string[],
  limit: number,
): Array<{ source_path: string; kind: string; snippet: string; score: number }> {
  const clauses = substringTerms.map(() => "content LIKE ? ESCAPE '\\'").join(" AND ");
  const query = [
    "SELECT source_path, kind, content",
    "FROM docs",
    `WHERE ${clauses}`,
    "LIMIT ?",
  ].join(" ");
  const dynamicRows = db
    .prepare(query)
    .all(...substringTerms.map((term) => `%${escapeLikePattern(term)}%`), limit) as Array<{
    source_path: string;
    kind: string;
    content: string;
  }>;
  return dynamicRows.map((row) => ({
    source_path: row.source_path,
    kind: row.kind,
    snippet: buildSnippet(row.content),
    score: 0,
  }));
}

function searchProjectMemorySignals(
  projectDocs: Array<{ source_path: string; kind: string; content: string }>,
  docSignals: Map<string, ProjectDocSearchSignals>,
  limit: number,
): Array<{ source_path: string; kind: string; snippet: string; score: number }> {
  return projectDocs
    .filter((row) => (docSignals.get(row.source_path)?.matchedTermCount ?? 0) > 0)
    .sort((left, right) => {
      const leftSignals = docSignals.get(left.source_path);
      const rightSignals = docSignals.get(right.source_path);
      if ((rightSignals?.strongMatchedTermCount ?? 0) !== (leftSignals?.strongMatchedTermCount ?? 0)) {
        return (rightSignals?.strongMatchedTermCount ?? 0) - (leftSignals?.strongMatchedTermCount ?? 0);
      }
      if ((rightSignals?.matchedTermCount ?? 0) !== (leftSignals?.matchedTermCount ?? 0)) {
        return (rightSignals?.matchedTermCount ?? 0) - (leftSignals?.matchedTermCount ?? 0);
      }
      if ((rightSignals?.exactBoost ?? 0) !== (leftSignals?.exactBoost ?? 0)) {
        return (rightSignals?.exactBoost ?? 0) - (leftSignals?.exactBoost ?? 0);
      }
      if ((rightSignals?.fileNameHits ?? 0) !== (leftSignals?.fileNameHits ?? 0)) {
        return (rightSignals?.fileNameHits ?? 0) - (leftSignals?.fileNameHits ?? 0);
      }
      return (rightSignals?.pathHits ?? 0) - (leftSignals?.pathHits ?? 0);
    })
    .slice(0, limit)
    .map((row) => ({
      source_path: row.source_path,
      kind: row.kind,
      snippet: buildSnippet(row.content),
      score: 0,
    }));
}

function matchesAllSubstrings(db: DatabaseSync, sourcePath: string, substringTerms: string[]): boolean {
  if (substringTerms.length === 0) {
    return true;
  }
  const row = db
    .prepare("SELECT content FROM docs WHERE source_path = ?")
    .get(sourcePath) as { content: string } | undefined;
  if (!row) {
    return false;
  }
  return substringTerms.every((term) => row.content.includes(term));
}

function escapeLikePattern(term: string): string {
  return term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function rerankProjectSearchCandidates(
  candidates: Array<
    MemorySearchResultEntry & {
      vectorRank?: number;
      textRank?: number;
      signalRank?: number;
    }
  >,
  docSignals: Map<string, ProjectDocSearchSignals>,
  limit: number,
): MemorySearchResultEntry[] {
  const remaining = [...candidates];
  const selected: MemorySearchResultEntry[] = [];
  const coveredStrongTerms = new Set<string>();
  const coveredTerms = new Set<string>();

  while (remaining.length > 0 && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const signals = docSignals.get(candidate.sourcePath);
      const routeCount =
        (candidate.vectorRank ? 1 : 0) + (candidate.textRank ? 1 : 0) + (candidate.signalRank ? 1 : 0);
      const uncoveredStrongTerms = (signals?.strongMatchedTerms ?? []).filter((term) => !coveredStrongTerms.has(term));
      const uncoveredTerms = (signals?.matchedTerms ?? []).filter((term) => !coveredTerms.has(term));
      const adjustedScore =
        candidate.score
        + uncoveredStrongTerms.length * 0.045
        + uncoveredTerms.length * 0.01
        + Math.max(routeCount - 1, 0) * 0.003;

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIndex = index;
        continue;
      }
      if (adjustedScore === bestScore) {
        const currentBest = remaining[bestIndex];
        const currentSignals = docSignals.get(currentBest.sourcePath);
        if ((signals?.strongMatchedTermCount ?? 0) !== (currentSignals?.strongMatchedTermCount ?? 0)) {
          if ((signals?.strongMatchedTermCount ?? 0) > (currentSignals?.strongMatchedTermCount ?? 0)) {
            bestIndex = index;
          }
          continue;
        }
        if ((signals?.matchedTermCount ?? 0) !== (currentSignals?.matchedTermCount ?? 0)) {
          if ((signals?.matchedTermCount ?? 0) > (currentSignals?.matchedTermCount ?? 0)) {
            bestIndex = index;
          }
          continue;
        }
        if ((signals?.exactBoost ?? 0) > (currentSignals?.exactBoost ?? 0)) {
          bestIndex = index;
        }
      }
    }

    const [next] = remaining.splice(bestIndex, 1);
    const nextSignals = docSignals.get(next.sourcePath);
    nextSignals?.strongMatchedTerms.forEach((term) => coveredStrongTerms.add(term));
    nextSignals?.matchedTerms.forEach((term) => coveredTerms.add(term));
    selected.push({
      sourcePath: next.sourcePath,
      kind: next.kind,
      snippet: next.snippet,
      score: next.score,
    });
  }

  return selected;
}

function buildProjectSearchSignals(input: {
  sourcePath: string;
  content: string;
  query: string;
  queryIntent: {
    terms: string[];
    strongTerms: string[];
    weakTerms: string[];
  };
}): ProjectDocSearchSignals {
  const normalizedQuery = input.query.trim();
  const normalizedContent = input.content.toLowerCase();
  const normalizedPath = input.sourcePath.toLowerCase();
  const fileName = path.basename(input.sourcePath).toLowerCase();
  const lowerTerms = input.queryIntent.terms.map((term) => term.toLowerCase());
  const lowerStrongTerms = input.queryIntent.strongTerms.map((term) => term.toLowerCase());
  const lowerWeakTerms = input.queryIntent.weakTerms.map((term) => term.toLowerCase());
  const matchedContentTerms = lowerTerms.filter((term) => normalizedContent.includes(term));
  const matchedPathTerms = lowerTerms.filter((term) => normalizedPath.includes(term));
  const matchedTerms = new Set([...matchedContentTerms, ...matchedPathTerms]);
  const strongMatchedTerms = new Set(
    lowerStrongTerms.filter((term) => normalizedContent.includes(term) || normalizedPath.includes(term)),
  );
  const weakMatchedTerms = new Set(
    lowerWeakTerms.filter((term) => normalizedContent.includes(term) || normalizedPath.includes(term)),
  );
  const matchedCharacters = Array.from(matchedTerms).reduce((sum, term) => sum + term.length, 0);
  const normalizedLength = Math.max(Array.from(input.content.trim()).length, 1);
  const coverageRatio = lowerTerms.length > 0 ? matchedTerms.size / lowerTerms.length : 0;
  const strongCoverageRatio = lowerStrongTerms.length > 0 ? strongMatchedTerms.size / lowerStrongTerms.length : 0;
  const densityRatio = matchedCharacters / normalizedLength;
  const fileNameHits = lowerTerms.filter((term) => fileName.includes(term)).length;
  const pathHits = matchedPathTerms.length;
  const phraseMatch = normalizedQuery.length > 0
    && (normalizedContent.includes(normalizedQuery.toLowerCase()) || normalizedPath.includes(normalizedQuery.toLowerCase()));
  const weakOnlyPenalty = strongMatchedTerms.size === 0 && weakMatchedTerms.size > 0 ? 0.012 : 0;
  const missingStrongPenalty =
    lowerStrongTerms.length > 0 && strongMatchedTerms.size === 0
      ? 0.035
      : lowerStrongTerms.length > 1 && strongMatchedTerms.size === 1
        ? 0.01
        : 0;
  const indexFilePenalty = isIndexLikeDocName(fileName) ? 0.06 : 0;

  return {
    matchedTerms: Array.from(matchedTerms),
    strongMatchedTerms: Array.from(strongMatchedTerms),
    weakMatchedTerms: Array.from(weakMatchedTerms),
    matchedTermCount: matchedTerms.size,
    strongMatchedTermCount: strongMatchedTerms.size,
    fileNameHits,
    pathHits,
    phraseMatch,
    strongCoverageRatio,
    exactBoost:
      strongMatchedTerms.size * 0.016
      + weakMatchedTerms.size * 0.004
      + coverageRatio * 0.008
      + strongCoverageRatio * 0.014
      + densityRatio * 0.02
      + fileNameHits * 0.025
      + pathHits * 0.01
      + (phraseMatch ? 0.018 : 0)
      - weakOnlyPenalty
      - missingStrongPenalty
      - indexFilePenalty,
  };
}

function isIndexLikeDocName(fileName: string): boolean {
  return fileName === "contents.md" || fileName === "summary.md" || fileName === "index.md" || fileName === "readme.md";
}

function reciprocalRankScore(rank: number, weight: number): number {
  return weight * (1 / (40 + rank));
}

function parseEmbeddingJson(value: string): number[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map((entry) => Number(entry)) : [];
}

function cosineSimilarity(left: number[], right: number[]): number {
  const dimensions = Math.min(left.length, right.length);
  if (dimensions === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < dimensions; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function buildSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177)}...`;
}
