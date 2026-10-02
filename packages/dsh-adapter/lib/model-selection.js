import { selectRoleModelPreference } from "../lib/role-preferences.js";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
const text = (value) => typeof value === "string" && value.trim() ? value : undefined;
function knownOptions(value) {
    const options = object(value);
    const provider = text(options?.provider), model = text(options?.model), reasoningEffort = text(options?.reasoningEffort);
    const normalized = { ...(provider ? { provider } : {}), ...(model ? { model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}) };
    return Object.keys(normalized).length ? normalized : undefined;
}
/** Caller facts support compatibility, not a claim about the child's actual model. */
async function callerBasis(agent, getService) {
    const known = knownOptions(agent.options);
    if (known?.provider && known.model)
        return known;
    const query = getService("sessionQuery");
    if (!query?.readSession)
        return known;
    try {
        const events = (await query.readSession(agent.id)).events;
        for (let index = events.length - 1; index >= 0; index--) {
            const event = object(events[index]);
            if (event?.type !== "request/header")
                continue;
            const config = object(object(object(event.data)?.header)?.config);
            const provider = text(config?.provider), model = text(config?.model);
            if (provider && model)
                return { provider, model,
                    ...(text(config?.reasoningEffort) ? { reasoningEffort: text(config?.reasoningEffort) } : {}) };
        }
    }
    catch { /* Missing preference evidence is not a permission/capture failure. */ }
    return known;
}
/** Resolve soft hints before admission; never trial-launch or retry a child. */
export async function selectDshRoleModel(input) {
    // Researcher does not scan the model directory or override caller settings.
    if (input.role === "researcher")
        return selectRoleModelPreference({
            role: input.role, supportsOptions: input.supportsOptions,
            inherited: await callerBasis(input.agent, input.getService),
        });
    const inherited = await callerBasis(input.agent, input.getService);
    const base = { role: input.role, hints: input.hints, supportsOptions: input.supportsOptions, inherited };
    if (!input.supportsOptions)
        return selectRoleModelPreference(base);
    const llm = input.getService("llm");
    const provider = inherited?.provider;
    if (!provider || !llm?.resolveModelInfo || !llm.resolveCallConfig)
        return selectRoleModelPreference({ ...base, catalogAvailable: false });
    try {
        let model = input.hints?.model ?? undefined;
        if (model?.startsWith(provider + "/"))
            model = model.slice(provider.length + 1);
        // These are this Host's explicitly preferred examples, not a model ranking
        // or cross-provider guarantee. An absent example simply uses inheritance.
        if (!model && provider === "openai-codex" && llm.listModels) {
            const preferred = input.role === "feature-architect" ? "gpt-6-astra" : "gpt-6-luna";
            try {
                const advertised = await llm.listModels(provider);
                if (advertised.some(row => row.id === preferred))
                    model = preferred;
            }
            catch { /* A missing directory still permits validating known caller knobs. */ }
        }
        let targetModel = model ?? inherited?.model;
        if (!targetModel)
            return selectRoleModelPreference({ ...base, catalogAvailable: false });
        let info;
        try {
            info = await llm.resolveModelInfo(provider, targetModel);
        }
        catch (error) {
            // A model preference can fail independently of a still-valid effort on
            // the caller's route. This is another read, never a trial child launch.
            if (!model || !inherited?.model || inherited.model === model)
                throw error;
            model = undefined;
            targetModel = inherited.model;
            info = await llm.resolveModelInfo(provider, targetModel);
        }
        if (info.provider !== provider || info.id !== targetModel)
            return selectRoleModelPreference({ ...base, catalogAvailable: false });
        const preferredEffort = input.hints?.reasoningEffort ?? (input.role === "feature-architect" ? "high" : undefined);
        const effort = preferredEffort && info.reasoning?.efforts.some(row => row.id === preferredEffort) ? preferredEffort : undefined;
        const candidate = {
            ...(model ? { provider, model } : {}), ...(effort ? { reasoningEffort: effort } : {}),
        };
        if (Object.keys(candidate).length) {
            // Validate explicit knobs against the owning adapter, but do not turn its
            // materialized defaults into requested overrides or child-execution proof.
            await llm.resolveCallConfig({ provider, model: targetModel, ...(effort ? { reasoningEffort: effort } : {}) });
        }
        return selectRoleModelPreference({ ...base, candidate, catalogAvailable: true });
    }
    catch {
        // This catch covers only read-only preference discovery. It never wraps
        // permission checks, capture, reserve, start, send, claim, or worker results.
        return selectRoleModelPreference({ ...base, catalogAvailable: false });
    }
}
//# sourceMappingURL=model-selection.js.map