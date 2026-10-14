import { test, assert, fs, path, createFixture, runClaw } from "./cli-test-support.js";

const start = "<!-- claw-kit:bootstrap:start -->";
const end = "<!-- claw-kit:bootstrap:end -->";
const hostless = { CLAW_HOST: "" };
function init(args: string[], root: string, env: NodeJS.ProcessEnv) {
  return runClaw(args, root, env).agentInstructions as { status: string; warning?: string };
}

test("hostless init creates and idempotently refreshes only the bootstrap block", () => {
  const root = createFixture("init-bootstrap");
  const file = path.join(root, "AGENTS.md");
  const first = init(["init"], root, hostless);
  assert.equal(first.status, "created");
  const block = fs.readFileSync(file, "utf8");
  assert.ok(block.includes("using-claw-kit"));
  assert.ok(!block.includes("SKILL.md"));
  assert.equal(init(["init", "--force"], root, hostless).status, "unchanged");
  assert.equal(fs.readFileSync(file, "utf8"), block);
  const prefix = "\uFEFF# User rules\r\n\r\n";
  const suffix = "\r\n\r\nUser footer\r\n";
  fs.writeFileSync(file, prefix + start + "\r\nold instructions\r\n" + end + suffix);
  assert.equal(init(["init", "--force"], root, hostless).status, "updated");
  assert.equal(fs.readFileSync(file, "utf8"), prefix + block.trimEnd().replace(/\n/g, "\r\n") + suffix);
});

test("hostless init appends without replacing user rules and skips ambiguous markers", () => {
  const root = createFixture("init-bootstrap-preserve");
  const file = path.join(root, "AGENTS.md");
  fs.writeFileSync(file, "# User rules");
  init(["init"], root, hostless);
  assert.ok(fs.readFileSync(file, "utf8").startsWith("# User rules\n\n" + start));
  for (const content of [start + "\nunfinished", end, start + end + start + end]) {
    fs.writeFileSync(file, content);
    const result = init(["init", "--force"], root, hostless);
    assert.equal(result.status, "skipped");
    assert.ok(result.warning);
    assert.equal(fs.readFileSync(file, "utf8"), content);
  }
});

test("opt-out and native init do not write agent instructions", () => {
  for (const args of [["init", "--skip-agent-instructions"], ["init", "--host", "dsh"]]) {
    const root = createFixture("init-bootstrap-skip");
    const file = path.join(root, "AGENTS.md");
    const env = args.includes("--host") ? { CLAW_HOST: "dsh" } : hostless;
    assert.equal(init(args, root, env).status, "skipped");
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(path.join(root, "CLAUDE.md")), false);
    fs.writeFileSync(file, start + "\ncustom\n" + end);
    init([...args, "--force"], root, env);
    assert.equal(fs.readFileSync(file, "utf8"), start + "\ncustom\n" + end);
  }
});

test("init manages both files independently and reuses lowercase filenames", () => {
  const root = createFixture("init-dual-bootstrap");
  const claude = path.join(root, "claude.md");
  fs.writeFileSync(claude, "# Claude rules\r\n");
  const result = runClaw(["init"], root, hostless);
  const status = result.claudeInstructions as { status: string; path: string };
  assert.equal(status.status, "updated");
  assert.equal(status.path, claude);
  assert.deepEqual(fs.readdirSync(root).filter(name => name.toLowerCase() === "claude.md"), ["claude.md"]);
  const text = fs.readFileSync(claude, "utf8");
  assert.ok(text.startsWith("# Claude rules\r\n\r\n" + start));
  assert.ok(text.includes("using-claw-kit"));
  assert.equal((runClaw(["init", "--force"], root, hostless).claudeInstructions as { status: string }).status, "unchanged");
  fs.writeFileSync(path.join(root, "AGENTS.md"), start);
  fs.writeFileSync(claude, start + "\r\nold\r\n" + end);
  const refreshed = runClaw(["init", "--force"], root, hostless);
  assert.equal((refreshed.agentInstructions as { status: string }).status, "skipped");
  assert.equal((refreshed.claudeInstructions as { status: string }).status, "updated");
});

test("new init creates identical blocks and opt-out protects both files", () => {
  const root = createFixture("init-dual-identical");
  runClaw(["init"], root, hostless);
  const agents = path.join(root, "AGENTS.md");
  const claude = path.join(root, "CLAUDE.md");
  assert.equal(fs.readFileSync(agents, "utf8"), fs.readFileSync(claude, "utf8"));
  for (const args of [["--skip-agent-instructions"], ["--host", "dsh"]]) {
    fs.writeFileSync(agents, "custom agents");
    fs.writeFileSync(claude, "custom claude");
    runClaw(["init", "--force", ...args], root, args.includes("--host") ? { CLAW_HOST: "dsh" } : hostless);
    assert.equal(fs.readFileSync(agents, "utf8"), "custom agents");
    assert.equal(fs.readFileSync(claude, "utf8"), "custom claude");
  }
});
