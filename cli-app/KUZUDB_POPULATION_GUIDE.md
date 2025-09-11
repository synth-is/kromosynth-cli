## KuzuDB Population & Usage Guide

### Overview
This guide documents the implemented commands, options, environment flags, schema, and performance tuning strategies for populating KuzuDB with evolutionary run lineage and feature vectors.

---
### Core Commands

1. Single Run (direct command)
```bash
node kromosynth.js evo-run-populate-kuzudb \
  --evolution-run-config-json-file conf/evolution-run-config-evoruns2.jsonc \
  --evolution-run-id <EVOLUTION_RUN_ID> \
  --step-size 100
```

2. Batch: JSON-config driven analysis operation
```bash
node kromosynth.js evo-runs-analysis \
  --evolution-runs-config-json-file config/evolution-runs.jsonc \
  --analysis-operations populate-kuzudb \
  --step-size 100
```

3. Directory Walk (multiple run folders discovered on disk)
```bash
node kromosynth.js evo-runs-dir-analysis \
  --analysis-operations populate-kuzudb \
  --evo-runs-dir-path /path/to/evoruns \
  --concurrency-limit 4 \
  --step-size 500
```

4. High‑level Bulk Populator (direct convenience alias)
```bash
node kromosynth.js evo-runs-populate-kuzudb \
  --evo-runs-dir-path /path/to/evoruns \
  --concurrency-limit 1 \
  --step-size 1000 \
  --force-processing
```

Notes:
- `--step-size` controls iteration sampling during lineage extraction (smaller = more granular lineage, larger = faster pre-processing).
- `--force-processing` reprocesses runs even if output artifacts exist.
- `--concurrency-limit` governs parallel directory workers (keep low if memory constrained or using large feature vectors).

---
### Environment Flags (Tuning & Behaviour)

| Flag | Default | Purpose |
|------|---------|---------|
| `KUZU_VERBOSE_KUZU` | 0 | Verbose per-node / progress logging. |
| `KUZU_ENABLE_CLOSE` | 0 | Close DB connections at process exit (WAL cleanup). Mid-run closes always avoided. |
| `KUZU_RECREATE_DB` | 0 | Force delete & recreate KuzuDB before population. |
| `KUZU_CREATE_INDEX` | 0 | Attempt to create property indexes on vector columns (best-effort). |
| `KUZU_FEATURE_BATCH` | 500 | Feature streaming batch size (genome feature load + insert cycle). |
| `KUZU_USE_COPY` | 0 | Enable fast initial node load via CSV + `COPY` (base attributes only). |
| `NODE_OPTIONS=--max-old-space-size=<MB>` | (Node default) | Increase heap if extremely large runs. |

Optional future flag (not yet implemented): `KUZU_BATCH_UNWIND` to use UNWIND-based batched updates instead of per-node SET operations.

---
### Population Modes

1. Baseline (no COPY):
   - Each sound inserted with a `CREATE` statement (or during feature streaming).
2. COPY + Update Path (`KUZU_USE_COPY=1`):
   - Fast bulk load of base rows (id + scalar fields) via `COPY Sound FROM 'file.csv'`.
   - Streaming feature pass performs `MATCH ... SET` updates, adding vectors & feature metadata.
3. Streaming Features:
   - Features read in batches (`KUZU_FEATURE_BATCH`) to bound memory; new vector dimensions trigger `ALTER TABLE ADD <vector>`.
4. Relationship Phase:
   - Parent-child edges created after all node rows exist (could be further optimized with batching later).

---
### Schema (Current)
Node Table: `Sound`
```
id STRING PRIMARY KEY,
name STRING,
elite_class STRING,
generation INT64,
score DOUBLE,
count INT64,
uBC INT64,
duration INT64,
noteDelta INT64,
velocity INT64,
feature_type STRING,
feature_dimension INT64 DEFAULT 0,
primary_embedding_type STRING DEFAULT 'mfcc-sans0'
-- Vector columns (added lazily): audio_features_<DIM> FLOAT[DIM]
```

Relationship Table: `PARENT_OF`
```
FROM Sound TO Sound, method STRING
```

Vector columns (examples): `audio_features_96`, `audio_features_128`, `audio_features_512`, plus any newly observed dimensions.

---
### Query Examples

Descendants (depth ≤ 10):
```cypher
MATCH (a:Sound)-[:PARENT_OF*1..10]->(d:Sound)
WHERE a.id = $anchor
RETURN d.id, d.elite_class, d.score
ORDER BY d.score DESC LIMIT 25;
```

Score improvement edges:
```cypher
MATCH (p:Sound)-[:PARENT_OF]->(c:Sound)
WHERE c.score > p.score
RETURN p.id, c.id, p.score, c.score, (c.score - p.score) AS delta
ORDER BY delta DESC LIMIT 20;
```

Class transition counts:
```cypher
MATCH (p:Sound)-[:PARENT_OF]->(c:Sound)
WHERE p.elite_class <> c.elite_class
RETURN p.elite_class AS from, c.elite_class AS to, COUNT(*) AS transitions
ORDER BY transitions DESC;
```

Average vector presence per dimension (example for 96):
```cypher
MATCH (s:Sound)
WHERE s.audio_features_96 IS NOT NULL
RETURN COUNT(s) AS with96, AVG(s.score) AS avgScore96;
```

---
### Performance Guidance

| Scenario | Suggested Settings |
|----------|--------------------|
| Large run (>100k genomes) baseline | `KUZU_USE_COPY=1 KUZU_FEATURE_BATCH=500` |
| Memory pressure | Reduce `KUZU_FEATURE_BATCH` (e.g. 200) |
| Faster vector ingestion (future) | Add UNWIND batching path (planned) |
| Fresh benchmark | `KUZU_RECREATE_DB=1 KUZU_USE_COPY=1` |
| Investigate bottlenecks | Enable `KUZU_VERBOSE_KUZU=1` |

Potential next optimizations:
1. UNWIND-based batched updates (reduce per-node SET cost).
2. Batched relationship creation via UNWIND.
3. COPY into staging table for feature vectors then join/merge.
4. Prepared statements (if Node SDK adds explicit prepare/execute API gains).

---
### Error Handling & Idempotency
| Condition | Behaviour |
|-----------|-----------|
| Re-run without `KUZU_RECREATE_DB` | Existing rows are updated (COPY path) or duplicate CREATEs avoided by recreating DB first as needed. |
| Table exists | Initialization catches and backfills missing columns. |
| New vector dimension | `ALTER TABLE ADD audio_features_<DIM>` attempted once (ignored if exists). |
| Missing feature data | Node inserted with metadata defaults; no vectors. |
| WAL files | Cleaned automatically on exit if `KUZU_ENABLE_CLOSE=1`; otherwise harmless. |

---
### Troubleshooting
| Symptom | Mitigation |
|---------|-----------|
| Heap out of memory | Lower `KUZU_FEATURE_BATCH`; optionally increase Node heap. |
| Slow insertion after COPY | Enable future UNWIND path (once implemented) or raise batch size. |
| Many small dimensions | Consolidate features upstream or filter to primary dimension before ingestion. |
| Segfault on exit | Keep `KUZU_ENABLE_CLOSE` unset (default) or ensure single process exit. |

---
### Roadmap (Proposed)
| Feature | Status |
|---------|--------|
| COPY base rows | Implemented |
| Streaming feature batches | Implemented |
| Idempotent init & lazy vector columns | Implemented |
| UNWIND batched updates | Planned |
| Batched relationship UNWIND | Planned |
| Feature similarity CLI command | Planned |
| Staging COPY for vectors | Evaluating |

---
### Minimal Example End‑to‑End
```bash
export KUZU_USE_COPY=1
export KUZU_FEATURE_BATCH=500
node kromosynth.js evo-run-populate-kuzudb \
  --evolution-run-config-json-file conf/evolution-run-config-evoruns2.jsonc \
  --evolution-run-id <EVOLUTION_RUN_ID> \
  --step-size 200
```

Then explore (example):
```cypher
MATCH (s:Sound) RETURN COUNT(s) as total;
```

---
### Support Metadata
Schema version (current initializer): `2.1` (feature-support + lazy vector columns)

---
### Change Log (Excerpt)
| Date | Change |
|------|--------|
| 2025-09-11 | Added COPY bulk load path + streaming vector ingestion | 
| 2025-09-11 | Added idempotent initializer + lazy vector columns | 
| 2025-09-11 | Added feature batch streaming (memory safe) | 
| 2025-09-10 | Added directory & bulk population commands |

---
### Questions / Follow-ups
Open to implement UNWIND batching and staged feature COPY next if/when required for further speedups.
