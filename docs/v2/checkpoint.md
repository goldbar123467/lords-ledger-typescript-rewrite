# Lord's Ledger TypeScript Rewrite checkpoint

This repository preserves the paused rewrite from `C:\Users\thecl\Documents\The-Lords-Ledger-v2`, branch `codex/lords-ledger-v2`. It retains the original Git history through baseline `47570f9caa5696c7369d88a42ae87171b78cd68b`. The user requested a separate repository and checkpoint commit. This does not declare the refactor complete or resume the paused development goal.

All 224 existing tracked or nonignored source-worktree files were copied byte-for-byte before repository-specific documentation was updated. Dependencies, build output, browser reports, and ignored local evidence were excluded. The original checkout and both rewrite worktrees were left in place.

## Latest implementation state

The checkpoint includes typed domain modules, validated v2 saves and explicit legacy import, deterministic random state, gameplay repairs, improved Market/Estate/Tavern interactions, and regression tests. The main reducer, most views, several data registries, and executable tooling still need TypeScript migration. `allowJs` remains enabled. Full interface review and measurable production-code reduction remain incomplete.

The seven-path, 21-tier synergy TypeScript conversion was independently reviewed at `7FB3B66BCFE1416886E0B56A3F37794ED9084256BEB8F7F4E9BBFFC49BFFBC13`. It matched archived JavaScript, but reviewers found inherited gameplay and notification defects. Subsequent corrections included here:

- Check authored faith and approval requirements against live Chapel and Great Hall values. Track sustained faith at 60 or above and approval at 65 or above, defaulting missing older-save counters to zero.
- Apply authored seasonal meter rewards to Chapel faith and Great Hall approval. Count a completed season once across perspective flips.
- Reject saved tier sequences that omit prerequisite tiers, and reject malformed live faith, approval, or new counters.
- Place the tier-one notification above the sticky season action.

These corrections passed the source worktree's strict typecheck and 95 unit tests before the pause. They have not received corrected-build browser verification or independent retests. The prior archived evaluator comparison documents conversion parity before the intentional rule corrections; it is not a parity claim for those corrections.

## Verification for this repository

Executed in this independent repository before commit:

- `npm ci`: passed using the existing lockfile. npm reported 10 dependency audit findings (2 low, 2 moderate, 6 high); dependency remediation was not part of this checkpoint operation.
- `npm run typecheck`: passed with the existing strict incremental configuration.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run test:unit`: 95 passed, zero failed or skipped.

Full browser, visual, and campaign checks are not part of this checkpoint operation. Historical results in `verification.md` apply to their recorded builds.

## Evidence and next step

Tracked migration documents, fixtures, and regression tests are included. Bulky ignored evidence remains in the original rewrite worktree under `artifacts/v2/`; the latest independent reports are `tester-synergy-ts-review/report.md` and `grader-synergy-ts-review/report.md` there. Those local artifacts are not included in this repository's commit.

When development resumes, verify normal and perspective-flip counter/reward timing, capture and inspect the corrected toast at 390x844 and 1366x768, run relevant save and gameplay browser tests, then request independent retests against the corrected fingerprint. Continue the remaining migration only after resolving those findings.

To run locally: `npm ci`, then `npm run dev -- --host 127.0.0.1 --port 5180 --strictPort`; open `http://127.0.0.1:5180`.
