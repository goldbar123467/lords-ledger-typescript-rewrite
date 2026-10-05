# Lord's Ledger TypeScript Rewrite working guide

## Boundary and mission

This independent repository is `C:\Users\thecl\Documents\lords-ledger-typescript-rewrite` on `main`, with `origin` at `https://github.com/goldbar123467/lords-ledger-typescript-rewrite.git`. It preserves the original Git history through `47570f9caa5696c7369d88a42ae87171b78cd68b` and a checkpoint of the rewrite from `C:\Users\thecl\Documents\The-Lords-Ledger-v2`. The user requires a commit after every rewrite loop or section, as specified below. The user resumed the full rewrite on 2026-10-02. Continue implementation here and commit every loop or section. The original checkout at `C:\Users\thecl\Documents\LordsLedger`, its `main` reference, and the two existing rewrite worktrees are protected. Do not change those checkouts or their refs. See `docs/v2/checkpoint.md` for the preserved implementation state; older evidence below describes the source worktree at its recorded fingerprints.

The mission is to preserve the 40-turn medieval estate game and all authored choices while repairing gameplay, improving readability and interaction, migrating first-party executable code to strict TypeScript, and removing redundant implementation code. Do not make the game easier by bypassing systems or trim narrative content to lower line counts.

## Actual commands and evidence

- Install: `npm ci` (Node 22.23.2, npm 10.9.8 at baseline).
- Development: `npm run dev -- --host 127.0.0.1 --port 5180 --strictPort`; verify the responding worktree before browser use. Give baseline and candidate runs isolated browser contexts and storage.
- Production build: `npm run build`. Lint: `npm run lint`.
- Existing test discovery: `npx playwright test --list` found 109 tests at baseline. Candidate `playwright.config.ts` uses an isolated server at `127.0.0.1:5182` by default (`LL_TEST_PORT` overrides it), strict port, and no server reuse. Run `npx playwright test --project=gameplay --workers=1` for browser gameplay, or `npx playwright test --workers=1` for all projects. The full suite takes about 21 minutes on this host and has no Windows visual goldens yet.
- Typecheck: `npm run typecheck`; unit: `npm run test:unit`; focused browser examples: `npx playwright test tests/e2e/gameplay/save-v2.spec.ts --project=gameplay --workers=1`, `building-v2.spec.ts`, `forge-purchase-v2.spec.ts`. `npm run build` and `npm run lint` remain separate checks.
- Evidence: `docs/v2/baseline.md`, `docs/v2/migration-ledger.md`, `docs/v2/design.md`, `docs/v2/verification.md`, and ignored `artifacts/v2/`.

## Feature and state map

- `src/App.jsx`: phase presentation, transient tab subviews, audio, and browser save I/O. Move validated persistence into a typed boundary; DOM and storage must stay outside simulation transitions.
- `src/engine/gameReducer.js`: durable game state and commands. `createInitialState(seed)` makes fresh startup/replay state and seeded market prices. `random.ts` carries a saved Mulberry32 cursor through reducer actions; game-affecting reducer helpers require explicit draws. `buildingActions.ts` owns building identity, plot counting, upgrade eligibility; `transactionValidation.ts` guards quantities; `eventSelector.ts` owns typed event filtering; `raidEngine.ts` owns typed raids; `watchtowerScan.ts` owns seeded scan plans and scoring. `tavernBard.ts` and `tavernCompanion.ts` select persistent dialogue/rewards/offers; `data/militaryRules.ts` centralizes recruitment capacity and the three-season Aldric bonus. Economy, perspective flips, synergies, and meter/legacy effects remain in neighboring modules. Season order and cross-domain actions must remain explicit and atomic. Remaining component-owned gameplay RNG and full player-flow replay still need audit.
- `src/data/`: authoritative definitions for resources, buildings, military, market, chapel, blacksmith, people, Hall disputes/audiences/decrees, tavern, watchtower, events, flips, raids, synergies, and endings. Preserve stable IDs and narrative branches. Validate references before removing compatibility paths.
- `src/components/`: nine management tabs plus Tavern, Watchtower, Great Hall subviews, minigames, event/raid/flip screens, notifications, tutorial, and outcomes. Presentation state should remain local unless saves intentionally persist it.
- Saves: `src/save/saveGame.ts` reads the legacy `lords-ledger-save` key only on explicit import and writes an envelope at `lords-ledger-v2-save`. Import leaves the old bytes untouched and does not overwrite an existing 2.0 slot. The current validator checks core fields, authored pending event effects, phase-specific flip/raid payloads, fractional raid defense ratios, structured terminal reasons, and unsigned saved RNG state. Legacy and earlier-v2 saves lacking RNG gain a deterministic derived seed. Many nested subsystem shapes still need full contracts and validation.

## Work loop and review

For each vertical slice, inspect definitions, consumers, save shape, and tests; characterize baseline behavior; implement one coherent change; run focused tests, strict typecheck, lint, build, and an affected player flow; inspect fresh screenshots; obtain independent tester/grader findings at meaningful checkpoints; then update the ledger and commit before starting the next loop or section. Do not edit Vite-served source during a browser campaign. Review reports apply only to their recorded source fingerprint, including uncommitted and untracked source.

The screenshot matrix uses 1366x768 as primary, 1280x720 for existing comparisons, 1920x1080 wide, and about 390x844 narrow. Cover title/navigation, all nine tabs, deeper interactions, phase/outcome screens, and stress states. Open actual before and after images and critique text, contrast, clipping, focus, and scroll; screenshot existence or pixel change alone is not approval. Update goldens only after the intended image was inspected and independently accepted. Browser screenshots do not establish gameplay correctness.

Tester and grader are independent reviewers. They may write only under assigned `artifacts/v2/` review directories and must not edit production or shared tests. Tester provides reproducible player-flow failures; grader inspects diff and actual images and marks uninspected areas `NOT REVIEWED`. Primary agent owns production changes and test integration.

## Required commits after every loop or section

The user has authorized and requires automatic checkpoint commits in this repository after **every rewrite loop or section**, including review-and-fix iterations and documentation sections. Do not accumulate multiple loops into one final commit or ask for permission again to make these commits.

1. Finish the bounded iteration and run checks appropriate to its changes. For documentation-only work, check the diff, referenced paths, and command accuracy; gameplay tests are required when the changes affect gameplay.
2. Update `docs/v2/migration-ledger.md` and `docs/v2/verification.md` when implementation status or verification evidence changes. Record the section's scope, executed checks, results, review evidence, and unresolved work.
3. Review `git status` and the diff, stage only files belonging to that section, and run `git diff --cached --check`. Include its implementation, regression tests, and relevant documentation together. Keep generated outputs, local evidence artifacts, secrets, and unrelated user changes out of the commit.
4. Create a focused commit on this repository's `main` before starting another loop or section. Use a descriptive message such as `refactor(synergies): type tier evaluation`, `fix(saves): validate approval counters`, or `docs(rewrite): update migration workflow`. Include verification results and any outstanding checks in the commit body.
5. If an iteration ends with unresolved work, still preserve its changes in an explicitly labeled checkpoint commit and keep the ledger status `IN PROGRESS`. Record failing or pending checks; a commit is not a completion or review signoff. If the iteration changed no tracked or intended new files, report that no commit was needed instead of creating an empty commit.
6. Report the new commit SHA and section summary to the user. Preserve separate loop commits; do not amend, squash, or rewrite earlier checkpoints unless the user requests it. If Git prevents a commit, report the concrete failure and resolve it before accumulating another section.

## TypeScript and integrity gates

Final migration must include app, engine, content, tests, and executable tooling with `strict` and `noUncheckedIndexedAccess`; temporary `allowJs` is a migration aid only. Avoid blanket `any`, suppression comments, double assertions, and unchecked persisted-data casts. Use domain contracts and discriminated actions where they clarify legal transitions. Keep CSS, HTML, JSON, and assets in their native formats.

Do not treat an assertion-free campaign, a skipped save assertion, a passing build, or a generated screenshot as proof of correctness. Preserve content, legal choices, save integrity, deterministic replay, and realistic outcomes. No unresolved P0/P1, no significant new P2, complete interface review, genuine browser victory and loss/restart, and honest code-category metrics are required to call 2.0 complete.

## Current status and next slice

The full rewrite remains IN PROGRESS. Military count/level boundaries, typed command planner and zero-morale correction retain scoped independent evidence. Watchtower data and entire view are now checked TypeScript; shared readiness fixes and enlarged labels/report keyboard reading are accepted within their recorded bounds. See docs/v2/migration-ledger.md and verification.md for fingerprints, before/after images, failed attempts and independent reports.

Chapel command integrity, enlarged keyboard visibility and effect/cost claims now have scoped independent approval from GPT-6.1 Sol medium tester/grader. Malformed tithes, insufficient paid choices and repeated outcomes reject atomically; legal fractional donations and all 15 choices remain. Adaptive checked GameHeader and keyboard-visible focus keep choices/costs clear of page chrome. Herbs truthfully advertise five food; Bishop full/half payments remain 60/30d.

Latest claim checkpoint: baseline 044c743, fingerprint 9541D9889B08EEF0F6CE3104F02152B4A0E69C1EA6DD77672C2FBC0F4A7B0F8A. All 141 units, strict typecheck, lint, build and two claim/save browsers pass. The preceding focus checkpoint has 25 focused browser passes. See docs/v2/migration-ledger.md and verification.md for exact identities, failed attempts, independent reports, content comparisons and opened images.

Latest manuscript correction: baseline cbf148d, fingerprint 69CB18A2F2266E7F505EF3E24F0FC8E5C147BE2ED21AF1A5EE7BC3FE6C25992C. All 147 units, strict typecheck, lint, build, one current real-timer browser and 24,200 legal subsystem parity transitions pass. The previous lifecycle checkpoint has both phone/laptop real-timer journeys. Sol 6.1 medium tester/grader close T-CMS-01/G-CH-MS01: every owned pattern/input slot must be a valid symbol, so sparse or inherited arrays reject atomically.

Next extract the characterized manuscript transitions into checked domain logic, preserving RNG order, legal retries, facts, rewards and logs. Then migrate the Chapel view and complete its saved-state validation/recovery. The save boundary still accepts previously corrupted nested null prefixes, which command guards reject; this correction does not migrate those saves. Reports: artifacts/v2/{tester,grader}-chapel-manuscript-{integrity,sparse}/{report,review}.md.

Production is 46,619 lines, 1,272 above baseline; 28 source JS/JSX files remain. Required reduction is unmet. App, reducer, most views, remaining content, tests/tooling and whole-game gates remain unfinished. allowJs:true/checkJs:false is temporary. Full Chapel UI and saved-state acceptance remain pending. README Run locally stays removed.

Deferred P3s: extreme Dashboard balances, enlarged terminal tier words, Captain category headings, literal station escape text and prior-victory advice. Long raid keyboard reading, mouse-only Military tooltips, general contrast, actual browser zoom and screen readers still need review. Historical campaign/full-suite evidence and limits remain in the ledger; Windows visual goldens are incomplete. Original checkout remains protected and clean at47570f9caa5696c7369d88a42ae87171b78cd68b. README Run locally stays removed. Continue implementation here and commit/push each coherent section before starting the next.
