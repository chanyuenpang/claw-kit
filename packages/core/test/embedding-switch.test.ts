import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import {
  initProject, resolveProjectContext, ensureProjectProtocol, ProjectConfigRepository,
  resolveProjectMemoryEmbeddingConfig, searchMemory, searchMemoryAsync,
  buildMemoryIndex, warmProjectMemoryEmbedding, resolveKnowledgeDocUpdateSnapshot,
  type MemoryEmbeddingConfig,
} from "../src/index.js";

for (const embedding of [undefined, null,
  { provider: "local", model: "existing-local" },
  { provider: "openai", model: "existing-remote" },
  { enabled: false, provider: "local", model: "existing-local" },
] as Array<MemoryEmbeddingConfig | null | undefined>) {
  test(`embedding opt-in: ${JSON.stringify(embedding)} uses discovery without model or database access`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-embedding-switch-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    initProject({ cwd: root, projectName: "Switch" });
    const configPath = path.join(root, ".claw", "project.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.memory.embedding.enabled, false);
    config.memory.embedding = embedding;
    config.memory.externalDocPaths = ["docs/", "docs", "handbook.md", "missing"];
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "handbook.md"), "External handbook");
    fs.writeFileSync(configPath, JSON.stringify(config));
    // A pre-existing invalid database proves discovery never opens SQLite.
    const store = path.join(root, ".claw", "memory.sqlite");
    const sentinel = "existing database must remain untouched";
    fs.writeFileSync(store, sentinel);
    const spawn = t.mock.method(childProcess, "spawn", () => { throw new Error("embedding spawn forbidden"); });
    const spawnSync = t.mock.method(childProcess, "spawnSync", () => { throw new Error("embedding spawnSync forbidden"); });
    syncBuiltinESMExports();
    try {
      const project = resolveProjectContext(root);
      assert.equal(resolveProjectMemoryEmbeddingConfig(project), null);
      assert.deepEqual(resolveKnowledgeDocUpdateSnapshot(project), { externalDocPaths: config.memory.externalDocPaths });
      for (const search of [searchMemory, searchMemoryAsync]) {
        const result = await search({ cwd: path.join(root, "docs"), query: "handbook" });
        assert.equal(result.mode, "discovery");
        assert.equal(result.unavailable, undefined);
        assert.equal(result.telemetry.queryEmbedding, "skipped");
        assert.deepEqual(result.discovery?.locations, [
          { path: path.join(root, ".claw", "truth"), kind: "truth", type: "directory", exists: true },
          { path: path.join(root, "docs"), kind: "external_doc", type: "directory", exists: true },
          { path: path.join(root, "handbook.md"), kind: "external_doc", type: "file", exists: true },
          { path: path.join(root, "missing"), kind: "external_doc", type: "missing", exists: false },
        ]);
        assert.match(result.discovery!.nextStep, /No vector index refresh/);
      }
      assert.equal(buildMemoryIndex({ cwd: root }).skipped, "embedding_disabled");
      assert.deepEqual(await warmProjectMemoryEmbedding({ cwd: root }), { warmed: false, reason: "disabled" });
      assert.equal(fs.readFileSync(store, "utf8"), sentinel);
      assert.equal(spawn.mock.callCount(), 0);
      assert.equal(spawnSync.mock.callCount(), 0);
    } finally {
      spawn.mock.restore(); spawnSync.mock.restore(); syncBuiltinESMExports();
    }
    ensureProjectProtocol(root);
    assert.equal(resolveProjectMemoryEmbeddingConfig(resolveProjectContext(root)), null);
    const repaired = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (embedding === null) assert.equal(repaired.memory.embedding, null);
    else {
      assert.equal(repaired.memory.embedding.enabled, false);
      if (embedding) assert.equal(repaired.memory.embedding.model, embedding.model);
    }
  });
}

test("explicit opt-in respects personal override and config key round trip", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-embedding-override-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initProject({ cwd: root, projectName: "Override" });
  const repository = new ProjectConfigRepository();
  let snapshot = repository.read(root);
  repository.setKey({ projectRoot: root, layer: "team", path: "memory.embedding.enabled", value: true, expectedRevision: snapshot.revisions.team });
  assert.ok(resolveProjectMemoryEmbeddingConfig(resolveProjectContext(root)));
  snapshot = repository.read(root);
  repository.setKey({ projectRoot: root, layer: "personal", path: "memory.embedding.enabled", value: false, expectedRevision: snapshot.revisions.personal });
  assert.equal(resolveProjectMemoryEmbeddingConfig(resolveProjectContext(root)), null);
  ensureProjectProtocol(root);
  assert.equal(resolveProjectMemoryEmbeddingConfig(resolveProjectContext(root)), null);
  snapshot = repository.read(root);
  repository.unsetKey({ projectRoot: root, layer: "personal", path: "memory.embedding.enabled", expectedRevision: snapshot.revisions.personal });
  assert.ok(resolveProjectMemoryEmbeddingConfig(resolveProjectContext(root)));
});
