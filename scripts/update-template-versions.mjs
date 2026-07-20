import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoots = [
  path.join("shared", "skills"),
  path.join("packages", "codex-adapter", "skills"),
  path.join("packages", "opencode-adapter", "skills"),
];
const defaultTemplateSource = path.join("packages", "core", "src", "templates", "plans", "default.ts");

export async function collectReleaseTemplatePaths(repoRoot = defaultRepoRoot) {
  const matches = [];
  for (const relativeRoot of templateRoots) {
    await collectNamedFiles(path.join(repoRoot, relativeRoot), "TEMPLATE.json", matches);
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

export async function inspectTemplateVersions({ repoRoot = defaultRepoRoot, expectedVersion } = {}) {
  const releaseVersion = expectedVersion ?? await readReleaseVersion(repoRoot);
  const issues = [];
  const templatePaths = await collectReleaseTemplatePaths(repoRoot);
  for (const templatePath of templatePaths) {
    const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
    if (template.version !== releaseVersion) {
      issues.push({
        path: path.relative(repoRoot, templatePath),
        actualVersion: typeof template.version === "string" ? template.version : null,
        expectedVersion: releaseVersion,
      });
    }
  }

  const defaultPath = path.join(repoRoot, defaultTemplateSource);
  const defaultSource = await fs.readFile(defaultPath, "utf8");
  const defaultVersion = readDefaultTemplateVersion(defaultSource, defaultPath);
  if (defaultVersion !== releaseVersion) {
    issues.push({
      path: defaultTemplateSource,
      actualVersion: defaultVersion,
      expectedVersion: releaseVersion,
    });
  }

  return { version: releaseVersion, templateCount: templatePaths.length, issues };
}

export async function assertTemplateVersionsAligned(options = {}) {
  const result = await inspectTemplateVersions(options);
  if (result.issues.length > 0) {
    const details = result.issues
      .map((issue) => `- ${issue.path}: ${issue.actualVersion ?? "missing"} (expected ${issue.expectedVersion})`)
      .join("\n");
    throw new Error(
      `Release template versions are out of date:\n${details}\nRun npm run sync:template-versions, then npm run sync:shared-skills, review the generated files, and rerun release verification.`,
    );
  }
  return result;
}

export async function updateTemplateVersions({ repoRoot = defaultRepoRoot, expectedVersion } = {}) {
  const releaseVersion = expectedVersion ?? await readReleaseVersion(repoRoot);
  const templatePaths = await collectReleaseTemplatePaths(repoRoot);
  const updated = [];
  for (const templatePath of templatePaths) {
    const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
    if (template.version === releaseVersion) continue;
    template.version = releaseVersion;
    await fs.writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
    updated.push(path.relative(repoRoot, templatePath));
  }

  const defaultPath = path.join(repoRoot, defaultTemplateSource);
  const defaultSource = await fs.readFile(defaultPath, "utf8");
  const defaultVersion = readDefaultTemplateVersion(defaultSource, defaultPath);
  if (defaultVersion !== releaseVersion) {
    const markerIndex = defaultSource.indexOf("export const defaultPlanTemplate");
    const before = defaultSource.slice(0, markerIndex);
    const templateSection = defaultSource.slice(markerIndex).replace(
      /version:\s*"[^"]+"/u,
      `version: "${releaseVersion}"`,
    );
    await fs.writeFile(defaultPath, `${before}${templateSection}`, "utf8");
    updated.push(defaultTemplateSource);
  }

  return { version: releaseVersion, templateCount: templatePaths.length, updated };
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
  if (process.argv.includes("--check")) {
    const result = await assertTemplateVersionsAligned();
    console.log(`Template versions match release ${result.version}: ${result.templateCount} TEMPLATE.json files plus the built-in default.`);
  } else {
    const result = await updateTemplateVersions();
    if (result.updated.length === 0) {
      console.log(`Template versions already match release ${result.version}.`);
    } else {
      console.log(`Updated template versions to ${result.version}:`);
      for (const relativePath of result.updated) console.log(`- ${relativePath}`);
    }
  }
}
