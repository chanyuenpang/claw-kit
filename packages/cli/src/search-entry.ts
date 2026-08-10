import path from "node:path";
import {
  buildMemoryIndex,
  ClawError,
  requestPersistentSearch,
  searchMemoryAsync,
} from "@veewo/claw-core/search";

const SEARCH_USAGE = "claw search [<query>] [--query <text>] [--dir <dir>] [--limit <n>] [--json]";
const SEARCH_SUPPORTED_OPTIONS = ["--query <text>", "--dir <dir>", "--limit <n>", "--json"];
const SEARCH_RECOMMENDED_COMMAND = "claw search --query \"<topic>\" --limit 10";

export async function runSearchEntry(args: string[]): Promise<void> {
  try {
    const searchArgs = [...args];
    readBooleanFlag(searchArgs, "--json");
    const subcommand = searchArgs[0];
    if (subcommand === "index") {
      searchArgs.shift();
      const refresh = readBooleanFlag(searchArgs, "--refresh");
      if (!refresh) {
        throw new ClawError("PROJECT_CONFIG_INVALID", "claw search index requires --refresh.");
      }
      assertNoRemainingArgs(searchArgs, "search index");
      printJson({
        ok: true,
        command: "search.index.refresh",
        ...buildMemoryIndex({ cwd: process.cwd(), scope: "project" }),
      });
      return;
    }
    if (searchArgs.includes("--scope") || searchArgs.includes("--task")) {
      throw new ClawError(
        "PROJECT_CONFIG_INVALID",
        "claw search is project-scoped only. Put task-specific materials in plan.references instead of using task-local search.",
      );
    }
    const dir = readOptionalFlag(searchArgs, "--dir");
    const input = {
      cwd: dir ? path.resolve(process.cwd(), dir) : process.cwd(),
      limit: readOptionalNumber(searchArgs, "--limit"),
      query: readRequiredSearchQuery(searchArgs),
      scope: "project" as const,
    };
    const result = await requestPersistentSearch(input) ?? await searchMemoryAsync(input);
    printJson({
      ok: true,
      command: "search",
      ...result,
    });
  } catch (error) {
    handleError(error);
  }
}

function readRequiredSearchQuery(args: string[]): string {
  const query = readOptionalFlag(args, "--query");
  if (query) {
    assertNoRemainingSearchArgs(args);
    return query;
  }
  const unknownFlags = args.filter((arg) => arg.startsWith("--"));
  if (unknownFlags.length > 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown arguments for search: ${args.join(" ")}`, {
      ...searchHelpDetails(),
      remainingArgs: args,
      unknownOptions: unknownFlags,
    });
  }
  if (args.length === 0) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "Missing search query. Use: `claw search --query \"<topic>\"`.",
      {
        ...searchHelpDetails(),
        flag: "--query",
        recommendedCommand: "claw search --query \"<topic>\"",
      },
    );
  }
  return args.join(" ").trim();
}

function assertNoRemainingSearchArgs(args: string[]): void {
  if (args.length === 0) {
    return;
  }
  throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown arguments for search: ${args.join(" ")}`, {
    ...searchHelpDetails(),
    remainingArgs: args,
    unknownOptions: args.filter((arg) => arg.startsWith("--")),
  });
}

function searchHelpDetails(): Record<string, unknown> {
  return {
    command: "search",
    usage: SEARCH_USAGE,
    supportedOptions: SEARCH_SUPPORTED_OPTIONS,
    recommendedCommand: SEARCH_RECOMMENDED_COMMAND,
    helpCommand: "claw search --help",
  };
}

function readOptionalFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Missing required flag ${flag}.`, { flag });
  }
  args.splice(index, 2);
  return value;
}

function readOptionalNumber(args: string[], flag: string): number | undefined {
  const raw = readOptionalFlag(args, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Expected numeric value for ${flag}.`, { flag, value: raw });
  }
  return value;
}

function readBooleanFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function assertNoRemainingArgs(args: string[], command: string): void {
  if (args.length > 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown arguments for ${command}: ${args.join(" ")}`, {
      command,
      remainingArgs: args,
    });
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function handleError(error: unknown): void {
  if (error instanceof ClawError) {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    }, null, 2)}\n`);
  } else {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: "UNEXPECTED_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    }, null, 2)}\n`);
  }
  process.exitCode = 1;
}
