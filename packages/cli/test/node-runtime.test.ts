import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  exitIfUnsupportedNode,
  isSupportedNodeVersion,
  unsupportedNodeMessage,
} from "../dist/node-runtime.js";

const binPath = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

test("accepts Node 22.13 and newer, including later majors", () => {
  for (const version of ["v22.13.0", "22.13.1", "v22.14.0", "v23.0.0", "v24.11.0", "22.13"]) {
    assert.equal(isSupportedNodeVersion(version), true, version);
  }
});

test("rejects Node older than 22.13, including 22.5 through 22.12", () => {
  for (const version of ["v22.12.0", "v22.12.99", "v22.5.0", "v22.4.1", "v22.0.0", "v21.7.3", "v20.18.1", "v18.20.0"]) {
    assert.equal(isSupportedNodeVersion(version), false, version);
  }
  assert.equal(isSupportedNodeVersion(""), false);
  assert.equal(isSupportedNodeVersion("not-a-version"), false);
});

test("unsupported Node message names the requirement and the current version", () => {
  const message = unsupportedNodeMessage("v22.5.0");
  assert.match(message, /claw needs Node\.js 22\.13 or newer/);
  assert.match(message, /Current version: v22\.5\.0/);
});

test("exitIfUnsupportedNode writes the message and exits only when the version is too old", () => {
  let exitCode: number | undefined;
  let written = "";
  exitIfUnsupportedNode("v22.4.1", { write(chunk) { written += chunk; } }, (code) => { exitCode = code; });
  assert.equal(exitCode, 1);
  assert.match(written, /Current version: v22\.4\.1/);

  exitCode = undefined;
  written = "";
  exitIfUnsupportedNode("v22.13.0", { write(chunk) { written += chunk; } }, (code) => { exitCode = code; });
  assert.equal(exitCode, undefined);
  assert.equal(written, "");
});

test("cli entry has no static node:sqlite import and checks the version first", () => {
  const bin = fs.readFileSync(binPath, "utf8");
  const guard = fs.readFileSync(fileURLToPath(new URL("../dist/node-runtime.js", import.meta.url)), "utf8");
  assert.doesNotMatch(bin, /node:sqlite/);
  assert.doesNotMatch(guard, /from ["']node:/);
  assert.match(bin, /exitIfUnsupportedNode\(\)/);
  const checkAt = bin.indexOf("exitIfUnsupportedNode()");
  const cliImportAt = bin.indexOf('import("./cli.js")');
  assert.ok(checkAt >= 0 && cliImportAt > checkAt);
});

test("cli entry prints the Node requirement and exits before loading sqlite when the version is too old", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claw-node-guard-"));
  const preload = path.join(directory, "old-node.cjs");
  fs.writeFileSync(preload, [
    "Object.defineProperty(process, 'version', {",
    "  configurable: true,",
    "  get() { return 'v22.12.0'; }",
    "});",
    "",
  ].join("\n"));

  const result = spawnSync(process.execPath, ["--require", preload, binPath, "--version"], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claw needs Node\.js 22\.13 or newer/);
  assert.match(result.stderr, /Current version: v22\.12\.0/);
  assert.equal(result.stdout, "");
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /node:sqlite|ExperimentalWarning/);
  fs.rmSync(directory, { recursive: true, force: true });
});
