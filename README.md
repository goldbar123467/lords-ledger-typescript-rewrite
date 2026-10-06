# Lord's Ledger: TypeScript Rewrite

An incremental rewrite of The Lord's Ledger, a React game about managing a medieval estate over 40 seasons. This repository tracks the migration from JavaScript to strict TypeScript, gameplay repairs, interface improvements, and removal of redundant implementation code while preserving the game's authored content and choices.

**Status: work in progress.** Development resumed on 2026-10-02. The repository contains a working checkpoint, but the full TypeScript migration and final verification are incomplete. Start with the [checkpoint report](docs/v2/checkpoint.md) and [migration ledger](docs/v2/migration-ledger.md).

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
| React interface | Typed Market, Tavern companion, synergy notification, perspective-story, event-choice, continuation, Scribe's Note, tutorial, navigation, Dashboard and raid views; modal focus, resize-aware navigation and readable resource headers | Migrate app entry points and remaining views; complete interface review |
| Persistence | Validated v2 save boundary, explicit legacy import, saved random state, and regression coverage | Complete remaining nested subsystem validation and whole-game deterministic replay checks |
| Strategy synergies | Typed definitions, evaluator, and notification view; corrected requirements, rewards, counters, saved tier order, toast placement, and sequential announcements | Complete wider accessibility and natural higher-tier campaign coverage |
| Verification | Strict TypeScript checks for migrated files, unit tests, and scoped browser checks | Complete final browser, visual, campaign, and independent review gates |

The current compiler configuration uses `allowJs: true` and `checkJs: false`. Passing typecheck therefore covers migrated TypeScript, not the remaining JavaScript. Removing this migration allowance is part of completion.

The rewrite includes checked Outcome, Military, Watchtower, Chapel, People and Great Hall views, guarded domain commands and consumed save validation. The Hall shell preserves authored content with typed actions, readable meter labels and responsive navigation.

The rhythm minigame now uses strict TypeScript with explicit phase and result contracts. Its four difficulty lengths, selection/cancellation and paid results have scoped browser coverage. Responsive rhythm tracks, readable crafting states and pointer/Enter/Space play are implemented. The independently verified focus correction keeps Collect Item visible above the season footer during native keyboard navigation, including at 200% browser zoom. The main Blacksmith view also uses checked props, actions and saved-item contracts; its shared typography, named navigation and native confirmations are implemented. Independent review verifies the correction of enlarged navigation overlap, chart digit wrapping and phone category splitting. Transient ambient and bellows timer cleanup is verified, including repeated teardown and exact saves. Enlarged grade labels, controller simplification and wider interface checks remain unfinished.

Forge data preserves all 35 items, 20 facts, five buyers and seven supply events. Completion, owned-item actions, visits, Talk and known saved fields have checked contracts. Functional equipment counts exclude zero-bonus military items while preserving historical records and flat defense.

Plowshare and Scythe affect seasonal production; deployed Nails reduce Estate building and upgrade costs by 5%, rounded up to whole denarii. Estate output and construction quotes share their engine calculations. Item selection and deployment confirmation support keyboard use. Deployed Hinges & Fittings reduce seasonal building wear by 5%; Estate condition forecasts use the same calculation. The first working Church Bell deployment adds 8 Chapel faith, capped at 100; additional bells and reloads grant no extra faith. Deployed Lock & Key reduces raid coin losses by 5%, rounded up to whole denarii. A deployed Cauldron adds 3 Great Hall People approval per feast; shared previews and validated saved history record the bonus. Horseshoes adds 5% trade-good proceeds. A new balance rule limits Market and Forge purchases to a shared 100 units per good each season, persisted through Save/reload, to bound repeatable resale loops. A deployed Weather Vane shows conditional next-season farm potential, food needs and seasonal factors; it predicts no random events. A deployed Chandelier adds 3 prestige toward titles on the reputation path earned by rulings; moral scores stay unchanged. The scoped sections pass 332 unit tests, typecheck, lint and build, with independent browser checks of deployment, exact Save/reload and seasonal transitions. All ten tool effects have consumers. Combined integration passes for three seeds using paid commands and prescribed quality-50 crafting results, with browser trade and seasonal continuation. A final-strike counting defect is fixed, with native six-strike Dagger results, paid collection and store/equip/scrap verified, including independent wall-clock play. Native acquisition of all tools, longer minigames and broader Forge interface review remain unfinished.

Gambit owns all four reveal and feedback timeouts and cancels them when its view closes. The Load and Walk Away regressions and existing paid-round flows pass with exact saved-state checks.

Four source JavaScript/JSX files remain. Production has 44,280 lines versus the original 45,347, a reduction of 1,067 lines; tests and documentation increase the repository total. The full rewrite and final verification remain incomplete. See [verification notes](docs/v2/verification.md) for recorded builds and evidence limits.

Chronicle now uses checked readonly entry props and a shared saved-history contract. Malformed entries are rejected before loading; historical wording and compatible metadata survive exact saves. Prototype kind names render safely. Its wider interface review remains unfinished.

Map uses checked saved-state, building, seasonal and callback contracts while preserving authored artwork. The inherited missing Mill is corrected, with exhaustive slot coverage and eighteen passing browser cases including normal paid construction and exact saves. Crowded labels and wider Map interface checks remain unfinished.

Estate uses checked view, building, resource and command contracts. Its six content/management cases and 337 unit tests pass. Forge keyboard tests now follow native heading-to-Confirm navigation; all 42 Estate and tool-consumer browser checks pass. Purchased salt, tools and spices now appear in Estate inventory with paid purchase/reload coverage. Upkeep displays use actual military costs and building waivers, with fourteen focused browser checks passing. Estate now has brighter text, responsive grids, larger actions and native history disclosures, verified by 31 focused browser checks including native 200% zoom. The separately verified Condition row correction keeps enlarged text inside its card; broader Estate accessibility remains unfinished. Building saves now validate consumed data fields and boolean upkeep waivers, with 343 unit tests and thirteen focused browser cases passing. Broader serialization and save-schema checks remain incomplete.

Tavern content now has checked readonly state predicates and finite weapon, riddle, offer and encounter IDs. All 28 runtime initializers preserve their authored baseline, and 346 unit tests pass. The entry point now uses TSX and omits Analytics on recognized local-preview hosts. Seventeen production-browser checks pass with the original console-error assertions intact; independent reviewers confirm the local script failure is corrected. Hosted tracking remains untested.

The Bard view now has checked saved-content, answer callback and DOM-ref contracts. Twenty-one browser checks cover all five riddles, both answer outcomes, exact saves and reentry, with once-only reward coverage. Its authored content and styling are preserved; broader Bard readability and accessibility remain unfinished.

Knight's Gambit now uses checked TSX props and one discriminated stage instead of five separate game-state hooks. Thirteen browser checks cover every weapon pair, all stakes, paid replay, cancellation and the fifth round. Three cosmetic timer callbacks still need teardown cleanup; broader minigame UI review remains unfinished.

## Code map

| Location | Rewrite responsibility |
| --- | --- |
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

1. Migrate the remaining Tavern minigames and shell, then complete the app and reducer.
2. Continue reducing duplicated reducer logic and completing its state/action contracts.
3. Continue the reducer, view, content, test, and tooling migrations in committed sections.
4. Complete nested save validation, deterministic replay, interface review, and production-code reduction.
5. Run final verification, including genuine browser victory and loss/restart campaigns, before declaring the rewrite complete.

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
