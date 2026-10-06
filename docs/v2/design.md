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
