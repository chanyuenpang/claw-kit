import test from "node:test";
import assert from "node:assert/strict";
import { inject } from "../lib/index.js";
import { mountConnectionRpcChannels } from "../lib/connection-rpc.js";

test("connection is not a hard inject dependency", () => {
  assert.equal(inject.includes("connection"), false);
  for (const name of ["subprocess", "tools", "systemPrompt", "skills", "goals"]) {
    assert.equal(inject.includes(name), true);
  }
});

test("settings channels mount through the root connection when the caller fiber cannot see webServer", () => {
  const mounted = [];
  const effects = [];
  const rootConnection = {
    get rpc() {
      return {
        handle(channel) {
          mounted.push(channel);
          return () => {
            const index = mounted.indexOf(channel);
            if (index >= 0) mounted.splice(index, 1);
          };
        },
      };
    },
  };
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ["connection"]);
      callback({
        root: {
          get(name) {
            assert.equal(name, "connection");
            return rootConnection;
          },
        },
        effect(register) { effects.push(register); },
      });
    },
  };
  mountConnectionRpcChannels(ctx, [
    { channel: "/claw-session-lifecycle", handler: async () => ({ ok: true }) },
    { channel: "/claw-project-config", handler: async () => ({ ok: true }) },
  ]);
  assert.deepEqual(mounted, ["/claw-session-lifecycle", "/claw-project-config"]);
  assert.equal(effects.length, 1);
  effects[0]()();
  assert.deepEqual(mounted, []);
});

test("headless inject does not run the callback or warn when connection never arrives", () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const ctx = { inject() { /* connection service is absent */ } };
    mountConnectionRpcChannels(ctx, [
      { channel: "/claw-project-config", handler: async () => ({ ok: true }) },
    ]);
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = original;
  }
});
