import fs from "node:fs";

const hooks = JSON.parse(fs.readFileSync("./hooks/hooks.json", "utf8"));

if (!hooks || typeof hooks !== "object" || typeof hooks.hooks !== "object") {
  throw new Error("hooks.json must contain a top-level hooks object.");
}

for (const [eventName, rules] of Object.entries(hooks.hooks)) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error(`hooks.${eventName} must be a non-empty array.`);
  }

  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule !== "object") {
      throw new Error(`hooks.${eventName}[${index}] must be an object.`);
    }
    if (!Array.isArray(rule.hooks) || rule.hooks.length === 0) {
      throw new Error(`hooks.${eventName}[${index}].hooks must be a non-empty array.`);
    }
    for (const [hookIndex, hook] of rule.hooks.entries()) {
      if (hook?.type !== "command") {
        throw new Error(`hooks.${eventName}[${index}].hooks[${hookIndex}] must have type=command.`);
      }
      if (typeof hook.command !== "string" || hook.command.trim() === "") {
        throw new Error(`hooks.${eventName}[${index}].hooks[${hookIndex}].command must be a non-empty string.`);
      }
      if ("timeout" in hook && (!Number.isInteger(hook.timeout) || hook.timeout <= 0)) {
        throw new Error(`hooks.${eventName}[${index}].hooks[${hookIndex}].timeout must be a positive integer.`);
      }
    }
  }
}

console.log("hooks.json shape ok");
