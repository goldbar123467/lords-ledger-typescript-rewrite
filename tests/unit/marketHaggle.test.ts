import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';
import { FOREIGN_TRADERS, LOCAL_MERCHANTS } from '../../src/data/market.ts';
import { marketQuickSalePrice, marketTradePrice } from '../../src/engine/marketHaggle.ts';

function marketStart() {
  return gameReducer(initialState, {
    type: 'START_GAME', payload: { difficulty: 'easy', seed: 17 },
  });
}

function authoredList(merchant: object, key: string): string[] {
  const value: unknown = Reflect.get(merchant, key);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

test('a haggle requires an actual merchant offering that resource and mode', () => {
  const started = marketStart();
  for (const payload of [
    { merchantId: 'invented', resource: 'grain', quantity: 1, mode: 'sell' },
    { merchantId: 'wulfric', resource: 'grain', quantity: 1, mode: 'sell' },
    { merchantId: 'edmund', resource: 'iron', quantity: 1, mode: 'buy' },
    { merchantId: 'bjorn', resource: 'timber', quantity: 1, mode: 'buy' },
  ]) {
    assert.strictEqual(gameReducer(started, { type: 'HAGGLE_START', payload }), started,
      JSON.stringify(payload));
  }
  const noHaggling = {
    ...started,
    market: { ...started.market, activeMarketEvent: { effect: { noHaggling: true } } },
  };
  assert.strictEqual(gameReducer(noHaggling, {
    type: 'HAGGLE_START', payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  }), noHaggling);
});

test('a counter outside the visible price range cannot change a pending haggle', () => {
  const started = marketStart();
  const pending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  });
  assert.notStrictEqual(pending, started);
  for (const counterPrice of [1_000_000_000, 1e308, Number.NaN, -1, 1.5]) {
    assert.strictEqual(gameReducer(pending, { type: 'HAGGLE_COUNTER', payload: { counterPrice } }), pending,
      String(counterPrice));
  }
});

test('a forged pending haggle in a save cannot mint money', () => {
  const started = marketStart();
  const pending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  });
  assert.equal(readV2Save(writeV2Save(pending)).ok, true);
  const envelope = JSON.parse(writeV2Save(pending));
  for (const damage of ['offer', 'merchant', 'resource']) {
    const corrupted = structuredClone(envelope);
    if (damage === 'offer') corrupted.state.market.activeHaggle.currentOffer = 1e308;
    if (damage === 'merchant') corrupted.state.market.activeHaggle.merchantId = 'invented';
    if (damage === 'resource') corrupted.state.market.activeHaggle.resource = 'spices';
    assert.equal(readV2Save(JSON.stringify(corrupted)).ok, false, damage);
  }
  const directForgery = {
    ...pending,
    market: { ...pending.market, activeHaggle: {
      ...pending.market.activeHaggle, currentOffer: 1e308,
    } },
  };
  assert.strictEqual(gameReducer(directForgery, { type: 'HAGGLE_ACCEPT' }), directForgery);
  const buyPending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'buy' },
  });
  const plausibleForgery = JSON.parse(writeV2Save(buyPending));
  plausibleForgery.state.market.activeHaggle.currentOffer += 1;
  assert.equal(readV2Save(JSON.stringify(plausibleForgery)).ok, false);
});

test('authored local and seasonal foreign trades survive pending save and settle once', () => {
  const started = marketStart();
  const local = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  });
  const loaded = readV2Save(writeV2Save(local));
  if (!loaded.ok) assert.fail(loaded.error);
  const offered = local.market.activeHaggle.currentOffer;
  const settled = gameReducer(loaded.state, { type: 'HAGGLE_ACCEPT' });
  assert.equal(settled.denarii, started.denarii + offered);
  assert.equal(settled.inventory.grain, started.inventory.grain - 1);
  assert.equal(settled.market.activeHaggle, null);
  assert.strictEqual(gameReducer(settled, { type: 'HAGGLE_ACCEPT' }), settled);
  const foreign = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'giovanni', resource: 'spices', quantity: 1, mode: 'buy' },
  });
  assert.notStrictEqual(foreign, started);
  assert.equal(readV2Save(writeV2Save(foreign)).ok, true);
  const countered = gameReducer(local, {
    type: 'HAGGLE_COUNTER', payload: { counterPrice: local.market.activeHaggle.fairPrice },
  });
  assert.notStrictEqual(countered, local);
  assert.equal(readV2Save(writeV2Save(countered)).ok, true);
});

test('a saved market price must be one of the season generator prices', () => {
  const started = marketStart();
  const envelope = JSON.parse(writeV2Save(started));
  for (const damage of ['huge', 'missing', 'extra']) {
    const corrupted = structuredClone(envelope);
    if (damage === 'huge') corrupted.state.marketPrices.sell.grain = 1e308;
    if (damage === 'missing') delete corrupted.state.marketPrices.sell.grain;
    if (damage === 'extra') corrupted.state.marketPrices.sell.invented = 3;
    assert.equal(readV2Save(JSON.stringify(corrupted)).ok, false, damage);
  }
});

test('every authored seasonal merchant offer can start a priced bargain', () => {
  const started = marketStart();
  for (const [index, [season, foreign]] of Object.entries(FOREIGN_TRADERS).entries()) {
    const seasonal = {
      ...started, season, turn: index + 1,
      market: { ...started.market, currentForeignTrader: season },
    };
    for (const merchant of [...LOCAL_MERCHANTS, foreign]) {
      const offers = [
        ...[...authoredList(merchant, 'sells'), ...authoredList(merchant, 'sellsExclusive')]
          .map(resource => ({ resource, mode: 'buy' })),
        ...[...authoredList(merchant, 'buys'), ...authoredList(merchant, 'buysAtPremium')]
          .map(resource => ({ resource, mode: 'sell' })),
      ];
      for (const offer of offers) {
        const state = { ...seasonal, inventory: { ...seasonal.inventory, [offer.resource]: 1 } };
        const next = gameReducer(state, {
          type: 'HAGGLE_START',
          payload: { merchantId: merchant.id, ...offer, quantity: 1 },
        });
        assert.equal(next.market.activeHaggle?.merchantId, merchant.id,
          `${season} ${merchant.id} ${offer.mode} ${offer.resource}`);
      }
    }
  }
});

test('a pending sale requires its promised stock and never overstates trade earnings', () => {
  const started = marketStart();
  const pending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 5, mode: 'sell' },
  });
  const shortStock = gameReducer(pending, {
    type: 'SELL_RESOURCE', payload: { resource: 'grain', quantity: 349 },
  });
  assert.equal(shortStock.inventory.grain, 1);
  assert.strictEqual(gameReducer(shortStock, { type: 'HAGGLE_ACCEPT' }), shortStock);
});

test('every pending haggle status rejects malformed merchant reputation', () => {
  const started = marketStart();
  const pending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  });
  const accepted = gameReducer(pending, {
    type: 'HAGGLE_COUNTER', payload: { counterPrice: pending.market.activeHaggle.fairPrice },
  });
  assert.equal(accepted.market.activeHaggle.status, 'accepted');
  const corrupted = JSON.parse(writeV2Save(accepted));
  corrupted.state.market.reputation.edmund = 'bad';
  assert.equal(readV2Save(JSON.stringify(corrupted)).ok, false);
});

test('merchant quick trades charge the posted authored quote, including premium sales and trade goods', () => {
  const started = marketStart();
  const clothPrice = marketTradePrice(started.marketPrices, 'spring', 'giovanni', 'cloth', 'sell');
  assert.ok(clothPrice);
  const withCloth = { ...started, inventory: { ...started.inventory, cloth: 2 } };
  const clothSale = gameReducer(withCloth, {
    type: 'SELL_RESOURCE', payload: { merchantId: 'giovanni', resource: 'cloth', quantity: 1 },
  });
  assert.equal(clothSale.denarii - withCloth.denarii, clothPrice);
  assert.equal(clothSale.inventory.cloth, 1);

  const woolPrice = marketTradePrice(started.marketPrices, 'spring', 'agnes', 'wool', 'buy');
  assert.ok(woolPrice);
  const woolBuy = gameReducer(started, {
    type: 'BUY_RESOURCE', payload: { merchantId: 'agnes', resource: 'wool', quantity: 1 },
  });
  assert.equal(started.denarii - woolBuy.denarii, woolPrice);
  assert.equal(woolBuy.inventory.wool, (started.inventory.wool || 0) + 1);

  assert.strictEqual(gameReducer(started, {
    type: 'BUY_RESOURCE', payload: { merchantId: 'edmund', resource: 'wool', quantity: 1 },
  }), started);
});

test('market reputation is valid even without a pending bargain and walk away cannot corrupt it', () => {
  const started = marketStart();
  const envelope = JSON.parse(writeV2Save(started));
  envelope.state.market.reputation.edmund = 'bad';
  assert.equal(readV2Save(JSON.stringify(envelope)).ok, false);
  envelope.state.market.reputation.edmund = null;
  assert.equal(readV2Save(JSON.stringify(envelope)).ok, false);

  const pending = gameReducer(started, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  });
  const corrupted = {
    ...pending,
    market: { ...pending.market, reputation: { ...pending.market.reputation, edmund: Number.NaN } },
  };
  assert.strictEqual(gameReducer(corrupted, { type: 'HAGGLE_WALK_AWAY' }), corrupted);
  const noPending = { ...corrupted, market: { ...corrupted.market, activeHaggle: null } };
  assert.strictEqual(gameReducer(noPending, {
    type: 'HAGGLE_START',
    payload: { merchantId: 'edmund', resource: 'grain', quantity: 1, mode: 'sell' },
  }), noPending);
});

test('quick-sale quote includes the exact active trade and wool synergy bonuses', () => {
  const started = marketStart();
  const activated = ['market_king_1', 'wool_baron_1', 'wool_baron_2'];
  const state = {
    ...started,
    inventory: { ...started.inventory, wool: 5 },
    synergies: { ...started.synergies, activated },
  };
  const base = marketTradePrice(state.marketPrices, state.season, 'agnes', 'wool', 'sell');
  const quote = marketQuickSalePrice(state.marketPrices, state.season, 'agnes', 'wool', activated);
  assert.ok(base);
  assert.equal(quote, base + 3);
  const sold = gameReducer(state, {
    type: 'SELL_RESOURCE', payload: { merchantId: 'agnes', resource: 'wool', quantity: 1 },
  });
  assert.equal(sold.denarii - state.denarii, quote);
  assert.equal(marketQuickSalePrice(state.marketPrices, state.season, undefined, 'grain', activated),
    (state.marketPrices.sell?.grain || 0) + 1);
});

test('a save rejects malformed or invented activated synergies before trade', () => {
  const envelope = JSON.parse(writeV2Save(marketStart()));
  for (const activated of ['', 'market_king_1', [42], ['invented'],
    ['market_king_1', 'market_king_1'], ['wool_baron_3'],
    ['wool_baron_1', 'wool_baron_3'], null]) {
    const damaged = structuredClone(envelope);
    damaged.state.synergies.activated = activated;
    assert.equal(readV2Save(JSON.stringify(damaged)).ok, false, JSON.stringify(activated));
  }
});

test('direct quick-sale actions cannot use invented or duplicated synergy bonuses', () => {
  const started = marketStart();
  for (const activated of [['invented'], ['market_king_1', 'market_king_1']]) {
    const corrupted = { ...started, synergies: { ...started.synergies, activated } };
    assert.equal(marketQuickSalePrice(corrupted.marketPrices, corrupted.season,
      undefined, 'grain', activated), null);
    assert.strictEqual(gameReducer(corrupted, {
      type: 'SELL_RESOURCE', payload: { resource: 'grain', quantity: 1 },
    }), corrupted);
  }
});
