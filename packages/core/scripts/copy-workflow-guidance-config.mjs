import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(packageDir, "src", "workflow-guidance.config.json");
const destPath = path.join(packageDir, "dist", "src", "workflow-guidance.config.json");

fs.mkdirSync(path.dirname(destPath), { recursive: true });
fs.copyFileSync(sourcePath, destPath);

const knowledgeWriterSource = path.join(packageDir, "resources", "knowledge-writer");
const knowledgeWriterDest = path.join(packageDir, "dist", "src", "resources", "knowledge-writer");
fs.rmSync(knowledgeWriterDest, { recursive: true, force: true });
fs.cpSync(knowledgeWriterSource, knowledgeWriterDest, { recursive: true });

const docUpdaterSource = path.join(packageDir, "resources", "doc-updater");
const docUpdaterDest = path.join(packageDir, "dist", "src", "resources", "doc-updater");
fs.rmSync(docUpdaterDest, { recursive: true, force: true });
fs.cpSync(docUpdaterSource, docUpdaterDest, { recursive: true });

const delegateWriterSource = path.join(packageDir, "resources", "delegate-writer");
const delegateWriterDest = path.join(packageDir, "dist", "src", "resources", "delegate-writer");
fs.rmSync(delegateWriterDest, { recursive: true, force: true });
fs.cpSync(delegateWriterSource, delegateWriterDest, { recursive: true });

const cindyDelegateWriterSource = path.join(packageDir, "resources", "cindy-delegate-writer");
const cindyDelegateWriterDest = path.join(packageDir, "dist", "src", "resources", "cindy-delegate-writer");
fs.rmSync(cindyDelegateWriterDest, { recursive: true, force: true });
fs.cpSync(cindyDelegateWriterSource, cindyDelegateWriterDest, { recursive: true });
