#!/usr/bin/env node

import { shouldLoadCliForInvocation } from "./knowledge-hook-preflight.js";

const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = ((warning: unknown, ...args: unknown[]) => {
  if (shouldSuppressSqliteExperimentalWarning(warning, args)) {
    return;
  }
  return originalEmitWarning(warning as never, ...(args as []));
}) as typeof process.emitWarning;

void main();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!await shouldLoadCliForInvocation(args, process.cwd(), process.env)) {
    return;
  }
  if (isSearchInvocation(args)) {
    const { runSearchEntry } = await import("./search-entry.js");
    await runSearchEntry(args.slice(1));
    return;
  }
  await import("./cli.js");
}

function isSearchInvocation(args: string[]): boolean {
  return args[0] === "search"
    && args[1] !== "help"
    && !args.includes("--help")
    && !args.includes("-h");
}

function shouldSuppressSqliteExperimentalWarning(warning: unknown, args: unknown[]): boolean {
  const message =
    typeof warning === "string"
      ? warning
      : warning instanceof Error
        ? warning.message
        : String(warning);
  const type =
    typeof args[0] === "string"
      ? args[0]
      : args[0] && typeof args[0] === "object" && "type" in args[0]
        ? String((args[0] as { type?: unknown }).type ?? "")
        : warning instanceof Error
          ? warning.name
          : "";

  return type === "ExperimentalWarning" && message.includes("SQLite is an experimental feature");
}
