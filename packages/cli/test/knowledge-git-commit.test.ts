import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  captureKnowledgeGitState,
  commitKnowledgeDocumentation,
} from "../dist/knowledge-git-commit.js";

function createRepository(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `claw-knowledge-git-${name}-`));
  git(root, ["init"]);
  git(root, ["config", "user.name", "Claw Test"]);
  git(root, ["config", "user.email", "claw@example.test"]);
  return root;
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf-8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

test("knowledge commit includes only clean paths changed by the finalizer", () => {
  const root = createRepository("isolated");
  const truthDir = path.join(root, ".claw", "truth");
  write(root, ".claw/truth/features/clean.md", "clean baseline\n");
  write(root, ".claw/truth/features/preexisting.md", "user baseline\n");
  write(root, "unrelated.txt", "baseline\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);

  write(root, ".claw/truth/features/preexisting.md", "user edit before finalizer\n");
  write(root, "unrelated.txt", "unrelated staged edit\n");
  git(root, ["add", "unrelated.txt"]);
  const state = captureKnowledgeGitState(root, truthDir);

  write(root, ".claw/truth/features/clean.md", "finalizer edit\n");
  write(root, ".claw/truth/features/preexisting.md", "user edit plus finalizer edit\n");
  const result = commitKnowledgeDocumentation({
    state,
    truthDir,
    changedPaths: ["features/clean.md", "features/preexisting.md"],
    message: "Source task — exact message",
  });

  assert.equal(result.status, "committed");
  assert.equal(git(root, ["log", "-1", "--pretty=%B"]).trim(), "Source task — exact message");
  assert.deepEqual(
    git(root, ["show", "--format=", "--name-only", "HEAD"]).trim().split(/\r?\n/u),
    [".claw/truth/features/clean.md"],
  );
  assert.equal(git(root, ["diff", "--cached", "--name-only"]).trim(), "unrelated.txt");
  assert.equal(git(root, ["diff", "--name-only"]).trim(), ".claw/truth/features/preexisting.md");
});

test("knowledge commit safely no-ops when no documentation changed", () => {
  const root = createRepository("no-change");
  const truthDir = path.join(root, ".claw", "truth");
  write(root, ".claw/truth/features/existing.md", "baseline\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);
  const before = git(root, ["rev-parse", "HEAD"]).trim();

  const result = commitKnowledgeDocumentation({
    state: captureKnowledgeGitState(root, truthDir),
    truthDir,
    changedPaths: [],
    message: "unused task",
  });

  assert.equal(result.status, "nothing-to-commit");
  assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), before);
});

test("knowledge commit failure leaves documentation and finalizer-owned index state untouched", () => {
  const root = createRepository("commit-failure");
  const truthDir = path.join(root, ".claw", "truth");
  write(root, ".claw/truth/features/failing.md", "baseline\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);
  const before = git(root, ["rev-parse", "HEAD"]).trim();
  const state = captureKnowledgeGitState(root, truthDir);
  write(root, ".claw/truth/features/failing.md", "finalizer edit remains available\n");
  git(root, ["config", "commit.gpgSign", "true"]);
  git(root, ["config", "gpg.program", path.join(root, "missing-gpg")]);

  const result = commitKnowledgeDocumentation({
    state,
    truthDir,
    changedPaths: ["features/failing.md"],
    message: "failing task",
  });

  assert.equal(result.status, "unavailable");
  assert.equal(git(root, ["rev-parse", "HEAD"]).trim(), before);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]).trim(), "");
  assert.equal(git(root, ["diff", "--name-only"]).trim(), ".claw/truth/features/failing.md");
  assert.equal(fs.readFileSync(path.join(truthDir, "features", "failing.md"), "utf-8"), "finalizer edit remains available\n");
});
