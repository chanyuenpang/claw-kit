// Generated from packages/core/src/role-preferences.ts; do not edit this artifact.
export function roleModelIntent(role) {
    switch (role) {
        case "feature-architect": return "high-capability";
        case "researcher": return "inherit";
        case "finalizer": return "low-cost";
        default: throw new TypeError("Invalid delegation role");
    }
}
function optionalHint(value) {
    if (value == null)
        return undefined;
    if (typeof value !== "string" || !value.trim())
        throw new TypeError("Invalid role model preference");
    return value;
}
function optionsFrom(value) {
    const options = {};
    for (const key of ["provider", "model", "reasoningEffort"]) {
        const hint = optionalHint(value?.[key]);
        if (hint)
            options[key] = hint;
    }
    return options;
}
/** Pure best-effort selection; permission and delivery are separate hard checks. */
export function selectRoleModelPreference(input) {
    const intent = roleModelIntent(input.role);
    const model = optionalHint(input.hints?.model);
    const reasoningEffort = optionalHint(input.hints?.reasoningEffort)
        ?? (input.role === "feature-architect" ? "high" : undefined);
    const requested = {
        intent, ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}),
    };
    const inheritanceBasis = optionsFrom(input.inherited);
    const basis = Object.keys(inheritanceBasis).length ? { inheritanceBasis } : {};
    const inherited = (reason) => ({
        requested, applied: { mode: "inherit", options: {}, ...basis },
        resolved: { known: false }, reason,
    });
    if (intent === "inherit") {
        if (input.supportsOptions && Object.keys(inheritanceBasis).length)
            return {
                requested: { intent }, applied: { mode: "explicit", options: { ...inheritanceBasis } },
                resolved: { known: false }, reason: "inherit-role",
            };
        return { ...inherited("inherit-role"), requested: { intent } };
    }
    if (!input.supportsOptions)
        return inherited("options-unavailable");
    const options = {};
    const candidateModel = optionalHint(input.candidate?.model);
    const candidateEffort = optionalHint(input.candidate?.reasoningEffort);
    if (candidateModel) {
        options.model = candidateModel;
        const provider = optionalHint(input.candidate?.provider);
        if (provider)
            options.provider = provider;
    }
    if (candidateEffort)
        options.reasoningEffort = candidateEffort;
    if (!Object.keys(options).length)
        return inherited(input.catalogAvailable === false
            ? "catalog-unavailable" : model ? "model-unavailable" : reasoningEffort ? "effort-unavailable" : "host-default");
    const reason = model && !candidateModel ? "model-unavailable"
        : model && candidateModel !== model ? "model-alternative"
            : reasoningEffort && candidateEffort !== reasoningEffort ? "effort-unavailable" : "preferred";
    return { requested, applied: { mode: "explicit", options, ...(!candidateModel ? basis : {}) },
        resolved: { known: false }, reason };
}
/** Reusing an existing role submits no new model options; never claim otherwise. */
export function reuseExistingRoleSelection(selection) {
    return { requested: { ...selection.requested }, applied: { mode: "inherit", options: {} },
        resolved: { known: false }, reason: "reuse-existing" };
}
/** Compatibility depends on submitted parameters, not unfulfilled preferences. */
export function roleLaunchRecipe(selection) {
    // Only submitted child options define compatibility. Caller observations are
    // audit context, not part of the worker identity.
    return { mode: selection.applied.mode, options: optionsFrom(selection.applied.options) };
}
/** Normalize optional operational metadata; unknown fields are forward-compatible. */
export function parseRoleSelection(value) {
    const object = (input) => {
        if (!input || typeof input !== "object" || Array.isArray(input))
            throw new TypeError("Invalid role selection metadata");
        return input;
    };
    const readOptions = (input) => {
        const row = object(input);
        const known = {};
        for (const key of ["provider", "model", "reasoningEffort"]) {
            if (!Object.hasOwn(row, key))
                continue;
            if (typeof row[key] !== "string" || !row[key].trim())
                throw new TypeError("Invalid role selection options");
            known[key] = row[key];
        }
        return known;
    };
    const root = object(value);
    const requested = object(root.requested);
    if (typeof requested.intent !== "string" || !["high-capability", "inherit", "low-cost"].includes(requested.intent))
        throw new TypeError("Invalid role intent");
    for (const key of ["model", "reasoningEffort"]) {
        if (Object.hasOwn(requested, key) && (typeof requested[key] !== "string" || !requested[key].trim()))
            throw new TypeError("Invalid requested role preference");
    }
    const applied = object(root.applied);
    if (applied.mode !== "explicit" && applied.mode !== "inherit")
        throw new TypeError("Invalid role launch mode");
    const options = readOptions(applied.options);
    if ((applied.mode === "inherit") !== (Object.keys(options).length === 0))
        throw new TypeError("Invalid role launch recipe");
    const resolved = object(root.resolved);
    if (typeof resolved.known !== "boolean")
        throw new TypeError("Invalid resolved model evidence");
    const actualOptions = readOptions(resolved);
    if (!resolved.known && Object.keys(actualOptions).length)
        throw new TypeError("Unknown model cannot claim actual settings");
    if (resolved.known && !Object.keys(actualOptions).length)
        throw new TypeError("Resolved model requires actual evidence fields");
    const reasons = ["preferred", "inherit-role", "options-unavailable", "catalog-unavailable", "model-unavailable", "model-alternative", "effort-unavailable", "host-default", "reuse-existing"];
    if (typeof root.reason !== "string" || !reasons.includes(root.reason))
        throw new TypeError("Invalid role selection reason");
    const model = optionalHint(requested.model), reasoningEffort = optionalHint(requested.reasoningEffort);
    return {
        requested: { intent: requested.intent, ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) },
        applied: { mode: applied.mode, options, ...(applied.inheritanceBasis !== undefined ? { inheritanceBasis: readOptions(applied.inheritanceBasis) } : {}) },
        resolved: resolved.known ? { known: true, ...actualOptions } : { known: false }, reason: root.reason,
    };
}
/** Optional soft metadata must never become an execution availability gate. */
export function tryParseRoleSelection(value) {
    try {
        return value === undefined ? undefined : parseRoleSelection(value);
    }
    catch {
        return undefined;
    }
}
