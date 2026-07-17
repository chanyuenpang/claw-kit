import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CODEX_SDK_VERSION = "0.144.5";

export type CodexRuntimeCheck = {
  ok: boolean;
  sdkEntryPath?: string;
  detail?: string;
};

export function checkCodexRuntime(): CodexRuntimeCheck {
  if (process.env.CLAW_CODEX_RUNTIME_MOCK === "healthy") {
    return { ok: true, sdkEntryPath: "mock-codex-sdk" };
  }
  if (process.env.CLAW_CODEX_RUNTIME_MOCK === "missing") {
    return { ok: false, detail: "The versioned Codex SDK runtime is not installed." };
  }

  const sdkEntryPath = resolveCodexSdkEntryPath();
  if (isHealthyCodexRuntime(sdkEntryPath)) {
    return { ok: true, sdkEntryPath };
  }
  const platformPackage = resolvePlatformPackage();
  return {
    ok: false,
    detail: `Expected @openai/codex-sdk ${CODEX_SDK_VERSION} and ${platformPackage.name} under ${resolveCodexRuntimeRoot()}.`,
  };
}

export function resolveCodexSdkEntryPath(): string {
  return path.join(
    resolveCodexRuntimeRoot(),
    "node_modules",
    "@openai",
    "codex-sdk",
    "dist",
    "index.js",
  );
}

function resolveCodexRuntimeRoot(): string {
  return path.join(os.homedir(), ".claw-kit", "codex-runtime", CODEX_SDK_VERSION);
}

function isHealthyCodexRuntime(sdkEntryPath: string): boolean {
  if (!fs.existsSync(sdkEntryPath)) {
    return false;
  }
  const platformPackage = resolvePlatformPackage();
  const packageJsonPath = path.join(
    resolveCodexRuntimeRoot(),
    "node_modules",
    "@openai",
    `codex-${platformPackage.target}`,
    "package.json",
  );
  return fs.existsSync(packageJsonPath);
}

function resolvePlatformPackage(): { name: string; target: string } {
  const architecture = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : null;
  const platform = process.platform === "win32"
    ? "win32"
    : process.platform === "darwin"
      ? "darwin"
      : process.platform === "linux"
        ? "linux"
        : null;
  if (!architecture || !platform) {
    throw new Error(`Unsupported Codex SDK runtime platform: ${process.platform} ${process.arch}`);
  }
  const target = `${platform}-${architecture}`;
  return { name: `@openai/codex-${target}`, target };
}
