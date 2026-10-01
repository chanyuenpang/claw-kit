import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoots = [
  path.join(".agents", "skills"),
  path.join("shared", "skills", "knowledge-capture"),
  path.join("packages", "codex-adapter", "skills", "update"),
  path.join("packages", "core", "resources"),
  path.join("packages", "dsh-adapter", "skills", "update"),
  path.join("packages", "opencode-adapter", "skills", "update"),
];
const defaultTemplateSource = path.join("packages", "core", "src", "templates", "plans", "default.ts");
const templateDriverSource = path.join("packages", "core", "src", "plan-templates.ts");
// Only canonical source pins are edited. Artifact assembly copies this file verbatim.
const knowledgeCaptureRuntimeSpecs = [
  path.join("shared", "skills", "knowledge-capture", "runtime.json"),
];

export async function collectReleaseTemplatePaths(repoRoot = defaultRepoRoot) {
  const matches = [];
  for (const relativeRoot of templateRoots) {
    await collectNamedFiles(path.join(repoRoot, relativeRoot), "TEMPLATE.json", matches);
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

export async function inspectTemplateVersions({ repoRoot = defaultRepoRoot, expectedVersion } = {}) {
  const releaseVersion = expectedVersion ?? await readReleaseVersion(repoRoot);
  const templateDriverVersion = await readTemplateDriverVersion(repoRoot);
  const issues = [];
  const templatePaths = await collectReleaseTemplatePaths(repoRoot);
  for (const templatePath of templatePaths) {
    const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
    if (template.version !== templateDriverVersion) {
      issues.push({
        path: path.relative(repoRoot, templatePath),
        actualVersion: typeof template.version === "string" ? template.version : null,
        expectedVersion: templateDriverVersion,
      });
    }
  }

  const defaultPath = path.join(repoRoot, defaultTemplateSource);
  const defaultSource = await fs.readFile(defaultPath, "utf8");
  const defaultVersion = readDefaultTemplateVersion(defaultSource, defaultPath);
  if (defaultVersion !== templateDriverVersion) {
    issues.push({
      path: defaultTemplateSource,
      actualVersion: defaultVersion,
      expectedVersion: templateDriverVersion,
    });
  }

  for (const knowledgeCaptureRuntimeSpec of knowledgeCaptureRuntimeSpecs) {
    const runtimePath = path.join(repoRoot, knowledgeCaptureRuntimeSpec);
    try {
      const runtime = JSON.parse(await fs.readFile(runtimePath, "utf8"));
      if (runtime.version !== releaseVersion) {
        issues.push({ path: knowledgeCaptureRuntimeSpec, actualVersion: typeof runtime.version === "string" ? runtime.version : null, expectedVersion: releaseVersion });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      // A missing canonical pin is an issue; artifact assembly cannot repair it.
      issues.push({ path: knowledgeCaptureRuntimeSpec, actualVersion: null, expectedVersion: releaseVersion });
    }
  }

  return { version: templateDriverVersion, releaseVersion, templateCount: templatePaths.length, issues };
}

export async function assertTemplateVersionsAligned(options = {}) {
  const result = await inspectTemplateVersions(options);
  if (result.issues.length > 0) {
    const details = result.issues
      .map((issue) => `- ${issue.path}: ${issue.actualVersion ?? "missing"} (expected ${issue.expectedVersion})`)
      .join("\n");
    throw new Error(
      `Release template versions are out of date:\n${details}\nRun npm run sync:template-versions, review the canonical source changes, then rebuild and verify the selected artifact.`,
    );
  }
  return result;
}

export async function updateTemplateVersions({ repoRoot = defaultRepoRoot, expectedVersion } = {}) {
  const releaseVersion = expectedVersion ?? await readReleaseVersion(repoRoot);
  const templateDriverVersion = await readTemplateDriverVersion(repoRoot);
  const templatePaths = await collectReleaseTemplatePaths(repoRoot);
  const updated = [];
  for (const templatePath of templatePaths) {
    const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
    if (template.version === templateDriverVersion) continue;
    template.version = templateDriverVersion;
    await fs.writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
    updated.push(path.relative(repoRoot, templatePath));
  }

  const defaultPath = path.join(repoRoot, defaultTemplateSource);
  const defaultSource = await fs.readFile(defaultPath, "utf8");
  const defaultVersion = readDefaultTemplateVersion(defaultSource, defaultPath);
  if (defaultVersion !== templateDriverVersion) {
    const markerIndex = defaultSource.indexOf("export const defaultPlanTemplate");
    const before = defaultSource.slice(0, markerIndex);
    const templateSection = defaultSource.slice(markerIndex).replace(
      /version:\s*"[^"]+"/u,
      `version: "${templateDriverVersion}"`,
    );
    await fs.writeFile(defaultPath, `${before}${templateSection}`, "utf8");
    updated.push(defaultTemplateSource);
  }

  for (const knowledgeCaptureRuntimeSpec of knowledgeCaptureRuntimeSpecs) {
    const runtimePath = path.join(repoRoot, knowledgeCaptureRuntimeSpec);
    try {
      const runtime = JSON.parse(await fs.readFile(runtimePath, "utf8"));
      if (runtime.version !== releaseVersion) {
        runtime.version = releaseVersion;
        await fs.writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
        updated.push(knowledgeCaptureRuntimeSpec);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      // The updater cannot synthesize a missing canonical specification;
      // inspectTemplateVersions keeps that authoring error visible.
    }
  }

  return { version: templateDriverVersion, releaseVersion, templateCount: templatePaths.length, updated };
}

async function readTemplateDriverVersion(repoRoot) {
  const sourcePath = path.join(repoRoot, templateDriverSource);
  const source = await fs.readFile(sourcePath, "utf8");
  const match = source.match(/TEMPLATE_DRIVER_VERSION\s*=\s*"([^"\\s]+)"/u);
  if (!match) {
    throw new Error(`Template driver version is missing from ${templateDriverSource}.`);
  }
  return match[1];
}

async function readReleaseVersion(repoRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error("Root package.json must declare a release version.");
  }
  return manifest.version.trim();
}

async function collectNamedFiles(directory, fileName, output) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectNamedFiles(entryPath, fileName, output);
    } else if (entry.isFile() && entry.name === fileName) {
      output.push(entryPath);
    }
  }
}

function readDefaultTemplateVersion(source, sourcePath) {
  const markerIndex = source.indexOf("export const defaultPlanTemplate");
  const match = markerIndex >= 0 ? source.slice(markerIndex).match(/version:\s*"([^"]+)"/u) : null;
  if (!match) {
    throw new Error(`Built-in default template version is missing from ${sourcePath}.`);
  }
  return match[1];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  for (const arg of process.argv.slice(2)) {
    if (arg !== "--check") throw new Error("Unknown template-version option: " + arg);
  }
  if (process.argv.includes("--check")) {
    const result = await assertTemplateVersionsAligned();
    console.log(`Template versions match driver ${result.version}: ${result.templateCount} TEMPLATE.json files plus the built-in default.`);
  } else {
    const result = await updateTemplateVersions();
    if (result.updated.length === 0) {
      console.log(`Template versions already match driver ${result.version}.`);
    } else {
      console.log(`Updated template versions to driver ${result.version}:`);
      for (const relativePath of result.updated) console.log(`- ${relativePath}`);
    }
  }
}
