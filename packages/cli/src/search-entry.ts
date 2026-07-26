import {
  buildMemoryIndex,
  ClawError,
  requestPersistentSearch,
  searchMemoryAsync,
} from "@veewo/claw-core/search";

export async function runSearchEntry(args: string[]): Promise<void> {
  try {
    const searchArgs = [...args];
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
    const input = {
      cwd: process.cwd(),
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
    assertNoRemainingArgs(args, "search");
    return query;
  }
  const unknownFlags = args.filter((arg) => arg.startsWith("--"));
  if (unknownFlags.length > 0) {
    throw new ClawError("PROJECT_CONFIG_INVALID", `Unknown arguments for search: ${args.join(" ")}`, {
      command: "search",
      remainingArgs: args,
    });
  }
  if (args.length === 0) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      "Missing search query. Use: `claw search --query \"<topic>\"`.",
      { flag: "--query", recommendedCommand: "claw search --query \"<topic>\"" },
    );
  }
  return args.join(" ").trim();
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
