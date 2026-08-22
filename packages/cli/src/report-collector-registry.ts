import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export type ReportCollectorHost = "codex" | "dsh" | "cindy";

/** Adapter-local executable registration. Its output remains opaque to claw-kit. */
export type ReportCollectorDescriptor = {
  host: ReportCollectorHost;
  executable: string;
  args: string[];
};

type ReportCollectionRequest = {
  host: ReportCollectorHost;
  sessionId: string;
  projectRoot: string;
  planPath: string;
  canonicalReportPath: string;
  stagingReportPath: string;
  startedAt?: string;
};

function collectorPath(projectRoot: string, host: ReportCollectorHost): string {
  return path.join(projectRoot, ".claw", "runtime", "report-collectors", `${host}.json`);
}

export function registerReportCollector(projectRoot: string, descriptor: ReportCollectorDescriptor): void {
  if (!path.isAbsolute(descriptor.executable) || descriptor.args.some((arg) => typeof arg !== "string")) {
    throw new Error("REPORT_COLLECTOR_INVALID: collector executable must be absolute and arguments must be strings.");
  }
  const target = collectorPath(projectRoot, descriptor.host);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
}

/** Invoke the adapter collector and publish its staging file without inspecting its content. */
export function collectReport(input: Omit<ReportCollectionRequest, "stagingReportPath">): void {
  const descriptorPath = collectorPath(input.projectRoot, input.host);
  if (!fs.existsSync(descriptorPath)) throw new Error(`REPORT_COLLECTOR_UNREGISTERED: ${input.host}`);
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8")) as ReportCollectorDescriptor;
  if (descriptor.host !== input.host || !path.isAbsolute(descriptor.executable)) {
    throw new Error(`REPORT_COLLECTOR_INCOMPATIBLE: ${input.host}`);
  }
  const stagingDir = path.join(path.dirname(input.canonicalReportPath), ".runtime", "report-captures");
  fs.mkdirSync(stagingDir, { recursive: true });
  const stagingReportPath = path.join(stagingDir, `${randomUUID()}.report`);
  try {
    const result = spawnSync(descriptor.executable, descriptor.args, {
      input: JSON.stringify({ ...input, stagingReportPath }), encoding: "utf8", windowsHide: true, timeout: 30_000,
    });
    if (result.error || result.status !== 0) throw new Error(`REPORT_COLLECTOR_FAILED: ${input.host}`);
    if (!fs.existsSync(stagingReportPath)) throw new Error(`REPORT_COLLECTOR_FAILED: ${input.host} produced no report.`);
    fs.copyFileSync(stagingReportPath, input.canonicalReportPath);
  } finally {
    fs.rmSync(stagingReportPath, { force: true });
  }
}
