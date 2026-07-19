# Local embedding model comparison for Chinese project search

## Outcome

`jinaai/jina-embeddings-v2-base-zh` is a viable smaller replacement candidate
for `Snowflake/snowflake-arctic-embed-m-v2.0` on the current `claw search`
document-recall workload. It passed all three quality gates in a full isolated
run. `Snowflake/snowflake-arctic-embed-xs` remains unsuitable for Chinese-heavy
projects.

Jina retained 104.8% of the large-model Recall@5 and 104.7% of its MRR@10 in
the same run, with no critical Top-5 misses. Its cache was 51.7% of the large
model, query-daemon working set was 58.2%, cold query time was 34.8%, and warm
median query time was 66.9%. The 100-document, 214-chunk Jina index completed
in 325.9 seconds on CPU.

The repeat run reproduced the Jina quality result exactly. Jina is therefore
the shipped local default. `m-v2.0` remains the higher-resource alternative,
while `xs` is retained only as an explicit low-resource or English-oriented
option and is not recommended for Chinese-heavy projects. The first-download
race described below was fixed before this default changed: a timed-out
persistent daemon request is now terminal instead of starting a competing
one-shot loader, and the default request and worker timeout is two hours.

## Jina follow-up run

The Jina run used a fresh detached worktree, an exact copy of the large-model
database snapshot, `outputDimensionality: 768`, and the same 27 commands through
the real `claw search` CLI. The snapshot contained 100 documents, 214 chunks,
630,585 UTF-8 bytes, and SHA-256
`07cf14f717554ddf01d289cf747bfe599dd5aa83c07123303e35e498c4135994`.

| Slice | Metric | `m-v2.0` | Jina | Result |
| --- | ---: | ---: | ---: | --- |
| All 24 quality queries | Top-1 accuracy | 0.5000 | 0.5000 | tied |
| All 24 quality queries | Recall@5 | 0.8750 | 0.9167 | Jina higher |
| All 24 quality queries | MRR@10 | 0.6333 | 0.6632 | Jina higher |
| 15 Chinese queries | Top-1 accuracy | 0.4667 | 0.4667 | tied |
| 15 Chinese queries | Recall@5 | 0.8000 | 0.8667 | Jina higher |
| 15 Chinese queries | MRR@10 | 0.5800 | 0.6333 | Jina higher |
| 5 English queries | Recall@5 | 1.0000 | 1.0000 | tied |
| 4 mixed queries | Recall@5 | 1.0000 | 1.0000 | tied |
| Critical Top-5 misses | Count | 1 | 0 | Jina higher |
| 3 lexical controls | Top-1 / Recall@5 / MRR@10 | 1 / 1 / 1 | 1 / 1 / 1 | tied |

| Measure | `m-v2.0` | Jina | Jina/large |
| --- | ---: | ---: | ---: |
| Model cache | 1,243,185,233 B | 643,246,279 B | 51.7% |
| Query daemon working set | 3,278,884,864 B | 1,908,273,152 B | 58.2% |
| Cold semantic query wall time | 4,627 ms | 1,612 ms | 34.8% |
| Warm quality-query median | 614 ms | 411 ms | 66.9% |
| Full candidate refresh | not rerun | 325.9 s | n/a |

The first uncached Jina refresh exposed a separate readiness issue. Before the
default changed, the CLI was fixed so that a timed-out persistent request does
not start a competing one-shot loader while the daemon may still be writing
the cache, and both the daemon request and embedding worker now allow two hours
by default. The original failure occurred when the CLI
attempted to create the ONNX session while the 641,212,851-byte model file was
still being downloaded; at the failure point the file was only about 250 MB,
and the daemon continued writing it after returning `system error number 13`.
After the file reached its official full size, the same FP32 Transformers.js
pipeline loaded successfully and returned a 768-dimensional Chinese embedding;
the clean full rerun then passed. This is a reproducible first-download/load
race, not evidence that the completed Jina ONNX model is incompatible.

The evaluation worktree remains configured with Jina and its completed index.
The main worktree's large-model index was not rebuilt by the benchmark. A
concurrent project refresh later advanced the main index from 214 to 215 chunks;
both compared models used the earlier identical 214-chunk snapshot, so this did
not affect the comparison.

## Jina repeat run

The complete benchmark was run a second time after the model was cached. Run 2
copied the then-current large-model snapshot, rebuilt the Jina index from zero,
and executed all 27 queries again through `claw search`.

The project snapshot had legitimately changed between runs: run 1 used 214
chunks and SHA-256
`07cf14f717554ddf01d289cf747bfe599dd5aa83c07123303e35e498c4135994`,
while run 2 used 215 chunks and SHA-256
`e83d7bf6d4326f93b3dd0263de06890b06d8ceefa9339e3dcd2e427d4c04ef7c`.
Despite that change, every Jina result was stable:

- all 27 expected-document ranks were identical
- all 27 Top-1 paths were identical
- overall Recall@5 remained `0.9167`
- overall MRR@10 remained `0.6632`
- Chinese Recall@5 remained `0.8667`
- Chinese MRR@10 remained `0.6333`
- critical Top-5 misses remained zero

| Measure | Jina run 1 | Jina run 2 |
| --- | ---: | ---: |
| Indexed chunks | 214 | 215 |
| Full refresh | 325.9 s | 306.9 s |
| Cold semantic query | 1,612 ms | 1,896 ms |
| Warm quality-query median | 411 ms | 439 ms |
| Query daemon peak working set | 1.91 GB | 1.89 GB |
| Quality gate | pass | pass |

Run 2 SQL verification reported 100 documents, 215 vectors across 100 source
documents, `pendingFileCount = 0`, model
`jinaai/jina-embeddings-v2-base-zh`, and 768 dimensions. No model-download race
occurred with the completed cache. The identical rankings across a slightly
changed snapshot provide stronger stability evidence than a same-file query
rerun, though the corpus remains small enough that broader project validation
is still appropriate before changing the product default.

## Jina tokenizer-aware chunking follow-up

The initial Jina rollout exposed a chunking mismatch rather than a model-output
limitation. Project documents were merged toward 1,024 estimated tokens using a
three-characters-per-token heuristic, while the cached Jina tokenizer declares
a 512-token maximum and the feature-extraction pipeline truncates to that
limit. On the current 100-document claw-kit index, 159 of 217 stored chunks
(73.27%) exceeded 512 Jina tokens.

The local indexing path now tokenizes document chunks before embedding, uses a
448-token target with a 64-token overlap for Jina, and records
`embedding_chunking_version = token-aware-v1` so older indexes rebuild once.
Query embeddings do not enter this document-splitting path. The same project
and 27 real `claw search` queries produced these before/after results on CPU:

| Measure | Before | Token-aware | Change |
| --- | ---: | ---: | ---: |
| Stored vectors | 217 | 497 | 2.29x |
| Chunks above 512 Jina tokens | 159 (73.27%) | 0 | eliminated |
| Token p50 / p90 / max | 744 / 1,183 / 2,365 | 441 / 448 / 448 | bounded |
| Top-1 accuracy | 0.5417 | 0.6250 | +0.0833 |
| Recall@5 | 0.9167 | 0.9167 | unchanged |
| MRR@10 | 0.6785 | 0.7201 | +0.0416 |
| Critical Top-5 misses | 0 | 0 | unchanged |
| Warm wall-time median | 678.85 ms | 963.37 ms | 1.42x |
| Warm engine median | 418.23 ms | 644.38 ms | 1.54x |
| Cold query wall time | 2,614.11 ms | 2,576.42 ms | effectively unchanged |

The corrected full refresh completed in 344.53 seconds, used 2,610.20 CPU
seconds (about 7.58 logical cores on average), and reached a 2.10 GB peak
working set. All 100 documents had vectors, `pendingFileCount` was zero, and
the final index contained 497 768-dimensional Jina vectors. The raw report is
`benchmarks/search/0.1.85-jina-token-aware-chunking-windows.json`.

## Snowflake xs result

`Snowflake/snowflake-arctic-embed-xs` is not a safe default replacement for
`Snowflake/snowflake-arctic-embed-m-v2.0` for the current `claw search`
document-recall workload.

The small model substantially reduces cold-start cost, memory, model-cache
size, and indexing time. Its English and mixed-language results were comparable
to the large model in this corpus. Pure Chinese semantic recall regressed too
far, however: Chinese Recall@5 fell from `0.7333` to `0.3333`, and seven
critical Chinese queries missed their expected document in the top five.

The `xs` recommendation is:

- use Jina as the default model for general and Chinese-heavy projects
- retain `m-v2.0` as the higher-resource 768-dimensional alternative
- do not switch existing indexes to `xs` solely for performance
- consider `xs` only as an explicit low-resource or English-oriented fallback
  with a clear quality warning
- if a smaller default is still desired, evaluate a different multilingual
  model rather than weakening the quality gate for `xs`

## Experiment design

The comparison exercised the real product path. It did not compare raw vectors
directly.

- Every retrieval was executed through the source-built CLI's
  `claw search --query ... --limit 10` command.
- This preserved the Chinese-aware query planner, keyword fallback,
  document-signal candidate route, vector recall, and unified reranking.
- The existing large-model SQLite index was copied into a detached worktree
  with SQLite `VACUUM INTO`; the source project's `.claw/memory.sqlite` was not
  modified.
- The exact `docs.content` snapshot stored in that index was restored into the
  worktree. Both models therefore searched the same 100 documents, 214 chunks,
  and 627,372 UTF-8 bytes (snapshot SHA-256
  `39003ae3618be35998b3b65547f9d453e362c965b5649b9a38ebb96df28a88f2`).
- The worktree first ran the copied `m-v2.0` index, then changed only
  `memory.embedding.model` to `xs` and rebuilt it with
  `claw search index --refresh`.
- Both models used CPU and isolated persistent-daemon runtime directories.
- The human-labeled corpus contains 24 quality queries: 15 Chinese, 5 English,
  and 4 mixed-language queries. Three exact-filename queries are separate
  lexical controls.
- The quality gate required small-model Recall@5 to retain at least 95% of the
  large-model value, MRR@10 to retain at least 90%, and zero critical Top-5
  misses.

The full experiment was run twice. Result ranks were identical for every query
and model across both runs.

## Quality results

| Slice | Metric | `m-v2.0` | `xs` | Result |
| --- | ---: | ---: | ---: | --- |
| All 24 quality queries | Top-1 accuracy | 0.5000 | 0.4167 | lower |
| All 24 quality queries | Recall@5 | 0.8333 | 0.5833 | 70.0% retained; fail |
| All 24 quality queries | MRR@10 | 0.6310 | 0.4897 | 77.6% retained; fail |
| 15 Chinese queries | Top-1 accuracy | 0.4667 | 0.3333 | lower |
| 15 Chinese queries | Recall@5 | 0.7333 | 0.3333 | severe regression |
| 15 Chinese queries | MRR@10 | 0.5762 | 0.3557 | severe regression |
| 5 English queries | Recall@5 | 1.0000 | 1.0000 | tied |
| 5 English queries | MRR@10 | 0.6333 | 0.6167 | near parity |
| 4 mixed queries | Recall@5 | 1.0000 | 1.0000 | tied |
| 4 mixed queries | MRR@10 | 0.8333 | 0.8333 | tied |
| 3 lexical controls | Top-1 / Recall@5 / MRR@10 | 1 / 1 / 1 | 1 / 1 / 1 | tied |

All 24 quality queries used `route = hybrid`. All three exact-filename controls
used `route = lexical_fast_path`. The comparison therefore includes the actual
Chinese search optimizations while keeping lexical-only success from masking
semantic model quality.

The small model had seven critical Chinese Top-5 misses, including queries
about:

- shared local embedding cache placement
- explicit consent before Codex runtime repair
- consistency-aware Truth/ADR finalization
- personal project-config overlays
- multi-route project-search reranking
- the retired Apps SDK widget route
- invocation-scoped host identity

The large model had one critical miss: the knowledge-finalization query ranked
its relevant document seventh. The corpus is therefore not an artificially easy
large-model showcase; it exposes weaknesses in both models while still showing
a clear relative Chinese-quality gap.

## Performance and resource results

| Measure | `m-v2.0` | `xs` | Small/large |
| --- | ---: | ---: | ---: |
| Model cache | 1,243,185,233 B | 91,101,450 B | 7.33% |
| Query daemon working set, run 1 | 3,279,413,248 B | 228,245,504 B | 6.96% |
| Cold semantic query wall time, run 1 | 5,152 ms | 876 ms | 17.0% |
| Warm quality-query median, run 1 | 505 ms | 451 ms | 89.3% |
| Warm quality-query median, run 2 | 522 ms | 417 ms | 79.9% |
| Cache-hit engine time, run 1 | 96.85 ms | 47.39 ms | 48.9% |
| Full small-model refresh, run 1 | not rerun | 23.80 s | n/a |
| Full small-model refresh, run 2 | not rerun | 23.31 s | n/a |
| Small-model index daemon working set | not rerun | 487-492 MB | n/a |

The existing large index was intentionally reused, so this experiment does not
claim a measured large-versus-small full-index speed ratio. An earlier aborted
large-model rebuild remained actively CPU-bound with 100 documents staged and
no vectors committed while its embedding processes occupied multi-gigabyte
working sets. That observation explains the motivation but is not used as a
completed timing result.

The practical performance interpretation is that `xs` dramatically improves
cold start and resource use, but its warm semantic-query median improves by only
about 11-20% on this end-to-end search path. The Chinese recall loss is much
larger than the steady-state latency gain.

## Reproduction

Build the source CLI, create a detached worktree, and run:

```powershell
npm run build -w @veewo/claw-core
npm run build -w @veewo/claw
git worktree add --detach D:\path\to\claw-kit-search-xs-eval HEAD
node scripts\search-model-comparison-benchmark.mjs `
  --worktree D:\path\to\claw-kit-search-xs-eval `
  --output benchmarks\search\model-comparison-result.json
```

To evaluate Jina with the same runner, add:

```powershell
node scripts\search-model-comparison-benchmark.mjs `
  --worktree D:\path\to\claw-kit-search-jina-eval `
  --candidate-model jinaai/jina-embeddings-v2-base-zh `
  --candidate-dimensions 768 `
  --output benchmarks\search\model-comparison-jina.json
```

The runner intentionally leaves the evaluation worktree configured with `xs`
and its completed 384-dimensional index so the result can be inspected with
additional real `claw search` queries.

## Evidence

- `benchmarks/search/model-comparison-corpus.json`
- `scripts/search-model-comparison-benchmark.mjs`
- `benchmarks/search/0.1.85-model-comparison-windows.json`
- `benchmarks/search/0.1.85-model-comparison-windows-run2.json`
- `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows.json`
- `benchmarks/search/0.1.85-model-comparison-jina-v2-base-zh-windows-run2.json`
- detached evaluation worktree:
  `D:\Users\chany\Documents\claw-kit-search-xs-eval`
- detached Jina evaluation worktree:
  `D:\Users\chany\Documents\claw-kit-search-jina-eval`
