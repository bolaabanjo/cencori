# Memory eval harness (Phase 3, Layer 0)

The scoreboard that gates every memory change. It measures **answer quality and
memory hygiene**, not cosine similarity: does the store recall the right facts,
drop superseded ones, resist irrelevant recall, and never leak a redacted secret?

**Rule:** no memory layer (conflict resolution, reranking, temporal, decay,
graph) ships without moving a number here. Methodology follows the public
multi-session benchmarks (LoCoMo / LongMemEval) — build memory from a
transcript, then probe it with questions whose gold answers are known.

## Layout

| File | Role |
|------|------|
| `types.ts` | Benchmark + scorecard types |
| `dataset.ts` | The benchmark scenarios (grow this over time) |
| `scorecard.ts` | **Pure** grading + aggregation — unit-tested, deterministic |
| `runner.ts` | Drives the **real** write + retrieval paths against an eval project |
| `../../../scripts/memory-eval.ts` | CLI: runs baseline vs reconcile, prints the diff |

## Categories

- `recall` — a fact was stated; it must come back.
- `contradiction` — a fact changed; only the **new** truth may come back. A
  blind-insert store recalls both values and fails; Layer-1 reconciliation
  supersedes the stale one and passes.
- `irrelevant` — nothing relevant was stated; recall should stay empty.
- `leak` — a secret was stated; redaction must ensure it never comes back.

## Running

```bash
# Against a dedicated eval project (its org must have a working embedding path,
# and the 20260718 reconciliation migration must be applied).
EVAL_ORG_ID=<org> EVAL_PROJECT_ID=<project> npx tsx scripts/memory-eval.ts
```

Output is two scorecards (baseline vs `reconcile=on`) and their diff. The run
exits non-zero if the reconciled store leaks a secret.

The **grading core is unit-tested without any DB**:

```bash
npx vitest run lib/memory/eval
```

## Expected signal

Layer 1 (conflict resolution) should show up as a jump in **contradiction
resolution rate** and **precision** (fewer stale/duplicate facts recalled), with
no regression in `recall` or `leaks`. That delta is the evidence the layer helped
— and the seed of the public benchmark we publish.
