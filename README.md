# Lord's Ledger: TypeScript Rewrite

An incremental rewrite of The Lord's Ledger, a React game about managing a medieval estate over 40 seasons. The rewrite preserves its authored content, narrative branches, economy, military, characters, and strategic choices while improving implementation, gameplay, and presentation.

**Status: in progress.** All first-party executable source, tests, configurations, and playtest tooling now use checked TypeScript under `strict` and `noUncheckedIndexedAccess`. The temporary JavaScript compiler allowance is removed. Architecture simplification, complete runtime validation, interface review, and final campaign verification remain unfinished.

The current requirement audit is recorded in [verification notes](docs/v2/verification.md). Browser discovery finds 820 cases in 146 files; this is not a passing full-suite result. Final-build seeded campaigns, platform visual approval and a consolidated interface verdict remain open.

## Rewrite goals

- Check all first-party executable code with TypeScript `strict` and `noUncheckedIndexedAccess`, including tests and tooling.
- Give state and commands explicit contracts; validate loaded saves and external inputs at runtime.
- Persist gameplay random state for reproducible transitions and replay.
- Repair gameplay defects and improve readability, keyboard interaction, and responsive layouts.
- Remove redundant implementation while preserving content, legal choices, difficulty, and save compatibility.

The project retains React, Vite, Tailwind CSS, and its DOM interface. CSS, HTML, JSON, and media stay in their native formats.

## Current implementation

The application calls the checked main reducer directly. Its command contract covers all 86 reducer tags. Seasonal processing, companion actions, Market actions, and flip lifecycle actions have separate checked owners. Companion selection and resolution preserve all eight authored offers. Posted and negotiated trades share settlement while retaining distinct fill rules and bargain receipts. Flip cleanup shares a fresh seven-field reset. Synergy activation shares receipt, chronicle and notification construction, with reward timing retained by each caller. The main reducer and remaining orchestration still need decomposition.

Versioned saves use `lords-ledger-v2-save`. Explicit legacy import reads `lords-ledger-save` without overwriting the original bytes. Consumed fields in several subsystem saves have runtime guards; complete nested-schema, phase, arithmetic, and command validation remain pending. Static types alone do not establish valid runtime state.

Gameplay corrections cover invalid event and flip-choice indices, difficulty values, donation arithmetic, sustained-counter overflow, fractional Market trades, and raid progression in browser drivers. Calendar advancement now requires the random-event stage to be resolved; it cannot skip a pending seasonal continuation. Detailed migration and compatibility evidence belongs in the [migration ledger](docs/v2/migration-ledger.md) and [verification notes](docs/v2/verification.md).

## Verified checkpoints and limits

These results belong to their recorded revisions. They are not a fresh full-suite result for every subsequent commit.

| Checkpoint | Recorded evidence | Remaining limit |
| --- | --- | --- |
| Difficulty validation (`6b9fba6`) | 747 unit tests, typecheck, lint, build, and five focused browser cases passed | Initialization and managed restart checks are not complete campaigns |
| Campaign driver (`56e53b7`) | 36 browser cases passed, including four native 40-turn victories and two famine losses followed by restart | Driver choices were unseeded; final completed-build campaign checks remain |
| Market assertions (`bdc587d`) | 23 browser cases passed; native paid trades check state changes and exact save/reload bytes | Fresh grain trades do not establish all pricing and interface rules |
| Visual audit (`607903d`) | Focused regressions passed; full visual suite: 50 passes and 13 failures | All 13 failures are missing Windows baselines; no new goldens were approved |
| QA migration (`973def9`) | Typecheck, lint, and four diagnostic cases passed; independent reviews accepted typing and artifact isolation | Its scope covered typing/artifacts; assertion defects were addressed in the later QA correction |
| QA assertion correction (`9b3c2a8`) | Typecheck and lint passed; four ordinary QA cases and five ending/stall cases passed across recorded batches | Endings use managed fixtures and native UI checks, not acquired campaigns or saved terminal snapshots; transport filtering and early report-loss paths remain |
| Root configurations (`49ce34f`) | Strict typecheck, lint, and build passed; all 35 output files preserve prior and served bytes, with independent review | Native lint loading was verified on Node 22.23.2 and ESLint 9.39.3; playtest bodies were outside this checkpoint's scope |
| Headless driver (`75631db`) | 770 unit tests, typecheck, and lint passed; 54 seeded scenarios repeated exactly across 108 executions, with independent review | These 31 victories and 23 losses verify selected driver policies; final completed-build and native campaign gates remain |
| Browser driver (`13ca781`) | 775 unit tests, typecheck, lint, build, and ten focused browser cases passed; six natural campaigns completed with two victories and four famine losses. Independent tester: eight browser cases and a Hard turn-40 victory | Managed action/card fixtures are not acquired campaigns; selected natural runs do not establish final campaign, full interface, or human usability acceptance |
| QA diagnostics (`fbd8c8f`) | 777 unit tests, typecheck, lint, and ten browser cases passed; independent tester passed eight cases | Reports retain failed requests and early exceptions. Expected media cancellation during a declared reload is recorded separately; complete failure attribution and interruption recovery remain unproved |
| Companion consolidation (`b9d43c5`) | 777 unit tests, typecheck, lint, and build passed; 81,168 old/new state comparisons and 65,664 save-output comparisons matched. Independent tester passed ten production browser cases; tester and grader accepted the bounded consolidation | Selecting an offer from an accepted save with omitted history could produce an unsavable state. The next checkpoint fixes that inherited defect; complete save closure remains unproved |
| Companion history correction (`8f866b1`) | 779 unit tests, typecheck, lint, and build passed; both native regressions failed before and passed after. Independent tester passed four browser cases and 46 write/read/resave cases; grader verified existing-state parity, closure and no-op behavior | G-CA01 is closed for both companions. Successful selection initializes omitted history without changing existing receipts or RNG behavior; broader runtime, interface and campaign gates remain |
| Market consolidation (`d76f593`) | 781 unit tests, typecheck, lint, build and 16 browser cases passed; 40,672 old/new state results and 37,552 save outputs matched. Independent tester passed 11 browser cases; both reviewers accepted bounded preservation | The inherited fractional pending-bargain defect found here is fixed in the next checkpoint; full Market, runtime and interface acceptance remains pending |
| Fractional Market correction (`c443190`) | 783 unit tests, typecheck, lint, build and eight browser cases passed at phone/laptop sizes. Independent tester passed nine cases; grader passed four and verified admitted-state save closure | G-MA01/G-MA02 are closed within scope. Bargains use whole units, fractional leftovers remain sellable, and stale quantity choices cannot start a deal. Wider numeric, UI and campaign gates remain |
| Phase continuation correction (`d85d82b`) | 787 unit tests, typecheck, lint, build and nine focused browser cases passed. Independent tester passed two browser cases and 361 state/save comparisons; grader passed 16 unit groups and 180 comparisons | G-PC01 is closed for premature calendar advancement. Historical seasonal-resolution saves still continue normally. Same-phase CYOA choices are new decisions; complete phase/provenance and final campaign checks remain |
| Browser fixture protocol (`5324590`) | Typecheck, lint and all 29 affected browser cases passed; independent tester passed five cases. Grader verified all 129 matcher calls and 93 selectors unchanged | Seven fixture sites now resolve the empty random stage before advancing. This repairs test setup after the phase guard; production bytes are unchanged. Managed fixtures are not acquired campaigns |
| Flip-choice input correction (`96ff0a1`) | 789 unit tests, typecheck, lint, build and seven focused browser cases passed. Independent tester passed four cases; both reviewers verified malformed-input rejection and valid-choice state/save/RNG preservation | G-FO01 is closed within raw index validation. Only numeric, nonnegative safe-integer indices can select available options; this does not establish contextual CYOA ownership or all narrative paths |
| Flip lifecycle consolidation (`595469c`) | 789 unit tests, typecheck, lint, build and 32 focused browser cases passed. Independent tester matched 7,172 save roundtrips across all nine stories and passed four browser cases; grader verified expanded case bodies and fresh-array ownership | Main reducer: 1,946 to 1,646 lines; new owner: 304 lines. Five reset literals and two recovery paths share cleanup, but total production text increased by four. Managed story fixtures are not campaigns |
| Shared synergy activation | 789 unit tests, typecheck, lint, build and 18 focused browser cases passed. Independent tester matched 1,150 state/save pairs and passed seven browser cases; grader checked all 21 tiers' receipt metadata | Removed 21 net production lines. Advancement retains all-active bonuses and next-season dates; story settlement retains new-only bonuses and deferred queues. Managed eligibility fixtures are not campaigns |

At the QA migration checkpoint, browser discovery found **789 tests across 140 files**. Discovery is not execution. Reports and screenshots use per-test paths, preserving historical evidence.

Migration replay matched 28,632 state/save pairs across 120 seeded campaigns against the preceding implementation. This demonstrates preservation for those policies, not fulfillment of the final campaign acceptance gate.

Production text measured **44,727 lines**, versus 45,347 at baseline. Market consolidation removed 143 net production lines; fractional trading added nine, flip index validation added one, flip lifecycle extraction added four, and shared synergy activation removed 21. Line totals also reflect comments and formatting. The prospective implementation target is **27,577 lines**, 10% below the original 30,642; current implementation is 28,120, leaving 543 lines before the target is met. This target is newly recorded after the audit found no earlier numeric target. The inclusive subtotal is **80,294 lines**, versus 62,282, including types, tests, tooling, documentation, and other tracked text. Documentation trimming is excluded from production reduction.

## Code map

| Location | Responsibility |
| --- | --- |
| [src/App.tsx](src/App.tsx) | Application state wiring, phase presentation, and browser integration |
| [src/engine/](src/engine/) | State transitions, domain rules, seasonal processing, and deterministic random helpers |
| [src/data/](src/data/) | Authored content, stable IDs, and gameplay definitions |
| [src/components/](src/components/) | React views and local presentation state |
| [src/save/saveGame.ts](src/save/saveGame.ts) | Save validation, versioned persistence, and explicit legacy import |
| [tests/unit/](tests/unit/) | Domain, contract, and persistence regressions |
| [tests/e2e/](tests/e2e/) | Browser gameplay, visual checks, and QA drivers |
| [vite.config.ts](vite.config.ts), [eslint.config.ts](eslint.config.ts) | Checked build and lint configuration |
| [playtest.ts](playtest.ts) | Seeded headless campaigns, six strategy profiles, transition invariants, and terminal reporting |
| [playwright-playtest.ts](playwright-playtest.ts), [tools/browserPlaytestOptions.ts](tools/browserPlaytestOptions.ts) | Native browser campaigns, six preserved personas, checked progression, isolated reports, and production-preview identity checks |
| [docs/v2/](docs/v2/) | Baseline, decisions, migration status, and verification records |

## Next rewrite sections

1. Correct Henrik welcome/refusal receipts and Spring buyer reachability, then reproduce and repair enlarged Forge grade labels. Continue runtime/save checks and meaningful duplication reduction; contextual CYOA ownership remains unproved.
2. Complete interface and accessibility review, independently approve platform visual baselines, and measure final code totals.
3. Verify the completed build with at least 100 genuine seeded campaigns, a native 40-turn victory, loss/restart, and save/reload flows. Obtain final independent tester and grader review.

## Rewrite workflow and history

Follow [AGENTS.md](AGENTS.md). Each bounded section includes implementation, appropriate checks, actual image inspection when presentation changes, independent review, and updated evidence.

**Commit after every loop or section before starting the next one.** Update this README with each section's verified status, remaining limits, and next action, alongside the detailed evidence records. Keep corrections in separate commits on this repository's `main`. A checkpoint records progress; it does not declare the rewrite complete.

The original history is retained through baseline `47570f9`, the rewrite checkpoint `ee66330`, and repository-initialization merge `9b561d9`. See the [commit history](https://github.com/goldbar123467/lords-ledger-typescript-rewrite/commits/main/).

## Rewrite records

- [Migration ledger](docs/v2/migration-ledger.md): current section status, decisions, and next actions.
- [Verification notes](docs/v2/verification.md): executed checks, failures, and independent review by recorded build.
- [Checkpoint report](docs/v2/checkpoint.md): the earlier repository handoff, with historical status.
- [Baseline](docs/v2/baseline.md), [design notes](docs/v2/design.md), and [content manifest](docs/v2/content-manifest.json).
- [QA process](QA.md): diagnostic profiles and their coverage limits.

Bulky browser and reviewer artifacts remain in ignored local evidence directories. Tracked records describe their scope and limitations.

## License

[MIT](LICENSE), preserving the original contributor and rewrite copyright notices.
