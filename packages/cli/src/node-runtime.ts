// Runs before any module that imports node:sqlite. Keep this file import-free.

export const MINIMUM_NODE_VERSION = "22.13";

type NodeVersion = {
  major: number;
  minor: number;
  patch: number;
};

const MINIMUM: NodeVersion = { major: 22, minor: 13, patch: 0 };

export function parseNodeVersion(version: string): NodeVersion | null {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
  };
}

export function isSupportedNodeVersion(version: string): boolean {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  if (parsed.major !== MINIMUM.major) return parsed.major > MINIMUM.major;
  if (parsed.minor !== MINIMUM.minor) return parsed.minor > MINIMUM.minor;
  return parsed.patch >= MINIMUM.patch;
}

export function unsupportedNodeMessage(currentVersion: string): string {
  return `claw needs Node.js ${MINIMUM_NODE_VERSION} or newer.\nCurrent version: ${currentVersion}\n`;
}

export function exitIfUnsupportedNode(
  version: string = process.version,
  stderr: { write(chunk: string): void } = process.stderr,
  exit: (code: number) => void = process.exit,
): void {
  if (isSupportedNodeVersion(version)) return;
  stderr.write(unsupportedNodeMessage(version));
  exit(1);
}
