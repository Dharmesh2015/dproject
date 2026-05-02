# Changelog

All notable changes to DProject. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.6] — 2026-05-02

**TypeScript declaration file fix.**

### Fixed
- **`dproject.d.ts`** previously contained both `export default DProject` and `export = DProject`, which TypeScript rejects (`TS2309: An export assignment cannot be used in a module with other exported elements`). Any consumer using `--strict` (the default for `tsc --init` since TS 3.x) hit this on first compile. Removed the redundant `export = DProject`; `export default` plus `esModuleInterop` (TS default) covers all reasonable import styles, including the `import DProject, { Task } from 'dproject'` shape used in [examples/consumer.ts](examples/consumer.ts).

### Added
- **Four runnable examples** in [examples/](examples/) — `extract-tasks.js`, `extract-deps.js`, `validate.js`, `modify-and-write.js`. Each works with zero arguments (defaults to `tests/fixtures/sample-01.xml`) and includes JSDoc `@type` hints so TypeScript-aware editors get full autocomplete in plain JS.
- README **Examples** section linking the four new files.
- **Regression test** in `10-types.test.js` — fails if `export =` is reintroduced alongside named exports.
- Updated [examples/consumer.ts](examples/consumer.ts) header with the exact `tsc` command that compiles cleanly under `--strict`.

### Quality gates
- 350+ tests, all green.
- `tsc --strict --esModuleInterop` on `examples/consumer.ts`: ✅ exit 0 (was: TS2309).
- All 4 examples × 4 fixtures (16 combos): ✅ all exit 0.

---

## [1.0.0] — 2026-05-01

**v1.0 GA — production-ready, npm-publishable.**

### Added
- **Dependency-graph cycle detection** in `validate()` — catches `A→B→A`, self-loops, and N-task cycles. Reports each cycle once. New error code `CIRCULAR_DEPENDENCY`.
- **`serialize({ pretty: false })`** — compact single-line output for size-sensitive consumers.
- **`serialize({ declaration: false })`** — omit the `<?xml ?>` header.
- **`fromFile(Blob)`** support in Node 18+ (global `Response` / `Blob`).
- **`fromUrl()` integration tests** — full HTTP success / 404 / 500 path coverage via local test server.
- **README peer-comparison table** — DProject vs htmlparser2 vs mpxj-wasm benchmarks.

### Quality gates
- 365+ tests, all green.
- Bundle: **26.4 KB minified / 7.5 KB gzipped** — under target.
- Round-trip Gate 5 unlocked: `parse(serialize(parse(xml)))` is structurally equivalent.
- Spec-correct dependency types (FF=0, FS=1, SF=2, SS=3) on both read and write.

### Performance
- 1000-task synthetic MSPDI: **~28 ms median parse** (35K tasks/sec on commodity hardware).
- 121-task real fixture: **~22 ms median** — *faster* than raw XML walking via htmlparser2 while doing full normalisation, type coercion, parent reconstruction, and validation.

---

## [0.7.0] — 2026-05-01

**MSPDI serializer (round-trip).**

### Added
- **`DProject.serialize(project)`** — emits standards-compliant MSPDI XML. Inverse of `parse()`, sharing the same field maps in `fields.js` (open/closed).
- Single-file bundle now includes the serializer. Bundle grew from 17 KB → 26 KB minified.
- 12-serialize.test.js — 45 round-trip assertions across all 4 fixtures + a synthetic deep-equality fixture.

### Fixed
- **FF/SF dependency type encoding bug** in DPlan's legacy `exportMSPDI()`. The library now writes spec-correct codes (`Type 0=FF, 1=FS, 2=SF, 3=SS`) — previous DPlan exports could swap `FF`↔`SF` when re-imported in MS Project.

---

## [0.6.0] — 2026-05-01

**Rich-field readers (Calendars, Baselines, ExtendedAttribute).**

### Added
- **Calendars** — full read of `<Calendar>` blocks: `WeekDays` (with split working-time blocks), `Exceptions` (legacy `EnteredStart/FinishDate` AND newer `TimePeriod` styles).
- **Baselines** — read `<Baseline>` blocks (numbers 0–10) on tasks; emits `task.baselines: [{number, start, finish, duration, work, cost}]`.
- **ExtendedAttribute definitions** at the project level (`<ExtendedAttributes>`).
- **Per-task / per-resource / per-assignment ExtendedAttribute values**.

### Changed
- TypeScript surface (`dproject.d.ts`) extended with `Calendar`, `WeekDay`, `WorkingTime`, `CalendarException`, `Baseline`, `ExtendedAttributeDef`, `ExtendedAttributeValue`.

---

## [0.5.0] — 2026-05-01

**Beta — all 10 quality gates green.**

### Added
- **`DProject.validate(project)`** — semantic validator with 10 error codes:
  `DUPLICATE_TASK_UID`, `DUPLICATE_RESOURCE_UID`, `DANGLING_PARENT`, `DANGLING_PREDECESSOR`, `CIRCULAR_OUTLINE`, `ASSIGNMENT_BAD_TASK`, `ASSIGNMENT_BAD_RESOURCE`, `FINISH_BEFORE_START`, `NEGATIVE_DURATION`, `MISSING_NAME`.
- Memory leak gate (Gate 9) — runs 100 sequential parses, verifies <5 MB heap growth.
- Browser ↔ Node parity gate (Gate 10) — same fixtures produce byte-identical JSON in both runtimes via `vm.runInContext` emulation.
- TypeScript surface check (Gate 6) — verifies `.d.ts` declares every runtime API symbol and every Task/Resource/Predecessor field used by `examples/consumer.ts`.
- `examples/consumer.ts` — idiomatic TypeScript usage for documentation + type-safety verification.
- Synthetic 1000-task perf benchmark (Gate 8): **~28 ms median**.
- Single-file bundle via `build.mjs` (terser): **17 KB min / 5.25 KB gz** at v0.5.

### Quality gates met
| # | Gate | Result |
|---|---|---|
| 1 | Unit tests | 165 cases across xml/coerce/edge/validator |
| 2 | Real-world fixtures | 4 MSPDI samples parse |
| 3 | Edge cases | 24 cases (BOM, CDATA, entities, malformed) |
| 4 | Schema validator | 10 error codes |
| 6 | TypeScript surface | 43 surface checks |
| 7 | Bundle size | min ≤ 50 KB / gz ≤ 18 KB |
| 8 | Performance | 1000 tasks < 100 ms |
| 9 | Memory | no leak across 100 parses |
| 10 | Browser ↔ Node parity | byte-identical |

---

## [0.1.0] — 2026-05-01

**v0.1 spike — proof of concept.**

### Added
- **Pure-JS XML tokenizer** in `src/xml.js` (~250 LOC, zero deps). Handles namespaces, CDATA, all 5 standard entities + numeric refs, BOM, comments, processing instructions.
- **Declarative MSPDI field maps** in `src/types/fields.js` for Project / Task / Resource / Assignment.
- **Type coercion primitives** in `src/types/coerce.js` (int / float / bool / date / duration / dep-type / lag).
- **Parser** (`src/parser.js`) — walks XML AST → raw string-fields per element.
- **Normaliser** (`src/normalizer.js`) — coerces types, computes `parentUid` from `outlineLevel` walk, normalises predecessors with `typeName` (FF/FS/SF/SS) and `lag` in minutes.
- **Public API** in `dproject.js`: `parse()`, `fromFile()`, `fromUrl()`, `version`.
- 4 real-world MSPDI fixtures (Apache-2.0 from `open-msp-viewer`) used for testing — see [NOTICE.md](NOTICE.md).
- Initial test suite — 37/37 assertions on `sample-01.xml`.

### Architecture
- SOLID applied: 5 modules each with one job (tokenize / coerce / map / walk / normalise).
- Open/Closed: adding an MSPDI field = adding a row in `fields.js`; the walker stays untouched.
- Liskov: every layer takes/returns plain JSON-serializable objects.
- Dependency Inversion: `dproject.js` knows nothing about XML internals.

---

## Project lineage

DProject was extracted from the [DPlan](../) project planning suite, where it originally needed to import & export MS Project files. The library is intentionally generic — DPlan-specific shape mapping happens in `app-mspdi.js` (DPlan's adapter), not here.

Same family naming as [DScroll](../dscroll/) (vanilla virtual-scroll library).

— Built by **Dharmesh Patel**, MIT licensed.
