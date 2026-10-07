import { readFileSync } from "node:fs";

// One content contract, with only configuration-dependent additions here.
const base = JSON.parse(readFileSync(new URL("./TEMPLATE.json", import.meta.url), "utf8"));
export default function knowledgeWriterTemplate(options = {}) {
  const template = structuredClone(base);
  const configured = Number(options.knowledgeWriter?.datedSectionsToKeep);
  const keep = Number.isSafeInteger(configured) && configured > 0 ? configured : 6;
  template.rules.push(`For each changed owner, keep at most ${keep} complete dated evolution sections; do not truncate current prose or migrate untouched owners.`);
  if (typeof options.context?.finalizeId === "string") {
    template.tasks[0].detail += " Finalization id: " + options.context.finalizeId + ". Do not edit the canonical job or source materials.";
  }
  return template;
}
