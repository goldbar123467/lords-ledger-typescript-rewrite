/**
 * MarketSquare.tsx
 *
 * The Market Square replaces the old Trade tab.
 * Interactive merchant stalls, haggling system, foreign trader rotation,
 * reputation tracking, seasonal forecasts, and Quick Trade fallback.
 */

import { useState, useMemo, useLayoutEffect } from "react";
import { RESOURCE_CONFIG, BASE_SELL_PRICES, BASE_BUY_PRICES } from "../data/economy.ts";
import {
  LOCAL_MERCHANTS, FOREIGN_TRADERS,
  REPUTATION_CONFIG, getReputationTier,
  MARKET_SUBTITLES, MARKET_SCRIBES_NOTES,
  getForecasts,
} from "../data/market.ts";
import type { HaggleDifficulty, MarketEvent, MarketMerchantId, MarketResource, MarketSeason } from "../data/market.ts";
import { marketQuickSalePrice, marketTradePrice } from "../engine/marketHaggle.ts";
import type { HaggleMode } from "../engine/marketHaggle.ts";

interface MarketPrices {
  sell: Partial<Record<MarketResource, number>>;
  buy: Partial<Record<MarketResource, number>>;
}

interface ActiveHaggle {
  merchantId: MarketMerchantId;
  resource: MarketResource;
  quantity: number;
  fairPrice: number;
  currentOffer: number;
  round: number;
  maxRounds: number;
  mode: HaggleMode;
  status: 'open' | 'accepted' | 'final';
}

interface MarketViewState {
  season: MarketSeason;
  inventory: Partial<Record<MarketResource, number>>;
  inventoryCapacity: number;
  denarii: number;
  marketPrices: MarketPrices;
  market?: {
    reputation?: Partial<Record<MarketMerchantId, number>>;
    activeHaggle?: ActiveHaggle | null;
    activeMarketEvent?: MarketEvent | null;
    marketScribesNoteSeen?: boolean;
  };
  synergies?: { activated: string[] };
}

interface MerchantView {
  id: MarketMerchantId;
  name: string;
  quote: string;
  icon: string;
  accentColor: string;
  origin?: string;
  haggleDifficulty?: HaggleDifficulty;
  buys?: readonly MarketResource[];
  sells?: readonly MarketResource[];
  buysAtPremium?: readonly MarketResource[];
  sellsExclusive?: readonly MarketResource[];
  greetings?: readonly string[];
  haggleAccept?: readonly string[];
  haggleReject?: readonly string[];
  haggleFinal?: readonly string[];
}

type MarketAction =
  | { type: 'HAGGLE_START'; payload: { merchantId: MarketMerchantId; resource: MarketResource; quantity: number; mode: HaggleMode } }
  | { type: 'HAGGLE_COUNTER'; payload: { counterPrice: number } }
  | { type: 'HAGGLE_ACCEPT' | 'HAGGLE_WALK_AWAY' }
  | { type: 'SELL_RESOURCE' | 'BUY_RESOURCE'; payload: { resource: MarketResource; quantity: number; merchantId: MarketMerchantId } }
  | { type: 'SET_SCRIBES_NOTE'; payload: { text: string } };

interface MarketSquareProps {
  state: MarketViewState;
  dispatch: (action: MarketAction) => void;
  onSell: (resource: MarketResource, quantity: number) => void;
  onBuy: (resource: MarketResource, quantity: number) => void;
}

const resourceConfig: Readonly<Record<MarketResource, { icon: string; label: string }>> = RESOURCE_CONFIG;
const sellBasePrices: Readonly<Partial<Record<MarketResource, number>>> = BASE_SELL_PRICES;
const buyBasePrices: Readonly<Partial<Record<MarketResource, number>>> = BASE_BUY_PRICES;

function isMarketResource(value: string): value is MarketResource {
  return Object.hasOwn(resourceConfig, value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MarketHeader({ subtitle, marketEvent }: { subtitle: string; marketEvent: MarketEvent | null }) {
  return (
    <div className="text-center mb-4">
      <h2
        className="text-xl sm:text-2xl font-bold uppercase tracking-widest"
        style={{
          fontFamily: "Cinzel Decorative, Cinzel, serif",
          color: "#e8c44a",
          textShadow: "0 0 12px rgba(232, 196, 74, 0.3)",
          letterSpacing: "3px",
        }}
      >
        The Market Square
      </h2>
      <p
        className="mt-1 italic text-sm"
        style={{ color: "#a89070", fontFamily: "Crimson Text, serif" }}
      >
        &ldquo;{subtitle}&rdquo;
      </p>

      {marketEvent && (
        <div
          className="mt-3 mx-auto max-w-lg rounded-md px-4 py-2 market-banner-pulse"
          style={{
            backgroundColor: "#1a1610",
            border: `2px solid ${marketEvent.bannerColor || "#c4a24a"}`,
          }}
        >
          <p className="text-sm font-bold" style={{ fontFamily: "Cinzel, serif", color: marketEvent.bannerColor || "#c4a24a" }}>
            {marketEvent.title}
          </p>
          <p className="text-xs mt-1" style={{ color: "#a89070" }}>{marketEvent.description}</p>
        </div>
      )}
    </div>
  );
}

function PriceBoard({ marketPrices }: { marketPrices: MarketPrices }) {
  const sellEntries = Object.keys(BASE_SELL_PRICES).filter(isMarketResource);
  const buyOnlyEntries = Object.keys(BASE_BUY_PRICES).filter(isMarketResource).filter(
    res => !sellBasePrices[res]
  );

  function getTrend(resource: MarketResource, type: HaggleMode) {
    const base = type === "sell" ? sellBasePrices[resource] : buyBasePrices[resource];
    const current = type === "sell" ? marketPrices.sell?.[resource] : marketPrices.buy?.[resource];
    if (!base || !current) return null;
    const diff = current - base;
    if (diff > 0) return { arrow: "\u25B2", label: "Rising", color: type === "sell" ? "#4a8a3a" : "#c62828" };
    if (diff < 0) return { arrow: "\u25BC", label: "Falling", color: type === "sell" ? "#c62828" : "#4a8a3a" };
    return { arrow: "\u25CF", label: "Stable", color: "#6a5a42" };
  }

  return (
    <div
      data-testid="market-price-board"
      className="rounded-md p-3 mb-4"
      style={{ backgroundColor: "#231e16", border: "2px solid #6a5a42" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "#a89070", fontSize: "14px" }}>{"\u2734"}</span>
        <h4
          className="text-sm font-bold uppercase tracking-wider"
          style={{ fontFamily: "Cinzel, serif", color: "#c4a24a" }}
        >
          Prices This Season
        </h4>
        <span className="text-xs italic" style={{ color: "#6a5a42" }}>
          {"\u2014"} Posted by the Town Crier
        </span>
      </div>

      <div className="grid grid-cols-4 gap-x-3 text-xs mb-1 px-1" style={{ color: "#6a5a42", fontFamily: "Cinzel, serif", letterSpacing: "1px" }}>
        <span>Resource</span>
        <span className="text-center">Sell</span>
        <span className="text-center">Buy</span>
        <span className="text-center">Trend</span>
      </div>
      <div style={{ borderTop: "1px solid #3a3228" }} />

      <div style={{ maxHeight: "180px", overflowY: "auto" }}>
      {sellEntries.map(resource => {
        const cfg = resourceConfig[resource];
        const sellPrice = marketPrices.sell?.[resource];
        const buyPrice = marketPrices.buy?.[resource];
        const trend = getTrend(resource, "sell");
        return (
          <div key={resource} className="grid grid-cols-4 gap-x-3 py-1 px-1 items-center" style={{ borderBottom: "1px solid #1a1610" }}>
            <span className="flex items-center gap-1">
              <span style={{ color: "#a89070" }}>{cfg?.icon}</span>
              <span className="text-xs" style={{ color: "#c8b090" }}>{cfg?.label}</span>
            </span>
            <span className="text-center text-xs font-bold" style={{ fontFamily: "Cinzel, serif", color: "#4a8a3a" }}>
              {sellPrice ? `${sellPrice}d` : "\u2014"}
            </span>
            <span data-testid={`board-buy-${resource}`} className="text-center text-xs font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e06058" }}>
              {buyPrice ? `${buyPrice}d` : "\u2014"}
            </span>
            <span className="text-center text-xs" style={{ color: trend?.color || "#6a5a42" }}>
              {trend ? `${trend.arrow} ${trend.label}` : ""}
            </span>
          </div>
        );
      })}

      {buyOnlyEntries.map(resource => {
        const cfg = resourceConfig[resource];
        const buyPrice = marketPrices.buy?.[resource];
        return (
          <div key={resource} className="grid grid-cols-4 gap-x-3 py-1 px-1 items-center" style={{ borderBottom: "1px solid #1a1610" }}>
            <span className="flex items-center gap-1">
              <span style={{ color: "#a89070" }}>{cfg?.icon}</span>
              <span className="text-xs" style={{ color: "#c8b090" }}>{cfg?.label}</span>
            </span>
            <span className="text-center text-xs" style={{ color: "#6a5a42" }}>{"\u2014"}</span>
            <span data-testid={`board-buy-${resource}`} className="text-center text-xs font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e06058" }}>
              {buyPrice ? `${buyPrice}d` : "\u2014"}
            </span>
            <span className="text-center text-xs" style={{ color: "#6a5a42" }}>{"\u25CF"} Import</span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function YourWares({ inventory, inventoryCapacity }: { inventory: MarketViewState['inventory']; inventoryCapacity: number }) {
  const totalUsed = Object.values(inventory).reduce((s, v) => s + v, 0);
  const pct = Math.min(100, Math.round((totalUsed / inventoryCapacity) * 100));
  const barColor = pct > 90 ? "#c62828" : pct > 70 ? "#c4a24a" : "#4a8a3a";

  return (
    <div
      className="rounded-md p-3 mb-4"
      style={{ backgroundColor: "#231e16", border: "1px solid #6a5a42" }}
    >
      <h4
        className="text-sm font-bold uppercase tracking-wider mb-2"
        style={{ fontFamily: "Cinzel, serif", color: "#c4a24a" }}
      >
        Your Wares
      </h4>
      <div className="flex flex-wrap gap-2">
        {Object.entries(inventory).map(([resource, qty]) => {
          if (!isMarketResource(resource)) return null;
          const cfg = resourceConfig[resource];
          if (!cfg) return null;
          return (
            <span
              key={resource}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: qty > 0 ? "#1a1610" : "#0f0d0a",
                border: `1px solid ${qty > 0 ? "#6a5a42" : "#2a2318"}`,
                color: qty > 0 ? "#c8b090" : "#3a3228",
              }}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              <span className="font-bold" style={{ color: qty > 0 ? "#e8c44a" : "#3a3228" }}>{qty}</span>
            </span>
          );
        })}
      </div>
      <div className="mt-2">
        <div className="flex justify-between text-xs mb-1" style={{ color: "#6a5a42" }}>
          <span>Inventory</span>
          <span>{totalUsed}/{inventoryCapacity}</span>
        </div>
        <div className="w-full h-2 rounded-full" style={{ backgroundColor: "#0f0d0a" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
    </div>
  );
}

function SeasonalForecast({ season, state }: { season: MarketSeason; state: MarketViewState }) {
  const forecasts = useMemo(() => getForecasts(season, state), [season, state]);
  return (
    <div
      className="rounded-md p-3 mb-4"
      style={{ backgroundColor: "#231e16", border: "1px solid #1a3a6b" }}
    >
      <h4
        className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2"
        style={{ fontFamily: "Cinzel, serif", color: "#c4a24a" }}
      >
        <span>{"\u2197"}</span>
        Merchant&rsquo;s Forecast
      </h4>
      <ul className="space-y-1">
        {forecasts.map((f, i) => (
          <li key={i} className="text-xs italic" style={{ color: "#a89070" }}>
            {"\u2022"} {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReputationBar({ rep }: { rep: number }) {
  const tier = getReputationTier(rep);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-0.5">
        {REPUTATION_CONFIG.tiers.map((t, i) => {
          const active = rep >= t.min;
          return (
            <div
              key={i}
              style={{
                width: "6px", height: "6px", borderRadius: "50%",
                backgroundColor: active ? tier.color : "#2a2318",
                border: `1px solid ${active ? tier.color : "#3a3228"}`,
              }}
              title={`${t.label}: ${t.min}-${t.max}`}
            />
          );
        })}
      </div>
      <span className="text-xs" style={{ color: tier.color }}>{tier.label}</span>
    </div>
  );
}

function MerchantCard({ merchant, isForeign, reputation, onClick, marketEvent, lockedByHaggle }: {
  merchant: MerchantView;
  isForeign: boolean;
  reputation?: number;
  onClick: () => void;
  marketEvent: MarketEvent | null;
  lockedByHaggle: boolean;
}) {
  const rep = reputation ?? 50;
  const disabled = lockedByHaggle || (marketEvent?.effect?.noHaggling && !isForeign);
  const diffColor = {
    easy: "#4a8a3a",
    medium: "#c4a24a",
    hard: "#c62828",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="merchant-card rounded-lg p-4 text-center cursor-pointer border-2 w-full"
      style={{
        backgroundColor: "#231e16",
        borderColor: merchant.accentColor,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {isForeign && (
        <span
          className="inline-block text-xs px-2 py-0.5 rounded mb-2 trader-arrive"
          style={{
            backgroundColor: merchant.accentColor,
            color: "#e8c44a",
            fontFamily: "Cinzel, serif",
            letterSpacing: "1px",
          }}
        >
          VISITING TRADER
        </span>
      )}
      <div className="text-2xl mb-1" style={{ color: merchant.accentColor }}>{merchant.icon}</div>
      <h5
        className="text-sm font-bold uppercase tracking-wide"
        style={{ fontFamily: "Cinzel, serif", color: "#c8b090" }}
      >
        {merchant.name}
      </h5>
      <p className="text-xs italic mt-1" style={{ color: "#6a5a42" }}>
        &ldquo;{merchant.quote}&rdquo;
      </p>
      <div className="mt-2 text-xs" style={{ color: "#a89070" }}>
        {((merchant.buys?.length ?? 0) > 0 || (merchant.buysAtPremium?.length ?? 0) > 0) && (
          <p>Buys: {[...(merchant.buys || []), ...(merchant.buysAtPremium || [])].map(r => resourceConfig[r]?.label || r).join(", ")}</p>
        )}
        {((merchant.sells?.length ?? 0) > 0 || (merchant.sellsExclusive?.length ?? 0) > 0) && (
          <p>Sells: {[...(merchant.sells || []), ...(merchant.sellsExclusive || [])].map(r => resourceConfig[r]?.label || r).join(", ")}</p>
        )}
      </div>
      {!isForeign && merchant.haggleDifficulty && (
        <div className="mt-2 flex items-center justify-center gap-1">
          <span style={{ color: diffColor[merchant.haggleDifficulty] || "#c4a24a", fontSize: "8px" }}>{"\u25CF"}</span>
          <span className="text-xs uppercase" style={{ color: diffColor[merchant.haggleDifficulty] || "#c4a24a", letterSpacing: "1px" }}>
            {merchant.haggleDifficulty}
          </span>
        </div>
      )}
      <ReputationBar rep={rep} />
      <div
        className="mt-3 px-4 py-2 rounded text-xs font-bold uppercase tracking-wider"
        style={{
          backgroundColor: merchant.accentColor,
          color: "#0f0d0a",
          fontFamily: "Cinzel, serif",
        }}
      >
        Approach Stall
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Merchant Stall View (Haggling + Buy/Sell)
// ---------------------------------------------------------------------------

function MerchantStall({ merchant, isForeign, state, dispatch, onBack, marketEvent }: {
  merchant: MerchantView;
  isForeign: boolean;
  state: MarketViewState;
  dispatch: MarketSquareProps['dispatch'];
  onBack: () => void;
  marketEvent: MarketEvent | null;
}) {
  const { inventory, denarii, marketPrices, market } = state;
  const [mode, setMode] = useState<HaggleMode | null>(null);
  const [selectedResource, setSelectedResource] = useState<MarketResource | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [dealFlash, setDealFlash] = useState(false);

  const haggle = market?.activeHaggle?.merchantId === merchant.id ? market.activeHaggle : null;
  const isHaggling = !!haggle;
  const noHaggling = marketEvent?.effect?.noHaggling;

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [haggle]);

  // Resources this merchant deals in
  const buyableFromMerchant = [...(merchant.sells || []), ...(merchant.sellsExclusive || [])];
  const sellableToMerchant = [...(merchant.buys || []), ...(merchant.buysAtPremium || [])];

  function getEffectivePrice(resource: MarketResource, tradeMode: HaggleMode): number {
    return (tradeMode === "sell"
      ? marketQuickSalePrice(marketPrices, state.season, merchant.id, resource, state.synergies?.activated || [])
      : marketTradePrice(marketPrices, state.season, merchant.id, resource, tradeMode)) || 0;
  }

  function startHaggle() {
    if (!selectedResource || !mode || quantity <= 0) return;
    dispatch({
      type: "HAGGLE_START",
      payload: { merchantId: merchant.id, resource: selectedResource, quantity, mode },
    });
  }

  function handleCounter(price: number) {
    dispatch({ type: "HAGGLE_COUNTER", payload: { counterPrice: price } });
  }

  function handleAccept() {
    dispatch({ type: "HAGGLE_ACCEPT" });
    setDealFlash(true);
    setTimeout(() => setDealFlash(false), 600);
    setSelectedResource(null);
    setMode(null);
    setQuantity(1);
  }

  function handleWalkAway() {
    dispatch({ type: "HAGGLE_WALK_AWAY" });
    setSelectedResource(null);
    setMode(null);
    setQuantity(1);
  }

  function handleQuickTrade(resource: MarketResource, qty: number, tradeMode: HaggleMode) {
    dispatch({
      type: tradeMode === "sell" ? "SELL_RESOURCE" : "BUY_RESOURCE",
      payload: { resource, quantity: qty, merchantId: merchant.id },
    });
    setDealFlash(true);
    setTimeout(() => setDealFlash(false), 600);
  }

  // Pick a greeting (stable per mount)
  const [greeting] = useState(() => {
    const pool = merchant.greetings || ["Welcome, my lord."];
    return pool[Math.floor(Math.random() * pool.length)] ?? "Welcome, my lord.";
  });

  return (
    <div className={`w-full max-w-2xl mx-auto ${dealFlash ? "deal-flash" : ""}`}>
      {/* Merchant header */}
      <div className="text-center mb-4">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2"
          style={{
            backgroundColor: "#1a1610",
            border: `3px solid ${merchant.accentColor}`,
            fontSize: "28px",
            color: merchant.accentColor,
          }}
        >
          {merchant.icon}
        </div>
        <h3
          className="text-lg font-bold uppercase tracking-wider"
          style={{ fontFamily: "Cinzel, serif", color: "#c8b090" }}
        >
          {merchant.name}
        </h3>
        {isForeign && (
          <p className="text-xs" style={{ color: merchant.accentColor }}>
            From {merchant.origin} {"\u2022"} Available this season only
          </p>
        )}
        <ReputationBar rep={market?.reputation?.[merchant.id] ?? 50} />
      </div>

      {/* Merchant dialogue */}
      <MerchantDialogue
        isHaggling={isHaggling}
        haggle={haggle}
        merchant={merchant}
        greeting={greeting}
      />

      {/* Haggle interface */}
      {isHaggling && (
        <HaggleInterface
          haggle={haggle}
          merchant={merchant}
          onCounter={handleCounter}
          onAccept={handleAccept}
          onWalkAway={handleWalkAway}
          canFulfill={haggle.mode === "sell"
            ? (inventory[haggle.resource] || 0) >= haggle.quantity
            : denarii >= haggle.currentOffer * haggle.quantity}
        />
      )}

      {/* Mode selection (if not haggling) */}
      {!isHaggling && (
        <>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setMode("sell"); setSelectedResource(null); }}
              className="flex-1 py-2 rounded text-sm font-bold uppercase tracking-wider"
              style={{
                fontFamily: "Cinzel, serif",
                backgroundColor: mode === "sell" ? "#4a8a3a" : "#1a1610",
                border: `1px solid ${mode === "sell" ? "#2a5a2a" : "#6a5a42"}`,
                color: mode === "sell" ? "#e8c44a" : "#a89070",
                cursor: "pointer",
              }}
            >
              Sell to Merchant
            </button>
            <button
              onClick={() => { setMode("buy"); setSelectedResource(null); }}
              className="flex-1 py-2 rounded text-sm font-bold uppercase tracking-wider"
              style={{
                fontFamily: "Cinzel, serif",
                backgroundColor: mode === "buy" ? "#8b1a1a" : "#1a1610",
                border: `1px solid ${mode === "buy" ? "#5a1010" : "#6a5a42"}`,
                color: mode === "buy" ? "#e8c44a" : "#a89070",
                cursor: "pointer",
              }}
            >
              Buy from Merchant
            </button>
          </div>

          {/* Resource list */}
          {mode === "sell" && (
            <div className="space-y-2 mb-4">
              {sellableToMerchant.map(resource => {
                const qty = inventory[resource] || 0;
                const cfg = resourceConfig[resource];
                const price = getEffectivePrice(resource, "sell");
                if (!cfg) return null;
                const isPremium = isForeign && merchant.buysAtPremium?.includes(resource);
                return (
                  <div
                    key={resource}
                    data-testid={`merchant-sell-${resource}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md"
                    style={{ border: "1px solid #6a5a42", backgroundColor: "#1a1610" }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#a89070" }}>{cfg.icon}</span>
                      <div>
                        <span className="text-sm font-semibold" style={{ color: "#c8b090" }}>{cfg.label}</span>
                        <span className="text-xs ml-2" style={{ color: "#6a5a42" }}>({qty} in stock)</span>
                        {isPremium && <span className="text-xs ml-1" style={{ color: "#c4a24a" }}>{"\u2605"} Premium</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" title="Quick sale price including earned bonuses" style={{ fontFamily: "Cinzel, serif", color: "#64ad50" }}>{price}d</span>
                      {!noHaggling && qty > 0 && (
                        <button
                          onClick={() => { setSelectedResource(resource); setQuantity(Math.min(5, qty)); }}
                          className="px-3 py-1.5 rounded text-xs font-bold uppercase"
                          style={{
                            fontFamily: "Cinzel, serif",
                            backgroundColor: "#231e16",
                            border: "1px solid #c4a24a",
                            color: "#c4a24a",
                            cursor: "pointer",
                          }}
                        >
                          Haggle
                        </button>
                      )}
                      {/* Quick trade buttons */}
                      <div className="flex gap-1">
                        {[1, 5].map(amt => (
                          <button
                            key={amt}
                            disabled={qty < amt}
                            onClick={() => handleQuickTrade(resource, amt, "sell")}
                            aria-label={`Sell ${amt} ${cfg.label} for ${price * amt}d`}
                            className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                            style={{
                              fontFamily: "Cinzel, serif",
                              backgroundColor: qty >= amt ? "#4a8a3a" : "#2a2318",
                              border: qty >= amt ? "1px solid #2a5a2a" : "1px solid #3a3228",
                              color: qty >= amt ? "#e8c44a" : "#6a5a42",
                              cursor: qty >= amt ? "pointer" : "not-allowed",
                            }}
                          >
                            {amt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {sellableToMerchant.every(r => (inventory[r] || 0) === 0) && (
                <p className="text-sm italic text-center py-4" style={{ color: "#6a5a42" }}>
                  You have nothing this merchant wants to buy.
                </p>
              )}
            </div>
          )}

          {mode === "buy" && (
            <div className="space-y-2 mb-4">
              {buyableFromMerchant.map(resource => {
                const cfg = resourceConfig[resource];
                const price = getEffectivePrice(resource, "buy");
                if (!cfg || !price) return null;
                const canAfford1 = denarii >= price;
                const canAfford5 = denarii >= price * 5;
                return (
                  <div
                    key={resource}
                    data-testid={`merchant-buy-${resource}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md"
                    style={{ border: "1px solid #6a5a42", backgroundColor: "#1a1610" }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#a89070" }}>{cfg.icon}</span>
                      <span className="text-sm font-semibold" style={{ color: "#c8b090" }}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e06058" }}>{price}d</span>
                      {!noHaggling && canAfford1 && (
                        <button
                          onClick={() => { setSelectedResource(resource); setQuantity(1); }}
                          className="px-3 py-1.5 rounded text-xs font-bold uppercase"
                          style={{
                            fontFamily: "Cinzel, serif",
                            backgroundColor: "#231e16",
                            border: "1px solid #c4a24a",
                            color: "#c4a24a",
                            cursor: "pointer",
                          }}
                        >
                          Haggle
                        </button>
                      )}
                      <div className="flex gap-1">
                        <button
                          disabled={!canAfford1}
                          onClick={() => handleQuickTrade(resource, 1, "buy")}
                          aria-label={`Buy 1 ${cfg.label} for ${price}d`}
                          className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            fontFamily: "Cinzel, serif",
                            backgroundColor: canAfford1 ? "#8b1a1a" : "#2a2318",
                            border: canAfford1 ? "1px solid #5a1010" : "1px solid #3a3228",
                            color: canAfford1 ? "#e8c44a" : "#6a5a42",
                            cursor: canAfford1 ? "pointer" : "not-allowed",
                          }}
                        >
                          1
                        </button>
                        <button
                          disabled={!canAfford5}
                          onClick={() => handleQuickTrade(resource, 5, "buy")}
                          aria-label={`Buy 5 ${cfg.label} for ${price * 5}d`}
                          className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                          style={{
                            fontFamily: "Cinzel, serif",
                            backgroundColor: canAfford5 ? "#8b1a1a" : "#2a2318",
                            border: canAfford5 ? "1px solid #5a1010" : "1px solid #3a3228",
                            color: canAfford5 ? "#e8c44a" : "#6a5a42",
                            cursor: canAfford5 ? "pointer" : "not-allowed",
                          }}
                        >
                          5
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Haggle setup (when resource selected but haggle not started) */}
          {selectedResource && mode && !isHaggling && (
            <div
              className="rounded-md p-4 mb-4"
              style={{ backgroundColor: "#1a1610", border: `2px solid ${merchant.accentColor}` }}
            >
              <h5 className="text-sm font-bold mb-2" style={{ fontFamily: "Cinzel, serif", color: "#c4a24a" }}>
                Haggle: {resourceConfig[selectedResource]?.label}
              </h5>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs" style={{ color: "#a89070" }}>Quantity:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded text-sm font-bold"
                    style={{ backgroundColor: "#231e16", border: "1px solid #6a5a42", color: "#c8b090", cursor: "pointer" }}
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e8c44a" }}>{quantity}</span>
                  <button
                    onClick={() => {
                      const max = mode === "sell"
                        ? (state.inventory[selectedResource] || 0)
                        : Math.floor(denarii / (getEffectivePrice(selectedResource, "buy") || 1));
                      setQuantity(Math.min(max, quantity + 1));
                    }}
                    className="w-8 h-8 rounded text-sm font-bold"
                    style={{ backgroundColor: "#231e16", border: "1px solid #6a5a42", color: "#c8b090", cursor: "pointer" }}
                  >
                    +
                  </button>
                </div>
                {[1, 5, 10].map(amt => (
                  <button
                    key={amt}
                    onClick={() => {
                      const max = mode === "sell"
                        ? (state.inventory[selectedResource] || 0)
                        : Math.floor(denarii / (getEffectivePrice(selectedResource, "buy") || 1));
                      setQuantity(Math.min(max, amt));
                    }}
                    className="px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: "#231e16", border: "1px solid #6a5a42", color: "#a89070", cursor: "pointer" }}
                  >
                    {amt}
                  </button>
                ))}
              </div>
              <p className="text-xs mb-3" style={{ color: "#6a5a42" }}>
                Haggle reference: {marketTradePrice(marketPrices, state.season, merchant.id, selectedResource, mode) ?? 0}d each {"\u2022"} Total: {(marketTradePrice(marketPrices, state.season, merchant.id, selectedResource, mode) ?? 0) * quantity}d
              </p>
              {mode === "sell" && getEffectivePrice(selectedResource, mode) > (marketTradePrice(marketPrices, state.season, merchant.id, selectedResource, mode) ?? 0) && (
                <p className="text-xs mb-3" style={{ color: "#a89070" }}>Quick sale includes your earned trade bonuses; haggling begins at the seasonal quote.</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={startHaggle}
                  className="flex-1 py-2 rounded text-sm font-bold uppercase tracking-wider"
                  style={{
                    fontFamily: "Cinzel, serif",
                    backgroundColor: merchant.accentColor,
                    color: "#0f0d0a",
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  Begin Haggling
                </button>
                <button
                  onClick={() => { setSelectedResource(null); }}
                  className="px-4 py-2 rounded text-sm"
                  style={{ backgroundColor: "#231e16", border: "1px solid #6a5a42", color: "#a89070", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Back button */}
      <button
        onClick={onBack}
        className="w-full py-2 rounded text-sm font-bold uppercase tracking-wider mt-4"
        style={{
          fontFamily: "Cinzel, serif",
          backgroundColor: "#1a1610",
          border: "1px solid #6a5a42",
          color: "#a89070",
          cursor: "pointer",
        }}
      >
        {"\u2190"} Return to Market Square
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Haggle Interface
// ---------------------------------------------------------------------------

function HaggleInterface({ haggle, merchant, onCounter, onAccept, onWalkAway, canFulfill }: {
  haggle: ActiveHaggle;
  merchant: MerchantView;
  onCounter: (price: number) => void;
  onAccept: () => void;
  onWalkAway: () => void;
  canFulfill: boolean;
}) {
  const { resource, quantity, fairPrice, currentOffer, round, maxRounds, mode, status } = haggle;
  const cfg = resourceConfig[resource];

  // Slider range
  const minPrice = mode === "sell"
    ? Math.max(1, Math.round(fairPrice * 0.5))
    : Math.max(1, Math.round(fairPrice * 0.5));
  const maxPrice = mode === "sell"
    ? Math.round(fairPrice * 1.1)
    : Math.round(fairPrice * 1.5);

  const [sliderValue, setSliderValue] = useState(
    mode === "sell" ? Math.min(fairPrice, maxPrice) : Math.max(fairPrice, minPrice)
  );

  const totalAtOffer = currentOffer * quantity;
  const totalAtSlider = sliderValue * quantity;
  const isAccepted = status === "accepted";
  const isFinal = status === "final";

  return (
    <div
      className="rounded-md p-4 mb-4"
      style={{ backgroundColor: "#1a1610", border: `2px solid ${merchant.accentColor}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-bold" style={{ fontFamily: "Cinzel, serif", color: "#c4a24a" }}>
          Haggling: {quantity} {cfg?.label || resource}
        </h5>
        <span className="text-xs px-2 py-0.5 rounded" style={{
          backgroundColor: isFinal ? "#8b1a1a" : "#231e16",
          border: "1px solid #6a5a42",
          color: isFinal ? "#e8c44a" : "#a89070",
        }}>
          Round {round}/{maxRounds}{isFinal ? " \u2014 FINAL" : ""}
        </span>
      </div>

      {/* Price info */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="text-center p-2 rounded" style={{ backgroundColor: "#0f0d0a" }}>
          <p className="text-xs" style={{ color: "#6a5a42" }}>Market Price</p>
          <p className="text-lg font-bold" style={{ fontFamily: "Cinzel, serif", color: "#a89070" }}>{fairPrice}d</p>
        </div>
        <div className="text-center p-2 rounded" style={{ backgroundColor: "#0f0d0a", border: `1px solid ${merchant.accentColor}` }}>
          <p className="text-xs" style={{ color: "#6a5a42" }}>
            {isAccepted ? "DEAL!" : "Merchant\u2019s Offer"}
          </p>
          <p className="text-lg font-bold" style={{ fontFamily: "Cinzel, serif", color: isAccepted ? "#4a8a3a" : "#e8c44a" }}>{currentOffer}d</p>
        </div>
      </div>

      {isAccepted ? (
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: "#4a8a3a" }}>
            The merchant accepts your price! Total: {totalAtOffer}d
          </p>
          <button
            onClick={onAccept}
            disabled={!canFulfill}
            className="px-8 py-2 rounded text-sm font-bold uppercase tracking-wider"
            style={{
              fontFamily: "Cinzel, serif",
              backgroundColor: "#4a8a3a",
              border: "2px solid #2a5a2a",
              color: "#e8c44a",
              cursor: "pointer",
            }}
          >
            Complete Deal
          </button>
        </div>
      ) : (
        <>
          {/* Counter slider */}
          {!isFinal && (
            <div className="mb-3">
              <p className="text-xs mb-1" style={{ color: "#6a5a42" }}>Your Counter-Offer:</p>
              <input
                type="range"
                className="haggle-slider"
                min={minPrice}
                max={maxPrice}
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: "#6a5a42" }}>
                <span>{minPrice}d</span>
                <span className="font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e8c44a" }}>
                  {sliderValue}d each ({totalAtSlider}d total)
                </span>
                <span>{maxPrice}d</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {!isFinal && (
              <button
                onClick={() => onCounter(sliderValue)}
                className="flex-1 py-2 rounded text-sm font-bold uppercase tracking-wider"
                style={{
                  fontFamily: "Cinzel, serif",
                  backgroundColor: "#231e16",
                  border: "2px solid #c4a24a",
                  color: "#e8c44a",
                  cursor: "pointer",
                }}
              >
                Offer {sliderValue}d
              </button>
            )}
            <button
              onClick={onAccept}
              disabled={!canFulfill}
              className="flex-1 py-2 rounded text-sm font-bold uppercase tracking-wider"
              style={{
                fontFamily: "Cinzel, serif",
                backgroundColor: mode === "sell" ? "#4a8a3a" : "#8b1a1a",
                border: `2px solid ${mode === "sell" ? "#2a5a2a" : "#5a1010"}`,
                color: "#e8c44a",
                cursor: "pointer",
              }}
            >
              Accept {currentOffer}d ({totalAtOffer}d)
            </button>
            <button
              onClick={onWalkAway}
              className="px-4 py-2 rounded text-sm"
              style={{
                backgroundColor: "#1a1610",
                border: "1px solid #6a5a42",
                color: "#6a5a42",
                cursor: "pointer",
              }}
            >
              Walk Away
            </button>
          </div>
        </>
      )}
      {!canFulfill && (
        <p role="status" className="text-sm text-center mt-3" style={{ color: "#e8c44a" }}>
          {mode === "sell" ? "Not enough stock to complete this bargain." : "Not enough denarii to complete this bargain."}
        </p>
      )}
    </div>
  );
}

function MerchantDialogue({ isHaggling, haggle, merchant, greeting }: {
  isHaggling: boolean;
  haggle: ActiveHaggle | null;
  merchant: MerchantView;
  greeting: string;
}) {
  const [dialogueIndex] = useState(() => Math.floor(Math.random() * 100));

  let text = greeting;
  if (isHaggling && haggle) {
    const { round, status, currentOffer, mode } = haggle;
    if (status === "accepted") {
      const pool = merchant.haggleAccept || ["Deal!"];
      text = pool[dialogueIndex % pool.length] ?? "Deal!";
    } else if (status === "final") {
      const pool = merchant.haggleFinal || ["Last offer."];
      text = pool[dialogueIndex % pool.length] ?? "Last offer.";
    } else if (round === 1) {
      text = mode === "sell"
        ? `I can offer ${currentOffer}d per unit. Fair price for the season.`
        : `That'll be ${currentOffer}d per unit. Quality goods don't come cheap.`;
    } else {
      const pool = merchant.haggleReject || ["Hmm, let me think..."];
      text = (pool[dialogueIndex % pool.length] ?? "Hmm, let me think...") + ` How about ${currentOffer}d?`;
    }
  }

  return (
    <div
      className="rounded-md px-4 py-3 mb-4 quill-appear"
      style={{
        backgroundColor: "#1a1610",
        border: `1px solid ${merchant.accentColor}40`,
      }}
    >
      <p className="text-sm italic" style={{ color: "#a89070" }}>
        &ldquo;{text}&rdquo;
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Trade View (preserves old TradeTab UX)
// ---------------------------------------------------------------------------

const BUYABLE_HINTS: Readonly<Record<string, string>> = {
  salt: "Preserves food — boosts People each season (consumed on use)",
  tools: "Improves efficiency — boosts Treasury each season (consumed on use)",
  spices: "Church ceremonies — boosts Faith each season (consumed on use)",
};

function QuickTradeView({ state, onSell, onBuy, onBack }: {
  state: MarketViewState;
  onSell: MarketSquareProps['onSell'];
  onBuy: MarketSquareProps['onBuy'];
  onBack: () => void;
}) {
  const { inventory, denarii, marketPrices } = state;

  const sellableResources = Object.entries(inventory).filter((entry): entry is [MarketResource, number] => {
    const [res, qty] = entry;
    return isMarketResource(res) && qty > 0 && !!marketPrices.sell[res];
  });

  const buyableResources = Object.entries(marketPrices.buy).filter((entry): entry is [MarketResource, number] =>
    isMarketResource(entry[0]) && entry[1] > 0);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-4">
        <h3
          className="text-lg font-bold uppercase tracking-wider"
          style={{ fontFamily: "Cinzel, serif", color: "#c4a24a" }}
        >
          Quick Trade
        </h3>
        <p className="text-xs italic" style={{ color: "#6a5a42" }}>
          Trade at posted prices {"\u2014"} no haggling
        </p>
      </div>

      <div
        className="rounded-lg p-3 mb-4 text-center"
        style={{ backgroundColor: "#231e16", border: "1px solid #c4a24a" }}
      >
        <span className="text-lg font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e8c44a" }}>
          Treasury: {denarii}d
        </span>
      </div>

      {/* Sell */}
      <h4 className="text-base font-bold uppercase tracking-wider mb-2" style={{ fontFamily: "Cinzel, serif", color: "#4a8a3a" }}>
        Sell Goods
      </h4>
      {sellableResources.length === 0 ? (
        <p className="text-sm italic mb-4" style={{ color: "#6a5a42" }}>No goods to sell.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {sellableResources.map(([resource, qty]) => {
            const cfg = resourceConfig[resource];
            const price = marketQuickSalePrice(marketPrices, state.season, undefined, resource, state.synergies?.activated || []) || 0;
            return (
              <div key={resource} data-testid={`quick-sell-${resource}`} className="flex items-center justify-between gap-2 p-2.5 rounded-md" style={{ border: "1px solid #6a5a42", backgroundColor: "#1a1610" }}>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="shrink-0" style={{ color: "#a89070" }}>{cfg?.icon}</span>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: "#c8b090" }}>{cfg?.label}</span>
                    <span className="block text-xs" style={{ color: "#a89070" }}>({qty})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold" title="Quick sale price including earned bonuses" style={{ color: "#64ad50" }}>{price}d</span>
                  {[1, 5].map(amt => (
                    <button key={amt} disabled={qty < amt} onClick={() => onSell(resource, amt)}
                      aria-label={`Sell ${amt} ${cfg?.label || resource} for ${price * amt}d`}
                      className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                      style={{ fontFamily: "Cinzel, serif", backgroundColor: qty >= amt ? "#4a8a3a" : "#2a2318", border: qty >= amt ? "1px solid #2a5a2a" : "1px solid #3a3228", color: qty >= amt ? "#e8c44a" : "#6a5a42", cursor: qty >= amt ? "pointer" : "not-allowed" }}
                    >{amt}</button>
                  ))}
                  <button disabled={qty <= 0} onClick={() => onSell(resource, qty)}
                    aria-label={`Sell all ${qty} ${cfg?.label || resource} for ${price * qty}d`}
                    className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                    style={{ fontFamily: "Cinzel, serif", backgroundColor: qty > 0 ? "#4a8a3a" : "#2a2318", border: qty > 0 ? "1px solid #2a5a2a" : "1px solid #3a3228", color: qty > 0 ? "#e8c44a" : "#6a5a42", cursor: qty > 0 ? "pointer" : "not-allowed" }}
                  >All</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Buy */}
      <h4 className="text-base font-bold uppercase tracking-wider mb-2" style={{ fontFamily: "Cinzel, serif", color: "#e06058" }}>
        Buy Goods
      </h4>
      <div className="space-y-2 mb-4">
        {buyableResources.map(([resource, price]) => {
          const cfg = resourceConfig[resource];
          const canAfford1 = denarii >= price;
          const canAfford5 = denarii >= price * 5;
          return (
            <div key={resource} data-testid={`quick-buy-${resource}`} className="flex items-center justify-between p-2.5 rounded-md gap-2" style={{ border: "1px solid #6a5a42", backgroundColor: "#1a1610" }}>
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: "#a89070" }}>{cfg?.icon}</span>
                <div className="min-w-0">
                  <span className="text-sm font-semibold" style={{ color: "#c8b090" }}>{cfg?.label}</span>
                  {BUYABLE_HINTS[resource] && (
                    <p className="text-xs leading-snug" style={{ color: "#a89070" }}>{BUYABLE_HINTS[resource]}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold" style={{ color: "#e06058" }}>{price}d</span>
                <button disabled={!canAfford1} onClick={() => onBuy(resource, 1)}
                  aria-label={`Buy 1 ${cfg?.label || resource} for ${price}d`}
                  className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                  style={{ fontFamily: "Cinzel, serif", backgroundColor: canAfford1 ? "#8b1a1a" : "#2a2318", border: canAfford1 ? "1px solid #5a1010" : "1px solid #3a3228", color: canAfford1 ? "#e8c44a" : "#6a5a42", cursor: canAfford1 ? "pointer" : "not-allowed" }}
                >1</button>
                <button disabled={!canAfford5} onClick={() => onBuy(resource, 5)}
                  aria-label={`Buy 5 ${cfg?.label || resource} for ${price * 5}d`}
                  className="market-quick-action min-w-[44px] min-h-[44px] px-2 py-1 rounded text-xs font-semibold"
                  style={{ fontFamily: "Cinzel, serif", backgroundColor: canAfford5 ? "#8b1a1a" : "#2a2318", border: canAfford5 ? "1px solid #5a1010" : "1px solid #3a3228", color: canAfford5 ? "#e8c44a" : "#6a5a42", cursor: canAfford5 ? "pointer" : "not-allowed" }}
                >5</button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className="w-full py-2 rounded text-sm font-bold uppercase tracking-wider"
        style={{ fontFamily: "Cinzel, serif", backgroundColor: "#1a1610", border: "1px solid #6a5a42", color: "#a89070", cursor: "pointer" }}
      >
        {"\u2190"} Return to Market Square
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarketSquare({ state, dispatch, onSell, onBuy }: MarketSquareProps) {
  const { season, market, marketPrices, inventory, inventoryCapacity, denarii } = state;
  const [activeStation, setActiveStation] = useState<string | null>(null);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [activeStation]);

  const [subtitle] = useState(() =>
    MARKET_SUBTITLES[Math.floor(Math.random() * MARKET_SUBTITLES.length)] ?? ''
  );

  const foreignTrader = FOREIGN_TRADERS[season] || null;
  const marketEvent = market?.activeMarketEvent || null;
  const pendingHaggle = market?.activeHaggle;
  const pendingMerchant = pendingHaggle
    ? [...LOCAL_MERCHANTS, foreignTrader].find(merchant => merchant?.id === pendingHaggle.merchantId)
    : null;

  // If viewing a merchant stall
  if (activeStation === "quick_trade") {
    return (
      <QuickTradeView
        state={state}
        onSell={onSell}
        onBuy={onBuy}
        onBack={() => setActiveStation(null)}
      />
    );
  }

  if (activeStation) {
    const localMerchant = LOCAL_MERCHANTS.find(m => m.id === activeStation);
    const isForeign = activeStation === "foreign";
    const merchant = isForeign ? foreignTrader : localMerchant;
    if (!merchant) {
      setActiveStation(null);
      return null;
    }
    return (
      <MerchantStall
        merchant={merchant}
        isForeign={isForeign}
        state={state}
        dispatch={dispatch}
        onBack={() => setActiveStation(null)}
        marketEvent={marketEvent}
      />
    );
  }

  // Main Market Square view
  return (
    <div className="w-full max-w-3xl mx-auto">
      <MarketHeader subtitle={subtitle} marketEvent={marketEvent} />
      {pendingMerchant && (
        <div role="status" className="rounded-md p-3 mb-4 text-center" style={{ backgroundColor: "#231e16", border: "1px solid #c4a24a", color: "#e8c44a" }}>
          Finish your bargain with {pendingMerchant.name} before visiting another stall.
          <button className="block mx-auto mt-2 underline" onClick={() => setActiveStation(
            pendingMerchant.id === foreignTrader?.id ? "foreign" : pendingMerchant.id
          )}>Resume bargain</button>
        </div>
      )}

      {/* Top panels row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-2">
          <PriceBoard marketPrices={marketPrices} />
        </div>
        <div className="space-y-3">
          <YourWares inventory={inventory} inventoryCapacity={inventoryCapacity} />
          <SeasonalForecast season={season} state={state} />
        </div>
      </div>

      {/* Treasury display */}
      <div
        className="rounded-md p-2 mb-4 text-center"
        style={{ backgroundColor: "#231e16", border: "1px solid #c4a24a" }}
      >
        <span className="text-lg font-bold" style={{ fontFamily: "Cinzel, serif", color: "#e8c44a" }}>
          Purse: {denarii}d
        </span>
      </div>

      {/* Merchant stall cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {LOCAL_MERCHANTS.map(merchant => (
          <MerchantCard
            key={merchant.id}
            merchant={merchant}
            isForeign={false}
            reputation={market?.reputation?.[merchant.id]}
            lockedByHaggle={!!pendingMerchant && pendingMerchant.id !== merchant.id}
            onClick={() => setActiveStation(merchant.id)}
            marketEvent={marketEvent}
          />
        ))}
        {foreignTrader && (
          <MerchantCard
            merchant={foreignTrader}
            isForeign={true}
            reputation={market?.reputation?.[foreignTrader.id]}
            lockedByHaggle={!!pendingMerchant && pendingMerchant.id !== foreignTrader.id}
            onClick={() => setActiveStation("foreign")}
            marketEvent={marketEvent}
          />
        )}
      </div>

      {/* Quick Trade card */}
      <button
        onClick={() => setActiveStation("quick_trade")}
        className="w-full rounded-lg p-3 text-center merchant-card border"
        style={{
          backgroundColor: "#1a1610",
          borderColor: "#6a5a42",
          cursor: "pointer",
        }}
      >
        <span className="text-sm font-bold uppercase tracking-wider" style={{ fontFamily: "Cinzel, serif", color: "#a89070" }}>
          Quick Trade
        </span>
        <p className="text-xs mt-1" style={{ color: "#6a5a42" }}>
          Trade at posted prices {"\u2014"} no haggling
        </p>
      </button>

      {/* Scribe's note link */}
      {!market?.marketScribesNoteSeen && (
        <button
          onClick={() => dispatch({ type: "SET_SCRIBES_NOTE", payload: { text: MARKET_SCRIBES_NOTES.priceBoard } })}
          className="w-full text-center mt-3"
          style={{ color: "#6a5a42", fontSize: "11px", cursor: "pointer", background: "none", border: "none", textDecoration: "underline" }}
        >
          The Scribe has notes about medieval markets...
        </button>
      )}
    </div>
  );
}
