# QA Process — The Lord's Ledger

## Overview

This document preserves the persona-based QA scenarios. For the active 2.0
repository, `AGENTS.md` and `docs/v2/verification.md` define the execution
and evidence gates. Rewrite sections are committed on the independent
`lords-ledger-typescript-rewrite/main`; the original game's `main` is protected.

## Playwright Quick Reference

- Config: `playwright.config.ts` (Chromium and gameplay projects, isolated Vite server on 127.0.0.1:5182 with no reuse).
- Helpers: `tests/e2e/helpers.ts` — `startGame()`, `navigateToTab()`,
  `playOneTurn()`, `dismissOverlay()`, `dismissTutorial()`.
- QA progression: `tests/e2e/qaProgress.ts` verifies native saved calendar
  movement after continued turns and native ending UI without attempting a terminal Save.
- Existing specs:
  - `tests/e2e/gameplay/*.spec.ts` — gameplay / flow
  - `tests/e2e/visual/*.spec.ts` — screenshot / Unicode / icon audits
  - `tests/e2e/qa/*.spec.ts` — persona and exploratory diagnostics
- Commands:
  ```bash
  npm run test                  # full suite
  npm run test:visual           # visual only
  npx playwright test <file>    # one spec
  npm run test:update-snapshots # only after independent image approval; scope the update
  ```
- QA persona driver: `tests/e2e/qa/persona-qa.spec.ts`.
- Current screenshots/reports use Playwright per-test output paths. Each persona
  attaches its own `qa-findings.json` and `qa-summary.json`; summaries describe one
  attempt, with its own duration. Historical root JSON and screenshots are preserved.
- Inspect and approve actual images before updating baselines. Existing Linux
  images do not establish Windows acceptance; thirteen Windows baselines are missing.

## Personas (3 roles)

### 1. Noob

- Current driver: Easy start, up to six turns, random Estate/Map/Market/Military/
  People/Chapel visits with mandatory selected controls and checked turn progression.
- Intended review: novice exploration without crashes or blocked progression.

### 2. Avg Gamer

- Current driver: Normal start, mandatory paid 80d Strip Farm purchase and up to eight turns.
- It verifies exact cash payment, one new owned farm at condition 100, unchanged
  RNG, the native built card, and exact saved-byte reload before seasonal play.
- Intended review: paid economy construction and ordinary seasonal management.

### 3. Goat Gamer

- Current driver: Hard start and up to twelve turns using shared turn progression.
- It does not implement an optimal strategy or run a full forty-turn campaign.
- Intended review: difficult campaigns, strategic play and natural synergy acquisition.

Each persona now rejects collected errors and recorded progression bugs. Exploratory
QA requires all three turns to continue and persists its error JSON before rejecting
collected errors. Normal progression must save the next turn, season and year;
recognized endings require native outcome controls and final-resource UI. Terminal
screens cannot save, so the stored pre-turn snapshot is not final state evidence.

`tests/e2e/qa/qa-progress.spec.ts` covers phone/desktop managed victory and famine
transitions plus a deliberately blocked Simulate action. These are fixture regressions,
not natural campaigns. `tests/e2e/qaDiagnostics.ts` retains page, console, request and
HTTP errors, including origin metadata, and records failed attempts and early exceptions.
Known media cancellation during an explicitly declared reload is recorded separately;
the correlation is not universal causal attribution. Negative fault/report-loss tests
were verified at `fbd8c8f`; that checkpoint is not a fresh whole-suite result. Random
persona choices and short 6/8/12 bounds do not establish deterministic replay, complete
failure attribution, interruption recovery or full QA acceptance.

## Bug Logging Format (backlog.md)

```
### B-NN — <short title>
- Persona(s): Noob / Avg / Goat
- Severity: P0 (crash) | P1 (soft-lock / broken feature) | P2 (UX) | P3 (polish)
- Reproduction: …
- Expected: …
- Actual: …
```

## 2.0 fix cycle

Keep all reproducible findings, prioritizing P0/P1 and significant P2 issues.
The primary implementer owns source changes; one independent tester and one
grader verify the frozen candidate. Run focused tests, typecheck, lint, build,
an affected browser flow, and opened before/after images. Record commands and
results in `docs/v2/verification.md`; a screenshot or assertion-free persona
run is not by itself a passing gameplay check.
