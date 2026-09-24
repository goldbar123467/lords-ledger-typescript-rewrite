# 2.0 baseline, 2026-09-23

## Isolation and identity

Original checkout: `C:\Users\thecl\Documents\LordsLedger`, clean `main` at `47570f9caa5696c7369d88a42ae87171b78cd68b`. Local `main` and local tracking `origin/main` both resolve to that SHA. No fetch or rewrite was performed. Another existing worktree at `C:\Users\thecl\Documents\The-Lords-Ledger-2.0` on `refactor/typescript-2.0` has uncommitted and untracked work, so it was left untouched. This candidate is a fresh sibling worktree, `C:\Users\thecl\Documents\The-Lords-Ledger-v2`, branch `codex/lords-ledger-v2`, based on the same SHA. No local commits made.

## Reproducible baseline

- Node `v22.23.2`, npm `10.9.8`.
- `npm ci`: passed, 175 packages added. npm reported 10 audit findings; no dependency fix attempted during baseline.
- `npm run build`: passed, Vite 7.3.2, 1808 modules, 5.59 seconds.
- `npm run lint`: passed.
- `npx playwright test --list`: 109 discovered tests in 16 files, Chromium and gameplay projects. This is discovery, not execution.
- Independent browser baseline findings: `artifacts/v2/tester-baseline/report.md`. Existing baseline config hardcodes port 5173 and may reuse another server; baseline browser captures used the verified 5180 dev server with isolated contexts. A full baseline browser suite was not executed under a trustworthy isolated server.

## Consistent physical-line census

Count every physical line in each tracked first-party file in a category, including blank lines, comments, mixed implementation/types, and content. Exclude dependencies, build output, generated reports, and artifacts. Baseline categories: production implementation `src/` excluding `src/data/` and CSS: 47 files, 30,642 lines; authored content/data `src/data/`: 20 files, 13,566 lines; styles `src/index.css`: 1 file, 1,139 lines; executable tests `tests/`: 17 files, 3,585 lines; selected executable tooling (`playwright.config.js`, `vite.config.js`, `eslint.config.js`, `playtest.js`, `playwright-playtest.js`): 5 files, 1,879 lines. Inclusive measured subtotal: 50,811 lines. Documentation, HTML, and other tracked files need a final inclusive repository count under the same rules. The largest implementation hotspot is `src/engine/gameReducer.js` (over 4,000 physical lines); other large components include BlacksmithTab, MapTab, Watchtower, ForgingGame, GreatHall, MarketSquare, and EstateTab.

## Executed behavior and image evidence

The source implements nine tabs (Estate, Map, Market, Military, People, Hall, Chapel, Forge, Chronicle), Tavern/Watchtower subviews, Great Hall interactions, minigames, seasonal and random events, raids, perspective flips, synergies, endings, and 40-turn progression. This is an initial map; stable content IDs and scenario coverage need a machine-readable inventory.

Baseline images are under `artifacts/v2/baseline/`, captured from `http://127.0.0.1:5180/` at 1366x768 and 390x844 in separate new browser contexts. Title, nine tab views, and initial season click were captured. Images for title, Estate, and mobile were opened and inspected. The dark ink/gold/red visual language is distinctive. At 390px, the resource header collides and clips, nav labels crowd together, and controls overlap the right side. The title's difficulty choices fall below the initial 768px viewport. The initial Estate has a warning saying there is no food production although the resource summary shows seasonal income; investigate the selector before changing the warning. The baseline script's first season capture lands during the `Resolving...` animation, so an actual seasonal decision capture is still pending.

The independent tester reproduced a P1 malformed-save failure: legacy key value `{}` is reported `Loaded!` and produces an unusable game state. Reproduction and screenshot: `artifacts/v2/tester-baseline/`. The candidate save slice rejects this, with focused tests; independent retest of additional malformed event cases remains pending.
