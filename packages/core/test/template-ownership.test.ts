import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, writePlan } from "../src/index.js";

for (const selection of ["implicit", "file", "named", "configured"] as const) {
  test(`planning disabled preserves template ownership: ${selection}`, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-owner-"));
    try {
      initProject({ cwd, projectName: "Template owner", planning: false });
      const templateFile = path.join(cwd, ".claw", "templates", "owned.json");
      fs.mkdirSync(path.dirname(templateFile), { recursive: true });
      fs.writeFileSync(templateFile, JSON.stringify({ id: "owned", version: "1.0.0", knowledgeCapture: false,
        status: "process.active", tasks: [
          { id: 1, title: "Claim", status: "pending" },
          { id: 2, title: "Result", status: "pending", execution: { type: "default", lifecycle: "knowledge.result" } },
        ], rules: ["Keep the owner contract"] }));
      if (selection === "configured") {
        const configPath = path.join(cwd, ".claw", "project.json");
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        config.defaultPlanTemplate = "owned";
        fs.writeFileSync(configPath, JSON.stringify(config));
      }
      const created = await writePlan({ cwd, taskName: "owner", title: "Work",
        ...(selection === "file" ? { templateFile } : {}),
        ...(selection === "named" ? { templateName: "owned" } : {}) });
      assert.equal(created.plan.status, "process.active");
      if (selection === "implicit") {
        assert.equal(created.plan.tasks.length, 1);
        assert.equal(created.plan.tasks[0]?.title, "Work");
      } else {
        assert.deepEqual(created.plan.tasks.map(task => task.title), ["Claim", "Result"]);
        assert.equal(created.plan.tasks[1]?.execution?.lifecycle, "knowledge.result");
        assert.deepEqual(created.plan.rules, ["Keep the owner contract"]);
        assert.equal(created.plan.knowledgeCapture, false);
      }
    } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
  });
}
