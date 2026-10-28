import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureProjectEnvironment, searchMemory, searchMemoryAsync } from "../src/index.js";

for (const search of [searchMemory, searchMemoryAsync]) {
  test(`${search.name}: missing project/index and disabled recall are advisory without writes`, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-availability-"));
    const missing = await search({ cwd, query: "decision" });
    assert.deepEqual(missing.results, []);
    assert.equal(missing.unavailable?.code, "CLAW_DIR_NOT_FOUND");
    assert.deepEqual(fs.readdirSync(cwd), []);
    const project = ensureProjectEnvironment(cwd);
    const before = fs.readdirSync(project.clawDir).sort();
    const discovery = await search({ cwd, query: "decision" });
    assert.equal(discovery.mode, "discovery");
    assert.equal(discovery.unavailable, undefined);
    const enabledConfig = JSON.parse(fs.readFileSync(project.projectJsonPath, "utf8"));
    enabledConfig.memory.embedding.enabled = true;
    fs.writeFileSync(project.projectJsonPath, JSON.stringify(enabledConfig));
    const absentIndex = await search({ cwd, query: "decision" });
    assert.equal(absentIndex.unavailable?.code, "MEMORY_VECTOR_INDEX_REQUIRED");
    assert.deepEqual(absentIndex.results, []);
    assert.deepEqual(fs.readdirSync(project.clawDir).sort(), before);
    const config = JSON.parse(fs.readFileSync(project.projectJsonPath, "utf8"));
    config.memory = { ...config.memory, enabled: false };
    fs.writeFileSync(project.projectJsonPath, JSON.stringify(config));
    const disabled = await search({ cwd, query: "decision" });
    assert.equal(disabled.unavailable?.code, "MEMORY_DISABLED");
    assert.match(disabled.unavailable!.nextStep, /repository search/);
  });

  test(`${search.name}: malformed query remains a real error`, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-invalid-"));
    await assert.rejects(async () => search({ cwd, query: " " }), { code: "MEMORY_QUERY_REQUIRED" });
  });
}
