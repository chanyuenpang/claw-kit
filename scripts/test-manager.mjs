import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmStep = (...args) => ({ kind: "npm", args });
const nodeStep = (...args) => ({ kind: "node", args });
const build = (workspace) => npmStep("run", "build", "-w", workspace);
const workspaceTest = (workspace) => npmStep("run", "test", "-w", workspace);
const coreBuild = build("@veewo/claw-core");
const clientBuild = build("@veewo/claw-client");
const cliBuild = build("@veewo/claw");
const cliTestCompile = nodeStep("./node_modules/typescript/bin/tsc", "-p", "./packages/cli/tsconfig.test.json");

function sessionTest(file, extraSteps = []) {
  return [
    coreBuild,
    clientBuild,
    cliBuild,
    cliTestCompile,
    ...extraSteps,
    nodeStep("--test", `./packages/cli/dist-test/${file}.test.js`),
  ];
}

export const CLI_DOMAIN_TEST_FILES = {
  "cli-workflow": "cli-workflow.test",
  "cli-session-scope": "cli-session-scope.test",
  "cli-search": "cli-search.test",
  "cli-closeout": "cli-closeout.test",
  "cli-host-actions": "cli-host-actions.test",
  "cli-project": "cli-project.test",
  "cli-surface": "cli-surface.test",
};

function cliDomainTest(domain) {
  const testFile = CLI_DOMAIN_TEST_FILES[domain];
  if (!testFile) throw new Error(`Unknown CLI test domain: ${domain}`);
  return [
    coreBuild,
    clientBuild,
    cliBuild,
    cliTestCompile,
    nodeStep("--test", `./packages/cli/dist-test/${testFile}.js`),
  ];
}

const CLI_DOMAINS = Object.keys(CLI_DOMAIN_TEST_FILES);

export const TEST_DOMAINS = {
  core: {
    description: "Core workflow, planning, knowledge, configuration, and search behavior",
    steps: [coreBuild, workspaceTest("@veewo/claw-core")],
  },
  embeddings: {
    description: "Local embedding, tokenizer, transformer, and embedding-daemon behavior",
    steps: [coreBuild, nodeStep(
      "--import", "./packages/core/dist/test/setup-env.js", "--test",
      "./packages/core/dist/test/embedding-daemon.test.js",
      "./packages/core/dist/test/embedding-local.test.js",
      "./packages/core/dist/test/embedding-token-chunker.test.js",
      "./packages/core/dist/test/embedding-transformers.test.js",
    )],
  },
  "session-state": {
    description: "Composite session identity, retained records, TTL, and cleanup",
    steps: sessionTest("session-state"),
  },
  "session-focus": {
    description: "Current-plan ownership, focus journals, subplans, and recovery",
    steps: sessionTest("session-focus", [nodeStep(
      "--import", "./packages/core/dist/test/setup-env.js",
      "--test", "--test-name-pattern", "(plan status classification|focus coordinator|focus recovery)",
      "./packages/core/dist/test/core.test.js",
    )]),
  },
  "session-commands": {
    description: "Typed command service, implicit current-plan targeting, and command envelopes",
    steps: sessionTest("session-commands"),
  },
  "session-protocol": {
    description: "Authenticated client/daemon protocol, serialization, reconnect, and lifecycle",
    steps: sessionTest("session-daemon", [workspaceTest("@veewo/claw-client")]),
  },
  "session-terminal": {
    description: "Persistent terminal open/close, line parsing, and current-plan restoration",
    steps: sessionTest("session-terminal"),
  },
  "session-package": {
    description: "Explicit packed-install session smoke; not selected by ordinary source changes",
    steps: [npmStep("run", "build"), npmStep("run", "test:session-pack")],
  },
  "session-performance": {
    description: "Explicit session performance benchmark; not selected by ordinary source changes",
    steps: [npmStep("run", "build"), npmStep("run", "benchmark:session")],
  },
  "cli-workflow": {
    description: "Plan, task, subplan, template, and stateless workflow commands",
    steps: cliDomainTest("cli-workflow"),
  },
  "cli-session-scope": {
    description: "Stateless CLI compatibility for session-scoped workflow storage",
    steps: cliDomainTest("cli-session-scope"),
  },
  "cli-search": {
    description: "CLI search, index refresh, embedding reuse, and directory override",
    steps: cliDomainTest("cli-search"),
  },
  "cli-closeout": {
    description: "CLI hooks, completion refresh, knowledge finalization, and closeout",
    steps: cliDomainTest("cli-closeout"),
  },
  "cli-host-actions": {
    description: "Host identity, Codex/Cindy/OpenCode actions, Goal, and projection",
    steps: cliDomainTest("cli-host-actions"),
  },
  "cli-project": {
    description: "Project init/check/context, maintenance, configuration, and update reporting",
    steps: cliDomainTest("cli-project"),
  },
  "cli-surface": {
    description: "CLI help, version, usage, and argument surface",
    steps: cliDomainTest("cli-surface"),
  },
  codex: {
    description: "Codex hooks, subagent contract, and exported plugin bundle",
    steps: [coreBuild, cliBuild, nodeStep(
      "--test",
      "./packages/codex-adapter/hooks/code-mode-host-action-consumer.test.mjs",
      "./packages/codex-adapter/hooks/subagent-contract.test.mjs",
      "./scripts/codex-plugin-bundle.test.mjs",
    )],
  },
  opencode: {
    description: "OpenCode adapter build and bundle behavior",
    steps: [build("@claw-kit/opencode-adapter"), nodeStep("--test", "./scripts/opencode-plugin-bundle.test.mjs")],
  },
  openclaw: {
    description: "OpenClaw adapter type and build boundary",
    steps: [coreBuild, npmStep("run", "check", "-w", "@claw-kit/openclaw-adapter")],
  },
  "shared-skills": {
    description: "Shared skill materialization, template versions, and skill scaffolding",
    steps: [nodeStep(
      "--test",
      "./scripts/sync-shared-skills.test.mjs",
      "./scripts/update-template-versions.test.mjs",
      "./scripts/create-claw-skill-stub.test.mjs",
    )],
  },
  "docs-ui": {
    description: "Generated documentation pages and site behavior",
    steps: [nodeStep(
      "--test",
      "./scripts/config-guide.test.mjs",
      "./scripts/product-deck.test.mjs",
      "./scripts/site-language.test.mjs",
    )],
  },
  "test-management": {
    description: "Functional-area test selection and command planning",
    steps: [nodeStep("--test", "./scripts/test-manager.test.mjs")],
  },
};

const FULL_STEPS = [
  npmStep("run", "build"),
  workspaceTest("@veewo/claw-core"),
  workspaceTest("@veewo/claw-client"),
  workspaceTest("@veewo/claw"),
  nodeStep(
    "--test",
    "./packages/codex-adapter/hooks/code-mode-host-action-consumer.test.mjs",
    "./packages/codex-adapter/hooks/subagent-contract.test.mjs",
    "./scripts/codex-plugin-bundle.test.mjs",
    "./scripts/opencode-plugin-bundle.test.mjs",
    "./scripts/sync-shared-skills.test.mjs",
    "./scripts/update-template-versions.test.mjs",
    "./scripts/create-claw-skill-stub.test.mjs",
    "./scripts/config-guide.test.mjs",
    "./scripts/product-deck.test.mjs",
    "./scripts/site-language.test.mjs",
    "./scripts/test-manager.test.mjs",
  ),
];

const rules = [
  [["test-management"], /^scripts\/test-manager(?:\.test)?\.mjs$/],
  [["embeddings"], /^packages\/core\/(?:src|test)\/embedding-/],
  [["embeddings"], /^packages\/core\/src\/(?:search-daemon|search-daemon-protocol)\.ts$/],
  [["session-focus"], /^packages\/core\/src\/focus-transitions\.ts$/],
  [["session-state", "session-focus"], /^packages\/cli\/src\/session-registry-v2\.ts$/],
  [["session-state"], /^packages\/cli\/test\/session-state\.test\.ts$/],
  [["session-focus"], /^packages\/cli\/test\/session-focus\.test\.ts$/],
  [["session-commands"], /^packages\/cli\/(?:src\/command-service|test\/session-commands\.test)\.ts$/],
  [["session-commands", "session-protocol"], /^packages\/client\/src\/protocol\.ts$/],
  [["session-protocol"], /^packages\/client\/(?:src\/(?:index|runtime)|test\/client\.test)\.ts$/],
  [["session-protocol"], /^packages\/cli\/(?:src\/session-daemon(?:-entry)?|test\/session-daemon\.test)\.ts$/],
  [["session-terminal"], /^packages\/cli\/test\/session-terminal\.test\.ts$/],
  [["cli-workflow"], /^packages\/cli\/test\/cli-workflow\.test\.ts$/],
  [["cli-session-scope"], /^packages\/cli\/test\/cli-session-scope\.test\.ts$/],
  [["cli-search"], /^packages\/cli\/src\/search-entry\.ts$/],
  [["cli-search"], /^packages\/cli\/test\/cli-search\.test\.ts$/],
  [["cli-closeout"], /^packages\/cli\/src\/knowledge-hook-preflight\.ts$/],
  [["cli-closeout"], /^packages\/cli\/test\/cli-closeout\.test\.ts$/],
  [["cli-host-actions", "cli-closeout"], /^packages\/cli\/src\/opencode-runner\.ts$/],
  [["cli-host-actions"], /^packages\/cli\/src\/(?:codex-|invocation-host)/],
  [["cli-host-actions"], /^packages\/cli\/test\/cli-host-actions\.test\.ts$/],
  [["cli-project"], /^packages\/cli\/test\/cli-project\.test\.ts$/],
  [["cli-surface"], /^packages\/cli\/test\/cli-surface\.test\.ts$/],
  [CLI_DOMAINS, /^packages\/cli\/(?:src\/cli|test\/cli-test-support)\.ts$/],
  [["cli-workflow", "cli-surface"], /^packages\/cli\/src\/bin\.ts$/],
  [["codex"], /^packages\/codex-adapter\//],
  [["opencode"], /^packages\/opencode-adapter\//],
  [["openclaw"], /^packages\/openclaw-adapter\//],
  [["shared-skills"], /^shared\/skills\//],
  [["shared-skills"], /^scripts\/(?:sync-shared-skills|update-template-versions|create-claw-skill-stub)(?:\.test)?\.mjs$/],
  [["docs-ui"], /^docs\/assets\//],
  [["docs-ui"], /^scripts\/(?:config-guide|product-deck|site-language)(?:\.test)?\.mjs$/],
  [["core"], /^packages\/core\//],
];

const noTests = [
  /^\.claw\//,
  /^(?:README|CHANGELOG|DISTRIBUTION|AGENTS)\.md$/,
  /(?:^|\/)README\.md$/,
  /^docs\/(?!assets\/)/,
  /^(?:release-closeout|release-workflow-plan)\./,
];
const fullSuite = [/^package(?:-lock)?\.json$/, /^tsconfig\.base\.json$/, /^scripts\/publish-release\.mjs$/];

function normalize(file) {
  return file.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

export function selectDomains(files) {
  const selected = new Set();
  const unmatched = [];
  let requiresFull = false;
  for (const input of files) {
    const file = normalize(input);
    if (!file || /(?:^|\/)node_modules\//.test(file) || /(?:^|\/)dist(?:-test)?\//.test(file)) continue;
    if (fullSuite.some((pattern) => pattern.test(file))) {
      requiresFull = true;
      continue;
    }
    if (noTests.some((pattern) => pattern.test(file))) continue;
    const matched = rules.find(([, pattern]) => pattern.test(file));
    if (!matched) {
      unmatched.push(file);
      requiresFull = true;
    } else {
      for (const domain of matched[0]) selected.add(domain);
    }
  }
  return { domains: requiresFull ? ["full"] : [...selected].sort(), unmatched };
}

function gitLines(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  return result.stdout.split(/\r?\n/).map(normalize).filter(Boolean);
}

export function collectChangedPaths({ cwd = repoRoot, base } = {}) {
  const files = new Set();
  if (base) {
    for (const file of gitLines(["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`], cwd)) files.add(file);
  }
  for (const file of gitLines(["diff", "--name-only", "--diff-filter=ACMRD", "HEAD"], cwd)) files.add(file);
  for (const file of gitLines(["ls-files", "--others", "--exclude-standard"], cwd)) files.add(file);
  return [...files].sort();
}

export function createExecutionPlan(domains) {
  if (domains.includes("full")) return [...FULL_STEPS];
  const steps = [];
  const seen = new Set();
  for (const domain of domains) {
    const definition = TEST_DOMAINS[domain];
    if (!definition) throw new Error(`Unknown test domain: ${domain}`);
    for (const step of definition.steps) {
      const key = `${step.kind}\0${step.args.join("\0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        steps.push(step);
      }
    }
  }
  return steps;
}

function parseArgs(argv) {
  const args = [...argv];
  const mode = args[0] && !args[0].startsWith("-") ? args.shift() : "changed";
  let base;
  let dryRun = false;
  const positional = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--base") base = args.shift();
    else if (arg.startsWith("--base=")) base = arg.slice(7);
    else positional.push(arg);
  }
  return { mode, base, dryRun, positional };
}

function display(step) {
  return [step.kind === "npm" ? "npm" : "node", ...step.args]
    .map((value) => /\s/.test(value) ? JSON.stringify(value) : value).join(" ");
}

function execute(step) {
  let command;
  let args;
  if (step.kind === "node") {
    command = process.execPath;
    args = step.args;
  } else if (process.env.npm_execpath) {
    command = process.execPath;
    args = [process.env.npm_execpath, ...step.args];
  } else {
    command = process.platform === "win32" ? "npm.cmd" : "npm";
    args = step.args;
  }
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const { mode, base, dryRun, positional } = parseArgs(process.argv.slice(2));
  if (mode === "list") {
    for (const [name, definition] of Object.entries(TEST_DOMAINS)) console.log(`${name.padEnd(16)} ${definition.description}`);
    console.log(`${"full".padEnd(16)} Complete broad/release-level suite`);
    return;
  }
  let files = [];
  let domains;
  if (mode === "full") domains = ["full"];
  else if (mode === "domain") {
    if (!positional.length) throw new Error("test:domain requires a domain name. Run npm run test:list to inspect them.");
    domains = positional;
  } else if (mode === "changed") {
    files = collectChangedPaths({ base: base ?? process.env.CLAW_TEST_BASE });
    if (!files.length) {
      domains = ["full"];
      console.log("No changed files detected; using the full suite.");
    } else {
      const selection = selectDomains(files);
      domains = selection.domains;
      if (selection.unmatched.length) console.log(`Unclassified paths require the full suite: ${selection.unmatched.join(", ")}`);
    }
  } else throw new Error(`Unknown test mode: ${mode}`);

  const steps = createExecutionPlan(domains);
  console.log(`Test domains: ${domains.length ? domains.join(", ") : "none (documentation-only change)"}`);
  if (files.length) console.log(`Changed files considered: ${files.length}`);
  for (const step of steps) console.log(`> ${display(step)}`);
  if (!dryRun) for (const step of steps) execute(step);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
