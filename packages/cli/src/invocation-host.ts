import { ClawError } from "@veewo/claw-core";

export const SUPPORTED_CLAW_HOSTS = ["codex", "opencode"] as const;

export type ClawHost = (typeof SUPPORTED_CLAW_HOSTS)[number];

const SUPPORTED_HOST_SET = new Set<string>(SUPPORTED_CLAW_HOSTS);

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
  return env;
}
