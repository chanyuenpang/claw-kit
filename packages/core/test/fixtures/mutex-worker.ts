import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { withFileLock, withSerializedQueue } from "../../src/io.js";

const [mode, resource] = process.argv.slice(2) as [string, string];
if (mode === "file") {
  withFileLock(resource, () => {
    process.send?.("held");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  });
} else if (mode === "queue") {
  await withSerializedQueue(resource, async () => {
    process.send?.("held");
    await new Promise<void>(resolve => process.once("message", () => resolve()));
  });
  process.disconnect();
} else if (mode === "increment") {
  process.send?.("ready");
  await new Promise<void>(resolve => process.once("message", () => resolve()));
  for (let index = 0; index < 10; index++) {
    await withSerializedQueue(resource, async () => {
      const value = Number(fs.readFileSync(resource + ".count", "utf8"));
      await delay(2);
      fs.writeFileSync(resource + ".count", String(value + 1));
    }, { pollMs: 10, timeoutMs: 5000 });
  }
  process.disconnect();
}
