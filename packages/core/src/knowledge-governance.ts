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
