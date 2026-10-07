# Lord's Ledger: TypeScript Rewrite

An incremental rewrite of The Lord's Ledger, a React game about managing a medieval estate over 40 seasons. This repository tracks the migration from JavaScript to strict TypeScript, gameplay repairs, interface improvements, and removal of redundant implementation code while preserving the game's authored content and choices.

**Status: work in progress.** The latest verified section covers saved Market contracts, bookkeeping and banner validation. App and the main reducer still need checked TypeScript migration; final interface, save-schema and campaign verification remain incomplete. Follow the [migration ledger](docs/v2/migration-ledger.md) for current evidence and the [checkpoint report](docs/v2/checkpoint.md) for the earlier repository handoff.

## Rewrite goals

- Migrate first-party executable code, including the app, engine, content definitions, tests, and tooling, to TypeScript with `strict` and `noUncheckedIndexedAccess`.
- Give game state, actions, resources, and subsystem boundaries explicit contracts. Validate persisted data at runtime.
- Make random state explicit and saved so gameplay transitions can be reproduced and tested.
- Repair gameplay defects and improve readability, accessibility, and interaction across desktop and mobile.
- Reduce duplicate implementation while preserving narrative branches, historical notes, legal choices, and game difficulty.

The rewrite retains React, Vite, Tailwind CSS, and the existing DOM interface. CSS, HTML, JSON, and media remain in their native formats.

## Current progress

| Area | Included in the checkpoint | Remaining work |
| --- | --- | --- |
| Domain logic | Typed economy, resource effects, ending checks, raids, event selection, perspective-story evaluator, building actions, Market haggling, Feast, Watchtower, and Tavern helpers | Migrate the main reducer and remaining helpers; finish action and state contracts |
| Content definitions | Typed resource, building, Market, decree, military, raid, synergy, perspective-story, seasonal/random event, tab, and tutorial definitions; checked category/gate relationship | Complete registry cross-reference and runtime audits |
| React interface | Typed management and interaction views, including Estate, Map, Chronicle, Tavern, Bard, Gambit and Rats in the Cellar; checked entry, modal focus, resize-aware navigation and readable resource headers | Migrate App; complete interface review |
| Persistence | Validated v2 save boundary, explicit legacy import, saved random state, and regression coverage | Complete remaining nested subsystem validation and whole-game deterministic replay checks |
| Strategy synergies | Typed definitions, evaluator, and notification view; corrected requirements, rewards, counters, saved tier order, toast placement, and sequential announcements | Complete wider accessibility and natural higher-tier campaign coverage |
| Verification | Strict TypeScript checks for migrated files, unit tests, and scoped browser checks | Complete final browser, visual, campaign, and independent review gates |

The current compiler configuration uses `allowJs: true` and `checkJs: false`. Passing typecheck therefore covers migrated TypeScript, not the remaining JavaScript. Removing this migration allowance is part of completion.

The rewrite includes checked Outcome, Military, Watchtower, Chapel, People and Great Hall views, guarded domain commands and consumed save validation. The Hall shell preserves authored content with typed actions, readable meter labels and responsive navigation.

The rhythm minigame now uses strict TypeScript with explicit phase and result contracts. Its four difficulty lengths, selection/cancellation and paid results have scoped browser coverage. Responsive rhythm tracks, readable crafting states and pointer/Enter/Space play are implemented. The independently verified focus correction keeps Collect Item visible above the season footer during native keyboard navigation, including at 200% browser zoom. The main Blacksmith view also uses checked props, actions and saved-item contracts; its shared typography, named navigation and native confirmations are implemented. Independent review verifies the correction of enlarged navigation overlap, chart digit wrapping and phone category splitting. Transient ambient and bellows timer cleanup is verified, including repeated teardown and exact saves. Enlarged grade labels, controller simplification and wider interface checks remain unfinished.

Forge data preserves all 35 items, 20 facts, five buyers and seven supply events. Completion, owned-item actions, visits, Talk and known saved fields have checked contracts. Functional equipment counts exclude zero-bonus military items while preserving historical records and flat defense.

Plowshare and Scythe affect seasonal production; deployed Nails reduce Estate building and upgrade costs by 5%, rounded up to whole denarii. Estate output and construction quotes share their engine calculations. Item selection and deployment confirmation support keyboard use. Deployed Hinges & Fittings reduce seasonal building wear by 5%; Estate condition forecasts use the same calculation. The first working Church Bell deployment adds 8 Chapel faith, capped at 100; additional bells and reloads grant no extra faith. Deployed Lock & Key reduces raid coin losses by 5%, rounded up to whole denarii. A deployed Cauldron adds 3 Great Hall People approval per feast; shared previews and validated saved history record the bonus. Horseshoes adds 5% trade-good proceeds. A new balance rule limits Market and Forge purchases to a shared 100 units per good each season, persisted through Save/reload, to bound repeatable resale loops. A deployed Weather Vane shows conditional next-season farm potential, food needs and seasonal factors; it predicts no random events. A deployed Chandelier adds 3 prestige toward titles on the reputation path earned by rulings; moral scores stay unchanged. The scoped sections pass 332 unit tests, typecheck, lint and build, with independent browser checks of deployment, exact Save/reload and seasonal transitions. All ten tool effects have consumers. Combined integration passes for three seeds using paid commands and prescribed quality-50 crafting results, with browser trade and seasonal continuation. A final-strike counting defect is fixed, with native six-strike Dagger results, paid collection and store/equip/scrap verified, including independent wall-clock play. Native acquisition of all tools, longer minigames and broader Forge interface review remain unfinished.

Gambit owns all four reveal and feedback timeouts and cancels them when its view closes. The Load and Walk Away regressions and existing paid-round flows pass with exact saved-state checks.

Rats in the Cellar now has checked phase, result, rat-data, DOM-ref and timer-handle contracts. Real 20-second one-catch and zero-catch runs preserve scoring, saved RNG and once-per-season play. Rats and Gambit share a timeout owner that cancels pending callbacks when their views close.

Seven saved Tavern flags and counters have runtime checks, including descriptor checks before consumed getters can run. Malformed v2 and legacy imports preserve both existing storage slots. Tavern ledger arithmetic retains exact values beyond JavaScript's safe integer range using canonical decimal strings. Ordinary numeric saves retain their original bytes; the new large-value form requires an updated reader.

Two source JavaScript/JSX files remain: `src/App.jsx` and `src/engine/gameReducer.js`. The latest recorded census counts 44,809 production lines versus the original 45,347, a reduction of 538 lines. Production includes implementation, authored data, styles and type declarations. The inclusive text subtotal before that checkpoint's documentation updates is 78,295 versus the original 62,282; it includes tests, tooling, documentation and other tracked text. These are checkpoint measurements, not proof that the full code-reduction requirement is complete. See [verification notes](docs/v2/verification.md) for recorded builds and evidence limits.

Chronicle now uses checked readonly entry props and a shared saved-history contract. Malformed entries are rejected before loading; historical wording and compatible metadata survive exact saves. Prototype kind names render safely. Its wider interface review remains unfinished.

Map uses checked saved-state, building, seasonal and callback contracts while preserving authored artwork. The inherited missing Mill is corrected, with exhaustive slot coverage and eighteen passing browser cases including normal paid construction and exact saves. Crowded labels and wider Map interface checks remain unfinished.

Estate uses checked view, building, resource and command contracts. Its six content/management cases and 337 unit tests pass. Forge keyboard tests now follow native heading-to-Confirm navigation; all 42 Estate and tool-consumer browser checks pass. Purchased salt, tools and spices now appear in Estate inventory with paid purchase/reload coverage. Upkeep displays use actual military costs and building waivers, with fourteen focused browser checks passing. Estate now has brighter text, responsive grids, larger actions and native history disclosures, verified by 31 focused browser checks including native 200% zoom. The separately verified Condition row correction keeps enlarged text inside its card; broader Estate accessibility remains unfinished. Building saves now validate consumed data fields and boolean upkeep waivers, with 343 unit tests and thirteen focused browser cases passing. Broader serialization and save-schema checks remain incomplete.

Tavern content now has checked readonly state predicates and finite weapon, riddle, offer and encounter IDs. All 28 runtime initializers preserve their authored baseline, and 346 unit tests pass. The entry point now uses TSX and omits Analytics on recognized local-preview hosts. Seventeen production-browser checks pass with the original console-error assertions intact; independent reviewers confirm the local script failure is corrected. Hosted tracking remains untested.

The Bard view now has checked saved-content, answer callback and DOM-ref contracts. Twenty-one browser checks cover all five riddles, both answer outcomes, exact saves and reentry, with once-only reward coverage. Its authored content and styling are preserved; broader Bard readability and accessibility remain unfinished.

Knight's Gambit now uses checked TSX props and one discriminated stage instead of five separate game-state hooks. Thirteen browser checks cover every weapon pair, all stakes, paid replay, cancellation and the fifth round. Shared owned timeouts cancel all four Gambit callbacks on teardown; broader minigame UI review remains unfinished.

The Tavern shell now has checked station, saved-state, dispatch and child-callback contracts. All 362 unit checks and 27 focused browser cases pass, with independent tester/grader review. Authored content and normal save behavior are preserved. The hidden stash now supports native Enter/Space, a visible 44px target and stable found-state focus. Its four-second feedback timer is cancelled on Load/Leave, with seven regression cases and independent review. Broader interface and final campaign verification remain incomplete.

App save feedback and deferred season actions now use checked ownership hooks. Older success timers cannot erase newer errors or notices, and Load cancels queued season work. Seven regression cases, 23 existing persistence checks and independent review pass. The App and main reducer themselves remain unchecked pending migration.

The seeded constructor now has checked modern state/subsystem contracts and retains exact initialization/save bytes across 104 seed vectors and all difficulties. Native starts and managed restart entry points are independently verified. These are initialization tests, not campaigns; the main reducer, App and complete loaded-state contracts remain unfinished.

Seasonal and random event-choice settlement now uses checked TypeScript for resource effects, military reconciliation, history and ending checks. All 1,332 authored choice transitions retain complete state and save bytes across three seeds and all difficulties. The section passes 395 unit tests, static/build checks and four choice/Save/reload browser cases, with independent review. The inherited optional saved-event text gap is corrected below.

Save validation now checks consumed history, text lists, resource deltas, perspective metadata and pending/deferred synergy notifications. Malformed known fields are rejected by both readers and the writer; historical names, fractional values and unknown extensions retain their bytes. This closes a deferred notification queue crash during story continuation. The current section passes 390 unit tests, typecheck, lint, build, four browser rejection regressions and 28 existing persistence, lifecycle and initialization checks. Independent tester and grader reviews accept this scope. Complete save-schema validation remains unfinished.

Optional event notes, choice notes and choice summaries now reject malformed values before loading or settlement. Omitted, null, empty and historical text retain their save bytes and existing fallback behavior. The correction passes 435 unit tests, static/build checks, six browser rejection regressions and 32 supporting choice/persistence checks, with independent tester and grader review. Broader nested save and raw command validation remain unfinished.

Loaded seasonal and random events now have explicit saved-state contracts used by EventCard. Unsupported consumed indicator directions reject before rendering; historical empty labels and omitted notes retain their behavior and bytes. The section passes 452 unit tests, static/build checks and 41 browser scenarios, with independent review of the contract and compatibility. At that checkpoint, the App migration probe had 36 compiler diagnostics; this verified persistence and view boundaries without migrating App.

Loaded raids now have explicit bookkeeping, warning and result contracts. Malformed counters, flags, raid types and captured numeric metadata reject; omitted/null defaults and finite historical values stay intact. At checkpoint `44c462f`, all 521 unit tests, typecheck, lint and build pass. Three new raid persistence flows pass; the initial 28 integration scenarios have 24 passes and four failures from an older invalid Forge test fixture. The same four pass after the separately committed fixture repair, giving 31 distinct passing browser scenarios across the recorded batches. Independent tester and grader reviews accept this scope. An exploratory App migration probe still reports 34 diagnostics; production App and the reducer remain unchecked.

Saved Market prices and pending bargains now expose the types proved by their existing guards. Bookkeeping, event-history lists, banner text and the no-haggling flag reject malformed values before loading. Historical missing/null defaults, fractional counters and unknown extensions retain their save bytes and trade behavior. The section passes 590 unit tests, typecheck, lint, build and 16 Market browser scenarios, with independent tester and grader review. Complete Market provenance, arithmetic invariants and remaining save contracts are still pending.

## Code map

| Location | Rewrite responsibility |
| --- | --- |
| [src/engine/initialGameState.ts](src/engine/initialGameState.ts) | Checked seeded modern constructor; loaded-state and reducer contracts remain pending |
| [src/App.jsx](src/App.jsx) | Root state wiring and phase presentation; migration pending |
| [src/engine/](src/engine/) | Game transitions, domain rules, and deterministic random helpers |
| [src/data/](src/data/) | Authored content, resource IDs, and gameplay definitions |
| [src/components/](src/components/) | React views and local presentation state |
| [src/save/saveGame.ts](src/save/saveGame.ts) | Runtime save validation, versioned persistence, and legacy import |
| [tests/unit/](tests/unit/) | Domain and persistence regressions |
| [tests/e2e/](tests/e2e/) | Browser gameplay and visual checks |
| [docs/v2/](docs/v2/) | Baseline, decisions, migration status, and verification evidence |

The legacy save key is `lords-ledger-save`; the rewrite uses `lords-ledger-v2-save`. Legacy import is explicit and leaves the original bytes intact. Preserve this boundary as the remaining state contracts are migrated.

## Rewrite workflow and commit history

Follow [AGENTS.md](AGENTS.md) for the working rules. Each loop should cover one bounded migration section or review correction:

1. Inspect the authored rules, consumers, save shape, and existing tests.
2. Implement the change and verify the affected behavior. Inspect actual screenshots when presentation changes.
3. Update the migration ledger and verification notes with evidence and remaining issues.
4. **Commit after every loop or section, before starting the next one.** Include that section's code, tests, and documentation in a focused commit, then report its SHA. Mark incomplete checkpoints explicitly and record failed or pending checks.

Keep these commits separate so progress and regressions can be traced. A checkpoint commit records work; completion still requires the verification gates in `AGENTS.md`.

The original history is retained through baseline `47570f9`, with the rewrite checkpoint at `ee66330` and the repository-initialization merge at `9b561d9`. See the [commit history](https://github.com/goldbar123467/lords-ledger-typescript-rewrite/commits/main/).

## Next rewrite sections

1. Complete the remaining consumed Watchtower and other saved-state contracts, preserving supported historical defaults and save bytes.
2. Finish finite action contracts, migrate App and the main reducer to checked TypeScript, and simplify reducer orchestration.
3. Finish first-party test and executable tooling migration, then remove the temporary JavaScript compiler allowance.
4. Complete nested save validation, deterministic replay, interface and accessibility review, and production-code reduction.
5. Run final verification on the completed build, including at least 100 seeded campaigns, a genuine browser-driven 40-turn victory, and loss/restart and save/reload flows. Obtain final independent tester and grader review before declaring completion.

## Rewrite records

- [Checkpoint report](docs/v2/checkpoint.md): the preserved implementation state, checks, and known limits.
- [Migration ledger](docs/v2/migration-ledger.md): section status, decisions, and next actions.
- [Verification notes](docs/v2/verification.md): historical test and review evidence by recorded build.
- [Baseline](docs/v2/baseline.md): the starting implementation and measurements.
- [Design notes](docs/v2/design.md): the intended architecture.
- [Content manifest](docs/v2/content-manifest.json): baseline authored-content inventory.

Bulky browser and reviewer artifacts are kept in ignored local evidence directories; they are not committed to this repository. The tracked records identify their scope and limitations.

## License

[MIT](LICENSE), preserving the original contributor and rewrite copyright notices.
