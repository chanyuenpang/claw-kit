import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type KnowledgeGitState = {
  gitRoot: string;
  preexistingDirtyPaths: Set<string>;
};

type KnowledgeCommitResult =
  | { status: "committed"; commit: string }
  | { status: "nothing-to-commit" | "unavailable" };

export function captureKnowledgeGitState(projectRoot: string, truthDir: string): KnowledgeGitState | null {
  try {
    const rootResult = runGit(["rev-parse", "--show-toplevel"], projectRoot);
    if (rootResult.status !== 0) {
      return null;
    }
    const gitRoot = rootResult.stdout.trim();
    const truthPath = repositoryRelativePath(gitRoot, truthDir);
    if (!truthPath) {
      return null;
    }
    const statusResult = runGit(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", truthPath],
      gitRoot,
    );
    if (statusResult.status !== 0) {
      return null;
    }
    return {
      gitRoot,
      preexistingDirtyPaths: parsePorcelainPaths(statusResult.stdout),
    };
  } catch {
    return null;
  }
}

export function commitKnowledgeDocumentation(input: {
  state: KnowledgeGitState | null;
  truthDir: string;
  changedPaths: string[];
  message: string;
}): KnowledgeCommitResult {
  if (!input.state) {
    return { status: "unavailable" };
  }
  const selectedPaths = input.changedPaths
    .map((relativePath) => repositoryRelativePath(
      input.state!.gitRoot,
      path.resolve(input.truthDir, relativePath),
    ))
    .filter((relativePath): relativePath is string => Boolean(relativePath))
    .filter((relativePath) => !input.state!.preexistingDirtyPaths.has(relativePath));
  if (selectedPaths.length === 0) {
    return { status: "nothing-to-commit" };
  }

  let temporaryDir: string | null = null;
  try {
    temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-knowledge-index-"));
    const temporaryIndex = path.join(temporaryDir, "index");
    const temporaryEnvironment = {
      ...gitEnvironment(),
      GIT_INDEX_FILE: temporaryIndex,
    };
    if (runGit(["read-tree", "HEAD"], input.state.gitRoot, temporaryEnvironment).status !== 0) {
      return { status: "unavailable" };
    }
    if (runGit(["add", "-A", "--", ...selectedPaths], input.state.gitRoot, temporaryEnvironment).status !== 0) {
      return { status: "unavailable" };
    }
    const diff = runGit(["diff", "--cached", "--quiet", "--exit-code"], input.state.gitRoot, temporaryEnvironment);
    if (diff.status === 0) {
      return { status: "nothing-to-commit" };
    }
    if (diff.status !== 1) {
      return { status: "unavailable" };
    }
    // Hooks can stage unrelated paths into the temporary index, which would violate the
    // ownership boundary this background commit exists to preserve.
    if (runGit(["commit", "--no-verify", "-m", input.message], input.state.gitRoot, temporaryEnvironment).status !== 0) {
      return { status: "unavailable" };
    }
    const commit = runGit(["rev-parse", "HEAD"], input.state.gitRoot).stdout.trim();
    // The temporary index moved HEAD without touching the user's real index. Refresh only
    // the paths owned by this commit so unrelated staged entries remain exactly as they were.
    runGit(["reset", "--quiet", "HEAD", "--", ...selectedPaths], input.state.gitRoot);
    return { status: "committed", commit };
  } catch {
    return { status: "unavailable" };
  } finally {
    if (temporaryDir) {
      try {
        fs.rmSync(temporaryDir, { recursive: true, force: true });
      } catch {
        // Temporary-index cleanup must not change finalizer success semantics.
      }
    }
  }
}

function runGit(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = gitEnvironment(),
): { status: number | null; stdout: string } {
  const result = spawnSync("git", args, {
    cwd,
    env,
    encoding: "utf-8",
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_INDEX_FILE;
  return env;
}

function repositoryRelativePath(gitRoot: string, target: string): string | null {
  const relativePath = path.relative(gitRoot, target);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return null;
  }
  return relativePath.replaceAll("\\", "/");
}

function parsePorcelainPaths(output: string): Set<string> {
  const paths = new Set<string>();
  const entries = output.split("\0");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) {
      continue;
    }
    const status = entry.slice(0, 2);
    paths.add(entry.slice(3).replaceAll("\\", "/"));
    if (status.includes("R") || status.includes("C")) {
      const originalPath = entries[index + 1];
      if (originalPath) {
        paths.add(originalPath.replaceAll("\\", "/"));
        index += 1;
      }
    }
  }
  return paths;
}
