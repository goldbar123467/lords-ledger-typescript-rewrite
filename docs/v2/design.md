# 2.0 visual brief

Keep the game's dark medieval ledger identity: charcoal/ink grounds, parchment text, restrained brass/gold emphasis, heraldic red actions, character and historical illustrations. The existing colors, typefaces, and authored prose are recognizable assets. Use decorative typography for headings and readable body type for decisions, costs, numbers, and long narrative.

First priority from opened baseline images: fit the seven dashboard resources at 390px without collision; make the active tab and unavailable action states legible; keep the season action visible without covering content. On a 1366x768 laptop, show the primary choice or useful action on first view and make long content scroll deliberately. Reuse a small set of tokens, surfaces, buttons, resource badges, status messages, and dialogs. Preserve distinctive treatments in Great Hall, Tavern, Chapel, Forge, and narrative screens.

Review matrix: every major surface at 1366x768; comparisons at 1280x720; targeted 1920x1080 and 390x844; keyboard focus, reduced motion, browser zoom, long text, low resources, and invalid saves. Open full-size before and after images, identify defects, revise, and capture again. Automated screenshot difference is change detection, not aesthetic approval.

## Agriculture tool semantics

Plowshare's authored food production +5% multiplies new food building/converter output and subsistence garden grain. Scythe's authored harvest speed +5% is interpreted as seasonal farm grain output +5%, since no continuous harvest timer exists. Both add before existing whole-unit rounding; stored resources are not multiplied. Capacity, input requirements and subsistence's existing storage behavior remain unchanged. Each working deployed type applies once; no duplicate stacking or grade multiplier. Scrap or quality below30 gives no utility, nullable historical quality defaults50. Deployment moves the original item using existing equipped storage, without a new save field or random draw. Estate potential output shares the simulation calculation before capacity/input limits, including existing synergies. This wires two of ten tool effects; remaining tools require separate consumers and reviewed interpretations before deployment UI.

## Construction Nails

A working known Nails item in equipped reduces Estate BUILD_BUILDING and UPGRADE_BUILDING quotes to ceil(authored cost×0.95) whole denarii. One type applies once; stored/broken/anonymous tools do not discount. Grade influences sale value but does not scale the fixed construction rate. Both eligibility and payment use the quote; card prices, action text and shortfalls agree. Existing repair/refund and building prerequisites/plots/limits retain their rules. Shared forgeTools.ts now owns working-tool eligibility and descriptions for the three implemented tool types, with agriculture domain helpers delegating to it. No new saved flag, normalized historical record or random draw is required.

## Hinges & Fittings

The authored building-quality5% is interpreted as5% less seasonal condition wear because buildings already start at100% condition. Apply this to the previously rounded wear and settle protected condition to hundredths; preserve old arithmetic without a working deployed tool. One type applies once, with existing shared quality/UID eligibility and no new save fields or RNG. Economy still uses starting condition before wear. Estate's after-wear forecast shares the helper and excludes future event damage. Fractional poor/ruined warnings now use the same50/25 thresholds as production; display avoids rounding into a healthier tier. This is an explicit new mechanic, not an archived interpretation.

## Church Bell installation

Interpret authored Faith+8 as a first working installation gain in Chapel faith, capped100, rather than a repeating seasonal source. Existing working equipped ownership is the receipt, so duplicates/reload/replay do not farm faith. Historical equipped Bells retain the current saved faith and suppress future installation gains; no retroactive repair reconstructs their history. Broken equipped Bells are not working receipts. Only first-installation Equip needs a valid Chapel record; finite faith0 is preserved, nullish command values default50 like existing Chapel consumers. Normal saved faith remains validated separately. No new saved counter, RNG or load migration is required.

## Lock & Key treasury security

Interpret authored Treasury security+5% as less nominal raid coin loss, after the original roll/difficulty/defense calculation and no-castle penalty. Ceil95% to whole denarii limits protection to at most5%; small losses may round back to their original amount. Apply one known working deployed type during resolution; preserve victories, all other outcomes and RNG draws. Saved pending results are authoritative, including older unprotected results, so Load/Continue never discount them again. Existing low-cash clamp and nominal total-loss ledger retain their semantics. Existing working-tool eligibility and item movement suffice; no saved receipt or normalization is needed.

## Cauldron feast quality

Interpret the unspecified authored quality bonus as3 Great Hall People approval per feast. One working deployed type applies once, after selected guest/entertainment/course/event effects, under existing meter caps. Running Total includes the same bonus before the event. Record optional cauldronBonus:3 only on new detailed boosted history, so validation can verify exact authored totals plus3. Older records omit this field and retain their prior totals; no inference or retroactive bonus from current equipped state. Reject malformed/inconsistent bonus markers and non-enumerable consumed fields. Preview reads the saved cursor without spending it; settlement keeps its one existing draw and seasonal receipt.

## Horseshoes proceeds and open market-cycle defect

The quarterly simulation has no travel timer. Interpret route speed as5% additional trade-good proceeds, shared across posted and negotiated totals, while preserving reference offers and reputation rules. Round only the bonus to hundredths. Existing working-tool eligibility avoids additional saved receipts. The interaction with MarketRegular creates a newly profitable repeatable buy/sell loop (R-FH01); this section is an incomplete checkpoint pending a separate market-cycle correction. Finite market rules must cover posted and negotiated paths, Save/reload and seasonal boundaries without relying on presentation-only restrictions.

## Finite shared seasonal purchase supply

R-FH01 and inherited purchase/resale loops are bounded by100 units per ResourceId per season, shared across merchants, Quick Trade and Forge. This is new provisional balance policy, not an authored limit; final campaigns must evaluate it. A price clamp would flatten legitimate bonuses, while separate merchant quotas would permit route switching. Supply keeps profitable commerce while limiting its volume. Persist optional current-turn purchase receipt only after actual buying; reset on actual ADVANCE_TURN, never Load or simulation. Missing legacy counts cannot be reconstructed and start full without rewriting the loaded state. Atomic purchases debit actual delivered units; Forge and haggles retain exact-quantity contracts. Sales do not restore supply. Validate owned plain/null-prototype maps and current turn to preserve counts through JSON. Pending terms remain authoritative and walk-awayable when supply is exhausted.

## Weather Vane seasonal planning

Interpret Season prediction as conditional information for the next authored calendar season. Display shared-calculation farm food potential at current condition/equipment/neighbour synergies, capped ration demand at current population/garrison/difficulty, and seasonal farm/wear factors. Do not spend RNG or promise actual future inventory, weather, hidden events or unchanged population/buildings. Storage and intervening wear are not simulated. Turn40 has no next season. Existing deployed working ownership suffices; no new receipt or saved forecast. Reject nonfinite computed results while preserving valid historical fractions. This adds a typed view/domain without pretending the surrounding Estate is migrated.

## Chandelier prestige and reputation

The Hall has earned moral scores and title thresholds, with no separate prestige meter. Interpret authored3 prestige as3 points toward titles on the already earned dominant path. Keep score tallies and tie ordering unchanged; decoration cannot invent a path before rulings. One working deployed type applies. First installation may refresh derived cached title/track, but preserves cached scores literally and preserves all cache data when history is absent. Older already-equipped lamps derive live title from history without rewriting saved cache on Load. Subsequent normal rulings/season advance use the same calculation. Public pitch export takes explicit optional0|3 prestige; its old default behavior remains. Use existing dispute-field validation to narrow exactly the consumed history. No new state receipt or speculative moral effect is needed.
