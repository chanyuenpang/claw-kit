import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compactKnowledgeDocument } from "./knowledge-document.js";

export type KnowledgeMarkdownSnapshot = Record<string, string>;

export type KnowledgeGovernanceFileResult = {
  path: string;
  datedSectionCountBefore: number;
  datedSectionCountAfter: number;
  removedSections: Array<{ date: string; heading: string }>;
};

export type KnowledgeGovernanceResult = {
  changedFiles: number;
  compactedFiles: number;
  removedSections: number;
  files: KnowledgeGovernanceFileResult[];
};

export function snapshotKnowledgeMarkdown(truthDir: string): KnowledgeMarkdownSnapshot {
  const snapshot: KnowledgeMarkdownSnapshot = {};
  for (const filePath of listMarkdownFiles(truthDir)) {
    const relativePath = normalizeRelativePath(path.relative(truthDir, filePath));
    snapshot[relativePath] = hashContent(fs.readFileSync(filePath));
  }
  return snapshot;
}

export function changedKnowledgeMarkdownPaths(
  before: KnowledgeMarkdownSnapshot,
  after: KnowledgeMarkdownSnapshot,
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((relativePath) => before[relativePath] !== after[relativePath])
    .sort((left, right) => left.localeCompare(right));
}

export function governChangedKnowledgeMarkdown(input: {
  truthDir: string;
  before: KnowledgeMarkdownSnapshot;
  datedSectionsToKeep: number;
}): KnowledgeGovernanceResult {
  const pendingWrites: Array<{ filePath: string; content: string }> = [];
  const files: KnowledgeGovernanceFileResult[] = [];
  let changedFiles = 0;

  for (const filePath of listMarkdownFiles(input.truthDir)) {
    const relativePath = normalizeRelativePath(path.relative(input.truthDir, filePath));
    const raw = fs.readFileSync(filePath);
    if (input.before[relativePath] === hashContent(raw)) {
      continue;
    }
    changedFiles += 1;
    validateCanonicalKnowledgeStructure(raw.toString("utf-8"), filePath);
    const compacted = compactKnowledgeDocument(raw.toString("utf-8"), {
      datedSectionsToKeep: input.datedSectionsToKeep,
      sourcePath: filePath,
    });
    if (!compacted.changed) {
      continue;
    }
    pendingWrites.push({ filePath, content: compacted.content });
    files.push({
      path: relativePath,
      datedSectionCountBefore: compacted.datedSectionCountBefore,
      datedSectionCountAfter: compacted.datedSectionCountAfter,
      removedSections: compacted.removedSections,
    });
  }

  for (const pending of pendingWrites) {
    fs.writeFileSync(pending.filePath, pending.content, "utf-8");
  }

  return {
    changedFiles,
    compactedFiles: files.length,
    removedSections: files.reduce((sum, file) => sum + file.removedSections.length, 0),
    files,
  };
}

/** Applies the built-in retention rule to an explicit, already-contained path list. */
export function governKnowledgeMarkdownPaths(input: {
  truthDir: string;
  relativePaths: string[];
  datedSectionsToKeep: number;
}): KnowledgeGovernanceResult {
  const files: KnowledgeGovernanceFileResult[] = [];
  let changedFiles = 0;
  const truthRoot = path.resolve(input.truthDir);
  for (const relativePath of [...new Set(input.relativePaths)].sort((a, b) => a.localeCompare(b))) {
    const filePath = path.resolve(truthRoot, relativePath);
    if (path.relative(truthRoot, filePath).startsWith("..") || path.isAbsolute(path.relative(truthRoot, filePath)) || !/\.md$/iu.test(filePath)) {
      throw new Error(`Knowledge document path must be a Markdown file inside the truth directory: ${relativePath}`);
    }
    if (!fs.existsSync(filePath)) continue;
    changedFiles += 1;
    const raw = fs.readFileSync(filePath, "utf-8");
    validateCanonicalKnowledgeStructure(raw, filePath);
    const compacted = compactKnowledgeDocument(raw, {
      datedSectionsToKeep: input.datedSectionsToKeep,
      sourcePath: filePath,
    });
    if (!compacted.changed) continue;
    fs.writeFileSync(filePath, compacted.content, "utf-8");
    files.push({
      path: relativePath.replaceAll("\\", "/"),
      datedSectionCountBefore: compacted.datedSectionCountBefore,
      datedSectionCountAfter: compacted.datedSectionCountAfter,
      removedSections: compacted.removedSections,
    });
  }
  return {
    changedFiles,
    compactedFiles: files.length,
    removedSections: files.reduce((sum, file) => sum + file.removedSections.length, 0),
    files,
  };
}

function validateCanonicalKnowledgeStructure(content: string, sourcePath: string): void {
  const lines = content.replace(/\r\n/g, "\n");
  const isAdr = /(?:^|[\\/])adr(?:[\\/]|$)/iu.test(sourcePath);
  const fail = (requirement: string) => {
    throw new Error(`KNOWLEDGE_CANONICAL_FORMAT_INVALID: ${sourcePath} must ${requirement}. Follow knowledge-format.md before retrying completion.`);
  };
  if (!/^\uFEFF?#\s+.+/mu.test(lines)) fail("start with one level-one title");
  if (isAdr) {
    if (!/^\uFEFF?# ADR:\s+.+/mu.test(lines)) fail("use a '# ADR: …' title");
    for (const heading of ["Context", "Decision", "Alternatives", "Consequences"]) {
      if (!new RegExp(`^##\\s+${heading}\\s*$`, "mu").test(lines)) fail(`include a '## ${heading}' section`);
    }
    return;
  }
  if (/<!--\s*state:\s*historical\s*-->\s*\n##\s+Current behavior/iu.test(lines)) {
    fail("not mark '## Current behavior' as historical; use '<!-- state: current -->' for that section and document-state only when needed");
  }
  if (!/<!--\s*state:\s*current\s*-->\s*\n##\s+Current behavior/iu.test(lines)) {
    fail("include '<!-- state: current -->' immediately before '## Current behavior'");
  }
  if (/##\s+Evolution history/iu.test(lines) && !/<!--\s*state:\s*history\s*-->\s*\n##\s+Evolution history/iu.test(lines)) {
    fail("place '<!-- state: history -->' immediately before '## Evolution history'");
  }
}

function listMarkdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(target);
      } else if (entry.isFile() && /\.md$/iu.test(entry.name)) {
        files.push(target);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function hashContent(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/");
}
