#!/usr/bin/env node

import path from "node:path";
import { attachToProject } from "./attach.js";
import { AttachError } from "./types.js";

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "attach") {
    runAttach(args.slice(1));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function runAttach(args: string[]): void {
  const parsed = parseAttachArgs(args);

  try {
    const result = attachToProject({
      cwd: process.cwd(),
      taskName: parsed.taskName,
    });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof AttachError) {
      process.stderr.write(
        `${JSON.stringify(
          {
            error: {
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            },
          },
          null,
          2,
        )}\n`,
      );
      process.exitCode = 1;
      return;
    }

    process.stderr.write(
      `${JSON.stringify(
        {
          error: {
            code: "UNEXPECTED_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  }
}

function parseAttachArgs(args: string[]): {
  taskName?: string;
} {
  const parsed = {} as { taskName?: string };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--task":
        parsed.taskName = requireValue(args, ++index, "--task");
        break;
      case "--json":
        break;
      default:
        throw new AttachError("PROJECT_CONFIG_INVALID", `Unknown argument "${arg}".`, { argument: arg });
    }
  }

  return parsed;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value) {
    throw new AttachError("PROJECT_CONFIG_INVALID", `Missing value for ${flag}.`, { flag });
  }
  return value;
}

function printUsage(): void {
  const scriptName = path.basename(process.argv[1] ?? "claw");
  process.stderr.write(
    [
      `Usage: ${scriptName} attach [options]`,
      "",
      "Options:",
      "  --task <name>",
      "  --json",
    ].join("\n"),
  );
  process.stderr.write("\n");
}

main();
