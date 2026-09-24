# Lord's Ledger: TypeScript Rewrite

An incremental rewrite of The Lord's Ledger, a React game about managing a medieval estate over 40 seasons. This repository tracks the migration from JavaScript to strict TypeScript, gameplay repairs, interface improvements, and removal of redundant implementation code while preserving the game's authored content and choices.

**Status: work in progress.** Development is currently paused. The repository contains a working checkpoint, but the full TypeScript migration and final verification are incomplete. Start with the [checkpoint report](docs/v2/checkpoint.md) and [migration ledger](docs/v2/migration-ledger.md).

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
| Domain logic | Typed economy, raids, event selection, building actions, Market haggling, Feast, Watchtower, and Tavern helpers | Migrate the main reducer and remaining helpers; finish action and state contracts |
| Content definitions | Typed resource, building, Market, decree, military-rule, and synergy definitions | Migrate the remaining registries and validate their references |
| React interface | Typed `MarketSquare.tsx` and `TavernCompanion.tsx`; targeted navigation, layout, and interaction repairs | Migrate the app entry points and most views; complete interface review |
| Persistence | Validated v2 save boundary, explicit legacy import, saved random state, and regression coverage | Complete nested subsystem validation and whole-game deterministic replay checks |
| Strategy synergies | Typed definitions and evaluator; corrections for live requirements, seasonal rewards, counters, saved tier order, and toast placement | Verify corrected behavior in the browser and obtain independent retests |
| Verification | Strict TypeScript checks for migrated files, unit tests, and scoped browser checks | Complete final browser, visual, campaign, and independent review gates |

The current compiler configuration uses `allowJs: true` and `checkJs: false`. Passing typecheck therefore covers migrated TypeScript, not the remaining JavaScript. Removing this migration allowance is part of completion.

The saved checkpoint passed typecheck, lint, production build, and **95 unit tests**. These results apply to that checkpoint; the latest synergy corrections still need browser verification and independent review. Historical results and their limits are recorded in [verification notes](docs/v2/verification.md). Measurable production-code reduction remains unfinished.

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

## Next work when development resumes

1. Verify synergy counter and reward timing across normal seasons and perspective flips.
2. Inspect the corrected notification at 390x844 and 1366x768, run affected save and gameplay browser tests, and obtain independent retests.
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

Bulky ignored browser and reviewer artifacts remain in the original local rewrite worktree; they are not included in this repository. The tracked records identify their scope and limitations.

## License

[MIT](LICENSE), preserving the original contributor and rewrite copyright notices.
