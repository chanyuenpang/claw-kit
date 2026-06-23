import assert from "node:assert/strict";
import test from "node:test";
import type { createRequire } from "node:module";

import { resolveTransformersModule } from "../src/embedding-transformers.js";

type RequireFn = ReturnType<typeof createRequire>;

function failingRequire(): RequireFn {
  return buildRequire((specifier: string) => {
    throw new Error(`Cannot find module '${specifier}'`);
  });
}

function fakeRequire(value: unknown): RequireFn {
  return buildRequire((specifier: string) => {
    assert.equal(specifier, "@huggingface/transformers");
    return value;
  });
}

function buildRequire(load: (specifier: string) => unknown): RequireFn {
  const requireFn = ((specifier: string) => load(specifier)) as RequireFn;
  requireFn.cache = Object.create(null);
  requireFn.extensions = Object.create(null);
  requireFn.main = undefined;
  requireFn.resolve = ((specifier: string) => specifier) as RequireFn["resolve"];
  requireFn.resolve.paths = () => [];
  return requireFn;
}

test("transformers resolver falls back to claw-core when project dependency is absent", () => {
  const module = { pipeline: async () => undefined, env: {} };

  assert.equal(resolveTransformersModule(failingRequire(), fakeRequire(module)), module);
});

test("transformers resolver prefers a project dependency when present", () => {
  const projectModule = { pipeline: async () => "project", env: {} };
  const workerModule = { pipeline: async () => "worker", env: {} };

  assert.equal(resolveTransformersModule(fakeRequire(projectModule), fakeRequire(workerModule)), projectModule);
});

test("transformers resolver throws a targeted error when neither location has the dependency", () => {
  assert.throws(
    () => resolveTransformersModule(failingRequire(), failingRequire()),
    /either the project or claw-core install/,
  );
});
