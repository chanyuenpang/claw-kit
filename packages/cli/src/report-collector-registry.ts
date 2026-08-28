import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

export type ReportCollectorHost = "codex" | "dsh" | "cindy";

/** Adapter-local executable registration. Its output remains opaque to claw-kit. */
export type ReportCollectorDescriptor = {
  schemaVersion: 1;
  contractVersion: 1;
  host: ReportCollectorHost;
  collectorVersion: string;
  executable: string;
  args: string[];
};

type ReportCollectionRequest = {
  schemaVersion: 1;
  contractVersion: 1;
  captureId: string;
  host: ReportCollectorHost;
  sessionId: string;
  projectRoot: string;
  planPath: string;
  canonicalReportPath: string;
  stagingReportPath: string;
  startedAt?: string;
};

export type ReportCaptureReceipt = {
  contractVersion: 1;
  captureId: string;
  host: ReportCollectorHost;
  sessionId: string;
  payloadBytes: number;
  payloadSha256: string;
  collectorVersion: string;
  completedAt: string;
};

function collectorPath(projectRoot: string, host: ReportCollectorHost): string {
  return path.join(projectRoot, ".claw", "runtime", "report-collectors", `${host}.json`);
}

export function registerReportCollector(projectRoot: string, descriptor: ReportCollectorDescriptor): void {
  if (
    descriptor.schemaVersion !== 1
    || descriptor.contractVersion !== 1
    || !descriptor.collectorVersion.trim()
    || !path.isAbsolute(descriptor.executable)
    || descriptor.args.some((arg) => typeof arg !== "string")
  ) {
    throw new Error("REPORT_COLLECTOR_INVALID: collector descriptor must use contract v1, identify its version, and use an absolute executable with string arguments.");
  }
  const target = collectorPath(projectRoot, descriptor.host);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
}

/** Invoke the adapter collector and atomically publish its opaque staging payload. */
export function collectReport(
  input: Omit<ReportCollectionRequest, "schemaVersion" | "contractVersion" | "captureId" | "stagingReportPath">,
): ReportCaptureReceipt {
  const descriptorPath = collectorPath(input.projectRoot, input.host);
  if (!fs.existsSync(descriptorPath)) throw new Error(`REPORT_COLLECTOR_UNREGISTERED: ${input.host}`);
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8")) as ReportCollectorDescriptor;
  if (
    descriptor.schemaVersion !== 1
    || descriptor.contractVersion !== 1
    || descriptor.host !== input.host
    || typeof descriptor.collectorVersion !== "string"
    || !descriptor.collectorVersion.trim()
    || !path.isAbsolute(descriptor.executable)
    || !Array.isArray(descriptor.args)
    || descriptor.args.some((arg) => typeof arg !== "string")
  ) {
    throw new Error(`REPORT_COLLECTOR_INCOMPATIBLE: ${input.host}`);
  }
  const captureId = randomUUID();
  const canonicalDirectory = path.dirname(input.canonicalReportPath);
  fs.mkdirSync(canonicalDirectory, { recursive: true });
  const stagingReportPath = path.join(canonicalDirectory, `.${path.basename(input.canonicalReportPath)}.${captureId}.tmp`);
  try {
    const result = spawnSync(descriptor.executable, descriptor.args, {
      input: JSON.stringify({
        ...input,
        schemaVersion: 1,
        contractVersion: 1,
        captureId,
        stagingReportPath,
      } satisfies ReportCollectionRequest),
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    });
    if (result.error || result.status !== 0) throw new Error(`REPORT_COLLECTOR_FAILED: ${input.host}`);
    if (!fs.existsSync(stagingReportPath)) throw new Error(`REPORT_COLLECTOR_FAILED: ${input.host} produced no report.`);
    const stagingStat = fs.lstatSync(stagingReportPath);
    if (!stagingStat.isFile() || stagingStat.isSymbolicLink()) {
      throw new Error(`REPORT_COLLECTOR_FAILED: ${input.host} produced an invalid report payload.`);
    }
    const payload = fs.readFileSync(stagingReportPath);
    const receipt: ReportCaptureReceipt = {
      contractVersion: 1,
      captureId,
      host: input.host,
      sessionId: input.sessionId,
      payloadBytes: payload.byteLength,
      payloadSha256: createHash("sha256").update(payload).digest("hex"),
      collectorVersion: descriptor.collectorVersion,
      completedAt: new Date().toISOString(),
    };
    fs.renameSync(stagingReportPath, input.canonicalReportPath);
    return receipt;
  } finally {
    fs.rmSync(stagingReportPath, { force: true });
  }
}
