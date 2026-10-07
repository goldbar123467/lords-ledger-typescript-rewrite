# Repository guidance

Follow [AGENTS.md](AGENTS.md) for the current rewrite workflow, boundaries, commands, reviewers and commit policy. This independent repository works on `main`; the original Lord's Ledger checkout remains protected. Update README with every coherent section and keep its Run locally section removed.

## Current implementation

The game retains React, Vite, Tailwind and a DOM interface. Players manage a medieval estate over 40 turns, with nine management tabs, Tavern/Watchtower/Hall interactions, minigames, events, raids, perspective stories, synergies and endings.

All first-party executable source, tests, configurations and tooling use checked TypeScript with `strict` and `noUncheckedIndexedAccess`. Runtime input/save integrity, interface review and final campaign acceptance are separate requirements; static coverage is not whole-rewrite completion.

- `src/App.tsx` owns phase presentation and browser integration.
- `src/engine/gameReducer.ts` integrates checked domain commands and the saved RNG cursor.
- Seasonal, Market, companion and flip transitions have separate pure owners. `synergyEngine.ts` shares activation receipts while callers retain reward timing.
- `src/data/` preserves authored IDs, effects, narratives and choices.
- `src/save/saveGame.ts` validates versioned/legacy saves; explicit import preserves original bytes.
- `src/components/` and `src/hooks/` own presentation and transient interactions.

## Engineering rules

Keep transitions immutable and random inputs explicit. Validate identities, quantities, phase and receipts before payment or rewards. Preserve supported historical defaults and read/write continuation. Do not invent narrative ID mappings or reduce game content to satisfy a line target.

Keep interfaces readable, responsive and keyboard operable. Inspect actual before/current images and obtain independent review before accepting golden changes. Maintain meaningful assertions, preserve first failures and record exact source/build evidence.

Current commands and checks are in AGENTS.md and package.json. Revision-scoped history is in `docs/v2/migration-ledger.md` and `docs/v2/verification.md`; older JavaScript architecture notes remain recoverable through Git `7363624`.
