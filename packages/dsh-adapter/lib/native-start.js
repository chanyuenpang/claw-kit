function unavailable() {
    return Object.assign(new Error("NATIVE_START_UNAVAILABLE"), {
        code: "NATIVE_START_UNAVAILABLE", outcome: "known", effect: "none", phase: "before-call",
    });
}
export async function startNativeActivation(service, spec) {
    const native = service;
    if (typeof native?.startActivation === "function")
        return native.startActivation(spec);
    throw unavailable();
}
//# sourceMappingURL=native-start.js.map