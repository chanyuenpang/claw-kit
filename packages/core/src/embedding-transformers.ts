import type { createRequire } from "node:module";

type RequireFn = ReturnType<typeof createRequire>;

export type TransformersModule = typeof import("@huggingface/transformers");

export function resolveTransformersModule(projectRequire: RequireFn, workerRequire: RequireFn): TransformersModule {
  const transformersModule =
    tryRequire(projectRequire, "@huggingface/transformers") ?? tryRequire(workerRequire, "@huggingface/transformers");
  if (!transformersModule) {
    throw new Error("Cannot find module '@huggingface/transformers' from either the project or claw-core install.");
  }
  return transformersModule;
}

function tryRequire(requireFn: RequireFn, specifier: string): TransformersModule | null {
  try {
    return requireFn(specifier) as TransformersModule;
  } catch {
    return null;
  }
}
