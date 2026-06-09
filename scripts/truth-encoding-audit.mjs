#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { ensureUtf8Bom, hasUtf8BomPrefix } from "../packages/core/dist/src/text-encoding.js";

const mode = process.argv.includes("--write") ? "write" : "check";
const root = path.resolve(process.cwd(), ".claw", "truth");

if (!fs.existsSync(root)) {
  process.exit(0);
}

const markdownFiles = listMarkdownFiles(root);
const missingBom = [];

for (const filePath of markdownFiles) {
  const raw = fs.readFileSync(filePath);
  if (hasUtf8BomPrefix(raw)) {
    continue;
  }
  missingBom.push(filePath);
  if (mode === "write") {
    const content = raw.toString("utf8");
    fs.writeFileSync(filePath, ensureUtf8Bom(content), "utf8");
  }
}

if (missingBom.length === 0) {
  console.log(`truth encoding audit ok (${mode})`);
  process.exit(0);
}

for (const filePath of missingBom) {
  const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  console.log(`${mode === "write" ? "added UTF-8 BOM" : "missing UTF-8 BOM"}: ${relative}`);
}

if (mode === "check") {
  process.exitCode = 1;
}

function listMarkdownFiles(rootDir) {
  const results = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (/\.md$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}
