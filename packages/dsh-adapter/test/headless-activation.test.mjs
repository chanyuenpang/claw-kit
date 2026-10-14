import test from "node:test";
import assert from "node:assert/strict";
import { apply, inject } from "../lib/index.js";

test("headless activation registers claw_run without the web-only connection service", () => {
  assert.equal(inject.includes("connection"), false);
  for (const service of ["subprocess", "tools", "systemPrompt", "skills", "goals"]) {
    assert.equal(inject.includes(service), true, service);
  }

  const registered = [];
  const subscriptions = [];
  const handlers = [];
  const ctx = {
    get(name) {
      if (name === "subprocess") return { spawn() {} };
      if (name === "tools") return { register(definition) { registered.push(definition.name); } };
      if (name === "systemPrompt") return { section() {}, context() {} };
      return undefined;
    },
    on() { return () => {}; },
    inject(deps, callback) { subscriptions.push({ deps, callback }); },
  };

  apply(ctx);

  assert.deepEqual(registered, ["claw_run"]);
  assert.equal(subscriptions.length, 1);
  assert.deepEqual(subscriptions[0].deps, ["connection"]);
  assert.equal(handlers.length, 0);

  subscriptions[0].callback({
    get(name) {
      if (name !== "connection") return undefined;
      return { rpc: { handle(channel) { handlers.push(channel); } } };
    },
  });
  assert.deepEqual(handlers.sort(), ["/claw-project-config", "/claw-session-lifecycle"]);
});
