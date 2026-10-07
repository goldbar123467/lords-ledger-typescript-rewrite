# Lord's Ledger TypeScript Rewrite working guide

## Mission and boundaries

Preserve the 40-turn medieval estate game, authored content, meaningful choices, difficulty, saves and interconnected systems. Improve gameplay and presentation, maintain substantive strict TypeScript, and remove unnecessary implementation. The full rewrite remains **IN PROGRESS**.

- Work only in `C:\Users\thecl\Documents\lords-ledger-typescript-rewrite`, on `main`.
- Authorized remote: `https://github.com/goldbar123467/lords-ledger-typescript-rewrite.git`.
- Protect `C:\Users\thecl\Documents\LordsLedger` at `47570f9caa5696c7369d88a42ae87171b78cd68b`, and the existing `The-Lords-Ledger-v2` and `The-Lords-Ledger-2.0` checkouts/refs. Do not write project files or run mutating project commands there.
- User authorization supersedes the original mission's no-commit/no-push rule: commit and push every coherent loop or section to this independent repository's `main`. Preserve separate commits; do not amend, squash, force-push, merge unrelated work or deploy without authorization.
- Inspect branch, status and diff before mutations. Use an explicit rewrite working directory. Preserve unrelated changes, first failures and evidence; avoid destructive cleanup or automatic stashing.
- Keep README about the rewrite, update it with each section, and keep its **Run locally** section removed.

## Current commands

Verified runtime at the latest executable checkpoint: Node 22.23.2 / npm 10.9.8. Unit tests and lint use experimental native TypeScript stripping; do not silently change the runtime/dependencies.

| Purpose | Command |
| --- | --- |
| Locked install | `npm ci` |
| Development | `npm run dev -- --port 5180 --strictPort` |
| Strict source/test/tool checking | `npm run typecheck` |
| Unit regressions | `npm run test:unit` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| Production preview | `npm run preview -- --port 5180 --strictPort` |
| Browser discovery | `npx playwright test --list` |
| Gameplay suite | `npx playwright test --project=gameplay --workers=1 --retries=0` |
| Full browser suite | `npx playwright test --workers=1 --retries=0` |
| Visual suite | `npx playwright test tests/e2e/visual --project=chromium --workers=1 --retries=0` |
| Browser installation | `npx playwright install chromium` |
| Seeded headless run | `node --experimental-strip-types playtest.ts 100 1 normal` |

`playwright.config.ts` starts its own isolated strict-port Vite server, defaults to port 5182, supports `LL_TEST_PORT`, and does not reuse a server. For long campaigns prefer a verified production build/preview and an isolated artifact configuration. Verify actual worktree/build/served bytes before use; don't silently connect to another checkout. Use explicit workers/retries and isolated browser storage. Discovery is not execution: the current discovery is 830 tests in 148 files, not 830 passes.

## Source and ownership map

| Area | Owners and constraints |
| --- | --- |
| App and browser | `src/App.tsx`, `src/hooks/`: phase presentation, transient controls, audio and explicit browser storage. Simulation stays pure. |
| Commands and initialization | `src/engine/gameReducer.ts`, `gameCommands.ts`, `initialGameState.ts`: durable commands, typed construction and integration. All 86 reducer tags have checked contracts. |
| Calendar and randomness | `gameCalendar.ts`, `simulateSeason.ts`, `random.ts`: 40-turn calendar, seasonal order and saved Mulberry32 cursor. Domain helpers receive explicit draws. Cosmetic randomness is distinct from gameplay state. |
| Domain transitions | Building, People, Military, Chapel, Hall, Forge, Market and companion owners under `src/engine/`. Keep resource payment, outcomes and receipts atomic. |
| Flips and synergies | `flipActions.ts` owns four story commands and atomic estate settlement. Its seven-field cleanup allocates fresh arrays. `synergyEngine.ts` shares activation receipts; callers retain distinct dates, all-active/new-only bonus timing and deferred queues. |
| Authored content | `src/data/`: stable IDs, narratives, options, effects, registries and prerequisites. `docs/v2/content-manifest.json` records the original inventory; current preservation evidence also lives in content/domain tests. |
| Views | `src/components/`: nine tabs, Tavern/Watchtower/Hall subviews, crafting/minigames, events, raids, flips, notifications, tutorials and endings. Local presentation state must reset correctly on game replacement. |
| Persistence | `src/save/`: versioned envelope, loaded-state validation and explicit legacy import. Static construction types do not prove a valid loaded state. |
| Verification/tooling | `tests/`, `tools/`, `playtest.ts`, `playwright-playtest.ts`, checked root configurations. Keep actual failures and artifact identity. |

Use `rg --files` before guessing paths. Read the relevant implementation, consumers, save fields and tests. Apply relevant personal engineering or game skills before substantial work; routine edits need no new architecture/research exercise.

## State, save and compatibility rules

- Keep React/DOM, Vite and Tailwind; don't add an engine/framework/backend without a concrete requirement.
- `lords-ledger-v2-save` is the rewrite slot. Read `lords-ledger-save` only on explicit import; preserve legacy bytes and don't overwrite an existing rewrite slot implicitly.
- Validate external/loaded values before use. Reject malformed input without partial payment, rewards, mutation or RNG consumption; preserve supported missing/null historical defaults instead of silently rewriting history.
- Valid transitions must preserve input ownership and write/read/resave closure. Compare complete state and saved bytes for preservation; label reader-rejected raw fixtures separately.
- `ADVANCE_TURN` accepts `random_resolve` only. Seasonal resolution must `CONTINUE_TO_RANDOM`, including explicit empty random pools. Fixture setup must follow this protocol.
- Flip indices must be numeric nonnegative safe integers selecting an available option. Same-phase CYOA node changes are new decisions, not automatically replay violations. No native stale-choice defect has been established.
- Seasonal processing owns elapsed bankruptcy/season counters. Story return does not increment turn or repeat seasonal work. Keep game-over priority, military reconciliation, authored prose, chronology and fired receipts intact.

## Work loop, reviewers and commits

1. Establish the bounded behavior and immutable baseline. Preserve a failing reproduction before a correction; distinguish a correction from behavior-preserving consolidation.
2. Primary agent owns production, tests and documentation. Reuse only `/root/tester_sol` and `/root/grader_sol`, GPT-6.1 Sol with medium reasoning, for independent verification. They may write only assigned ignored `artifacts/v2/` directories; no shared/Git edits or implementation delegation.
3. Verify relevant domain checks, typecheck, lint, build and native player flows. For documentation-only sections check instructions, paths, commands and diff; don't invent fresh gameplay runs.
4. Freeze source/tests/docs for meaningful review/browser runs. Supply fingerprint including untracked source, build identity, scenario, paths and acceptance criteria. Serialize browser lanes root, tester, grader when needed. Poll a live process to terminal; observation timeout is not completion or a reason to restart.
5. Open actual before/current images and read written reports. Preserve failed logs/traces/screens and distinguish harness/setup mistakes from product failures. Close owned contexts/processes and obtain explicit reviewer-hold release before edits.
6. Update README and the ledger/verification records with scope, checks, limits and next action. Keep bulky outputs ignored and retain historical evidence by revision.
7. Review status/diff; stage only the section; run `git diff --cached --check`; create a descriptive commit and push `main` before another section. Include implementation, regressions and records together. A checkpoint is progress, not final acceptance. Report SHA/results; don't create empty commits.

## TypeScript, tests and visual evidence

`tsconfig.json` includes source, tests, tooling and root configurations with `strict` and `noUncheckedIndexedAccess`; `allowJs` is removed. Keep first-party executable code checked TypeScript. Avoid `any`, suppression comments, double assertions and unchecked persisted-data casts. Preserve native CSS/HTML/JSON/media. Third-party library checking uses the existing narrow `skipLibCheck` setting.

Test meaningful outcomes, costs, exact RNG/save continuation and failure paths. Never count assertion-free, skipped or forced-terminal campaigns as completion. Archive comparisons prove preservation for their scenarios, not independent correctness of every formula.

Review every major surface at 1366x768, retain 1280x720 comparisons, and target 1920x1080 / 390x844 responsive stress states. Cover entry/load/import, nine tabs, deeper interactions/minigames, event/raid/flip/result/ending/replay screens, long text, unavailable actions, overlays and invalid saves. Check keyboard focus, reduced motion and relevant browser zoom. Open full-size viewport/detail images; don't infer visibility from file existence or scaled tall captures. Screenshots do not prove gameplay correctness. Update goldens only after intended images are inspected and independently accepted for that build; don't bless missing baselines or weaken comparison tolerances to turn tests green.

## Current evidence and remaining work

Latest presentation checkpoint: Forge grade chart reflow, typecheck, lint, build and 16 focused browser cases passed; independent tester accepted seven distinct cases across two batches and both reviewers accepted the bounded layout. The preceding Henrik correction passed 792 units; units were not rerun for this presentation-only section. Shared activation removed 21 net production lines; Henrik added 22. Grade-chart reflow added four style lines. Production text is 44,753 versus original 45,347; overall repository text remains larger because of types/tests/tooling/docs. Use consistent category counts, including mixed implementation/types, authored data and styles; exclude dependencies/generated output/ignored evidence. Relocation and documentation trimming are not production reduction.

Current requirement/evidence audit is in `docs/v2/verification.md`. Final current-build campaigns, broad interface verdict, platform visual baselines and final whole-rewrite acceptance remain unfinished. The prospective implementation reduction target is 27,577 lines (10% below original 30,642); current 28,138 leaves 561 lines and is not a met target. Documentation trimming is excluded. G-HS02 is closed for Henrik: explicit audience permission unlocks his Spring/Autumn buyer, refusal does not. Missing/null historical receipts retain old behavior. G-HR01 receipt/cache disagreements are rejected by writer and both readers. Other historical aliases remain qualified. Forge grade names are readable at normal/doubled root text at phone/desktop widths; full Ledger/Forge, native zoom and accessibility approval remain open. Raw descriptors/Proxies or contextual hardening proposals are not universal completion gates without an applicable requirement or concrete failure.

Next review remaining Hall aliases and complete the interface/audit priorities. Include at least 100 recorded seeded legal campaigns on final source when execution cost permits, supported difficulties/strategies, a genuine native 40-turn victory, real loss/restart, save/reload continuation and repaired cross-system paths. Keep managed fixtures separate. Completion requires accounted content, complete checked migration, credible suite/campaign results, inspected major surfaces, no unresolved P0/P1 or significant new P2, simpler architecture and honest metrics, compatible saves, coherent records and final independent tester/grader review.

## Durable records

- `docs/v2/baseline.md`: original isolation/runtime/census and baseline limits.
- `docs/v2/migration-ledger.md`: revision-scoped implementation history and findings.
- `docs/v2/verification.md`: actual checks, failures, review identity and current gate audit.
- `docs/v2/design.md`, `docs/v2/content-manifest.json`: decisions and original authored inventory.
- `docs/v2/checkpoint.md`: earlier repository handoff, not current acceptance.
- `artifacts/v2/<section>/`: ignored logs, traces, scripts, screenshots and reviewer reports.

Historical AGENTS checkpoint paragraphs remain recoverable from Git through `7363624`; don't append them back into this operational guide. Update current instructions/status here and keep detailed history in the durable records.
