import { fork } from "node:child_process";
import { once } from "node:events";
import type { TestContext } from "node:test";

export async function mutexWorker(t: TestContext, mode: "file" | "queue" | "increment", resource: string) {
  const child = fork(new URL("./fixtures/mutex-worker.js", import.meta.url), [mode, resource], {
    execArgv: [], stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await stopped;
  };
  t.after(stop);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Mutex worker did not become ready")), 10000);
    const ready = (message: unknown) => {
      if (message === "held" || message === "ready") { cleanup(); resolve(); }
    };
    const failed = (error: unknown) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timer); child.off("message", ready); child.off("error", failed); child.off("exit", exited);
    };
    const exited = () => failed(new Error("Mutex worker exited before acquisition"));
    child.on("message", ready); child.once("error", failed); child.once("exit", exited);
  });
  return {
    child, stop, stopped,
    release: async () => { const exited = once(child, "exit"); child.send("release"); await exited; },
  };
}
