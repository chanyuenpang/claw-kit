import { ClawError } from "@veewo/claw-core";

export const SUPPORTED_CLAW_HOSTS = ["codex", "opencode", "cindy", "dsh"] as const;

export type ClawHost = (typeof SUPPORTED_CLAW_HOSTS)[number];

const SUPPORTED_HOST_SET = new Set<string>(SUPPORTED_CLAW_HOSTS);

/**
 * Hosts whose CLI output carries the versioned `hostActions` protocol
 * (`schemaVersion: 1`, tools `update_plan` / `create_goal` / `update_goal`).
 * The Codex adapter consumes them through its fixed code-mode driver; the DSH
 * adapter consumes them inside the `claw_run` tool's execute (same schema, no
 * envelope needed).
 */
export function isHostActionsHost(host: ClawHost | undefined): boolean {
  return host === "codex" || host === "dsh";
}

/**
 * Hosts whose adapter can dispatch `knowledgeWriter.executionPolicy ===
 * "subagent"` closeout through a native subagent (Codex SDK, Cindy Orca
 * Worker, DSH `subagent`/`subagent_fork`). Other hosts reject that policy at
 * configuration time instead of silently degrading.
 */
export function isSubagentPolicyHost(host: ClawHost | undefined): boolean {
  return host === "codex" || host === "cindy" || host === "dsh";
}

function parseHost(value: string | undefined, source: "--host" | "CLAW_HOST"): ClawHost | undefined {
  const host = value?.trim();
  if (!host) {
    return undefined;
  }
  if (!SUPPORTED_HOST_SET.has(host)) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `Unsupported ${source} value "${host}". Expected one of: ${SUPPORTED_CLAW_HOSTS.join(", ")}.`,
    );
  }
  return host as ClawHost;
}

/** Resolve host identity once for the current CLI invocation. */
export function resolveInvocationHost(
  explicitHost: string | undefined,
  environmentHost: string | undefined,
): ClawHost | undefined {
  const explicit = parseHost(explicitHost, "--host");
  const environment = parseHost(environmentHost, "CLAW_HOST");
  if (explicit && environment && explicit !== environment) {
    throw new ClawError(
      "PROJECT_CONFIG_INVALID",
      `Conflicting host sources: --host is "${explicit}" but CLAW_HOST is "${environment}".`,
    );
  }
  return explicit ?? environment;
}

/** Copy an environment without leaking the foreground invocation host to a worker. */
export function withoutInvocationHost(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...source };
  delete env.CLAW_HOST;
  delete env.CLAW_SESSION_ID;
  return env;
}
