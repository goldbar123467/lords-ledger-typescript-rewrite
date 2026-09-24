# QA Process — The Lord's Ledger

## Overview

This document preserves the persona-based QA scenarios. For the active 2.0
worktree, `AGENTS.md` and `docs/v2/verification.md` define the execution
and evidence gates. The worktree is not being merged to `main`.

## Playwright Quick Reference

- Config: `playwright.config.ts` (Chromium and gameplay projects, isolated Vite server on 127.0.0.1:5182 with no reuse).
- Helpers: `tests/e2e/helpers.js` — `startGame()`, `navigateToTab()`,
  `playOneTurn()`, `dismissOverlay()`, `dismissTutorial()`.
- Existing specs:
  - `tests/e2e/gameplay/*.spec.js` and `*.spec.ts` — gameplay / flow
  - `tests/e2e/visual/*.spec.js` — screenshot / unicode / icon audits
- Commands:
  ```bash
  npm run test                  # full suite
  npm run test:visual           # visual only
  npx playwright test <file>    # one spec
  npm run test:update-snapshots # refresh baselines
  ```
- QA persona driver: `tests/e2e/qa/persona-qa.spec.js` (added this cycle).
- Screenshots are written to `playtest-screenshots/`.

## Personas (3 roles)

### 1. Noob (6th grader, first time)
- Click everything, dismiss every tooltip without reading.
- Never opens Market, Chapel, Blacksmith; lives on Estate + Simulate.
- Goal: game should not soft-lock or crash on random clicking.

### 2. Avg Gamer
- Follows the intended loop: build 1–2 economy buildings, recruit a few
  levy, then simulate.
- Uses the Market occasionally; reads scribe's notes.
- Goal: beat 10+ turns, meters should not auto-kill them.

### 3. Goat Gamer
- Optimal play: Spring/Summer farm build, Autumn tax stacking, Winter
  fortify, military synergy by year 2.
- Goal: reach the 40-turn victory and unlock synergies.

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
