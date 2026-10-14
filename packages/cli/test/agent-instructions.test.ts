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
    fs.writeFileSync(file, start + "\ncustom\n" + end);
    init([...args, "--force"], root, env);
    assert.equal(fs.readFileSync(file, "utf8"), start + "\ncustom\n" + end);
  }
});
