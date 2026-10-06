import {remainingMarketSupply} from "../engine/marketSupply.ts";
import {getDeployableTool, isWorkingTool, getToolDeploymentDescription, getBrokenToolDescription} from '../engine/forgeTools.ts';
import {countFunctionalEquipment, hasDefenseBonus} from '../engine/forgeReadiness.ts';
/**
 * BlacksmithTab.tsx
 *
 * Phase 1 — The Forge Itself
 * Phase 3 — Commission System, Armory, Storefront
 *
 * The darkest screen in the game. A soot-to-coal gradient background,
 * CSS-drawn forge hearth with 4 temperature states, anvil, ember particles,
 * NPC panels (Godric + Wat), weapon rack silhouettes, resource shelf,
 * internal navigation, and atmospheric cycling text.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type Dispatch, type ReactNode, type CSSProperties, type MouseEventHandler, useId } from "react";
import {
  Hammer, Swords, Shield, ClipboardList, Store,
  Wind, Check, X, Package, Coins, Trash2, ScrollText, AlertTriangle,
} from "lucide-react";

import {
  FORGE_COLORS,
  FORGE_TEMP_CONFIG,
  FORGE_RESOURCES,
  GODRIC_GREETINGS,
  WAT_IDLE,
  FORGE_AMBIENT_TEXTS,
  FORGE_VIEWS,
  BELLOWS_CONFIG,
  GODRIC_BELLOWS,
  RACK_SILHOUETTES,
  FORGEABLE_ITEMS,
  ITEM_CATEGORIES,
  QUALITY_GRADES,
  DIFFICULTY_DISPLAY,
  RESOURCE_MARKET,
  SCRAP_RECOVERY_RATE,
  getGodricRecommendation,
  getGodricTier,
  deriveGodricMood,
  GODRIC_MILITARY,
  getReadinessTier,
  pickWatFact,
  GODRIC_WAT_BANTER,
  getAvailableBuyers,
  getBuyerPrice,
  calculateForgeReadiness,
} from "../data/blacksmith";
import ForgingGame, {type ForgingResult} from "./ForgingGame";
import {useHallReadingFocus} from "../hooks/useHallReadingFocus.ts";
import type {ForgeSaveState, ForgeSavedItem} from "../engine/forgeState.ts";
import type {ForgeAncillaryCommand} from "../engine/forgeAncillaryActions.ts";
import type {ForgeItemCommand} from "../engine/forgeItemActions.ts";
import type {ForgeCompletionCommand} from "../engine/forgeCompletion.ts";
import type {ForgeResourceId, ForgeCategory, ForgeSeason, ForgeTemperature, ForgeBuyerDefinition, ForgeBuyerId, ForgeBuyerState, ForgeSupplyDefinition, ForgeGrade} from "../data/blacksmith.ts";
import type {ResourceId} from "../data/economy.ts";
import { planForgeCompletion } from "../engine/forgeCompletion.ts";
import {getForgeResourceQuote, getForgeSupplyStatus, planForgeTalk} from "../engine/forgeAncillaryActions.ts";

import {createRandomCursor, isRandomState, seedLegacySnapshot} from '../engine/random.ts';

type ForgeView = typeof FORGE_VIEWS[number]['id'] | 'forge_result';
type ForgeRecipe = ForgingResult['item'];
type ForgeResources = Readonly<Record<ForgeResourceId, number>>;
type ForgeAction = ForgeAncillaryCommand | ForgeItemCommand |
  {type:'BLACKSMITH_FORGE_COMPLETE'; payload:ForgeCompletionCommand} |
  {type:'BLACKSMITH_VISIT' | 'BLACKSMITH_TALK'};
type ForgeDispatch = Dispatch<ForgeAction>;
type Destination = 'equip' | 'sell' | 'scrap' | 'store';
interface LocalForgeState {
  temperature:ForgeTemperature; bellowsCharge:number; bellowsCooldown:boolean; fuelLevel:number; isLit:boolean;
}
interface BlacksmithViewState extends ForgeBuyerState {
  readonly phase:string; readonly turn:number; readonly year:number; readonly season:ForgeSeason;
  readonly denarii:number; readonly inventory:Readonly<Record<ResourceId,number>>;
  readonly blacksmith:ForgeSaveState; readonly garrison:number; readonly rngState?:number; readonly market?:unknown;
}
interface CollectedResult {readonly item:ForgeRecipe; readonly grade:ForgingResult['grade']; readonly qualityScore:number; readonly itemUid:number}
type RespectTier = ReturnType<typeof getGodricTier>;
type Banter = typeof GODRIC_WAT_BANTER[number];
type WatFact = ReturnType<typeof pickWatFact>;
interface WorkshopProps {
  forgeState:LocalForgeState; resources:ForgeResources; godricGreeting:string|undefined; watBehavior:string|undefined;
  onPumpBellows:()=>void; respect:number; tier:RespectTier; militaryLine?:string|null;
  onGodricTalk:()=>void; watFact:WatFact; onWatTalk:()=>void; banter:Banter|null|undefined;
}
/** Historical saved grade wording is retained; unknown labels use the existing Standard appearance. */
function gradeDefinition(grade:string) {
  return Object.entries(QUALITY_GRADES).find(([name])=>name===grade)?.[1] ?? QUALITY_GRADES.Standard;
}
function isGrade(value:string):value is ForgeGrade {return Object.hasOwn(QUALITY_GRADES,value);}
function materialAmount(resources:ForgeResources,key:string):number {
  const material=FORGE_RESOURCES.find(resource=>resource.key===key);
  return material ? resources[material.key] : 0;
}

/** Bright text tones preserve semantic cues on the Forge's coal surfaces. */
const FORGE_TEXT_TONES:Readonly<Record<string,string>>={
    '#5a5550':'var(--forge-muted)', '#4a4030':'var(--forge-muted)', '#6a5a4a':'var(--forge-muted)',
    '#8a7a5a':'var(--forge-muted)', '#a89070':'var(--forge-muted)', '#a89050':'var(--forge-gold)',
    '#c8b090':'var(--forge-text)', '#8a9098':'var(--forge-steel)', '#6a8a5a':'var(--forge-success)',
    '#6a9a5a':'var(--forge-success)', '#c86040':'var(--forge-danger)', '#c62828':'var(--forge-danger)',
    '#d4a820':'var(--forge-gold)', '#ffd700':'var(--forge-gold)', '#ff6b1a':'var(--forge-ember)',
    '#cc5500':'var(--forge-ember)', '#ff4500':'var(--forge-ember)', '#4a3a2a':'var(--forge-muted)',
    '#8a8a8a':'var(--forge-steel)', '#c0c0c0':'var(--forge-steel)', '#ffcc00':'var(--forge-gold)'
};
function forgeTextColor(color:string|undefined):string {
  return FORGE_TEXT_TONES[color??''] ?? 'var(--forge-text)';
}

// ─── View icon mapping ──────────────────────────────────────────
const VIEW_ICONS = {
  workshop:   Hammer,
  forging:    Swords,
  armory:     Shield,
  orders:     ClipboardList,
  storefront: Store,
  ledger:     ScrollText,
};

// ─── Ember Particles ────────────────────────────────────────────

// Pre-computed ember positions (deterministic, avoids Math.random in render)
const EMBER_POSITIONS = Array.from({ length: 16 }, (_, i) => ({
  left: 35 + ((i * 17 + 7) % 30),
  delay: (i * 0.3) + ((i * 13) % 5) * 0.1,
  duration: 2 + ((i * 7) % 15) * 0.1,
  size: 2 + ((i * 11) % 30) * 0.1,
}));

function EmberParticles({ active, intensity = "normal" }: {active:boolean; intensity?:ForgeTemperature|"normal"}) {
  if (!active) return null;
  const count = intensity === "hot" ? 12 : intensity === "white-hot" ? 16 : 8;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "30%",
        right: "30%",
        height: "60%",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 2
      }}
    >
      {EMBER_POSITIONS.slice(0, count).map((pos, i) => (
        <div
          key={i}
          className="forge-ember"
          style={{
            position: "absolute",
            bottom: 0,
            left: `${pos.left}%`,
            width: pos.size,
            height: pos.size,
            borderRadius: "50%",
            backgroundColor: FORGE_COLORS.sparkYellow,
            boxShadow: `0 0 ${pos.size + 2}px ${pos.size}px rgba(255, 215, 0, 0.5)`,
            animationDelay: `${pos.delay}s`,
            animationDuration: `${pos.duration}s`
          }}
        />
      ))}
    </div>
  );
}

// ─── Forge Hearth ───────────────────────────────────────────────

function ForgeHearth({ temperature, onPumpBellows, bellowsCharge, bellowsCooldown }: Pick<LocalForgeState,"temperature"|"bellowsCharge"|"bellowsCooldown"> & {onPumpBellows:()=>void}) {
  const tempConfig = FORGE_TEMP_CONFIG[temperature] || FORGE_TEMP_CONFIG.cold;
  const isLit = temperature !== "cold";

  return (
    <div style={{ position: "relative", marginTop: 12 }}>
      {/* Hearth structure */}
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          margin: "0 auto",
          height: 90,
          borderRadius: "8px 8px 4px 4px",
          background: isLit
            ? `linear-gradient(180deg, #3a3632 0%, #2a2420 40%, ${FORGE_COLORS.coalRed} 80%, ${FORGE_COLORS.emberDim} 100%)`
            : `linear-gradient(180deg, ${FORGE_COLORS.iron} 0%, #2a2420 60%, #1a1510 100%)`,
          border: `1px solid ${isLit ? "rgba(255,107,26,0.3)" : "#2a2420"}`,
          boxShadow: isLit
            ? `0 0 ${tempConfig.glowSize}px ${tempConfig.glowColor}, inset 0 -10px 30px rgba(255,69,0,0.15)`
            : "none",
          position: "relative",
          overflow: "hidden",
          transition: "all 800ms ease"
        }}
      >
        {/* Fire core glow */}
        {isLit && (
          <div
            className="forge-fire-pulse"
            style={{
              position: "absolute",
              bottom: 0,
              left: "20%",
              right: "20%",
              height: "70%",
              background: `radial-gradient(ellipse at center bottom, ${tempConfig.glowColor} 0%, transparent 70%)`,
              pointerEvents: "none"
            }}
          />
        )}

        {/* Coal bed texture */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 30,
            background: isLit
              ? `repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,107,26,0.1) 8px, rgba(255,107,26,0.1) 10px)`
              : `repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(58,54,50,0.3) 8px, rgba(58,54,50,0.3) 10px)`
          }}
        />

        {/* Temperature label */}
        <div className="forge-caption"
          style={{position: "absolute", top: 8, left: 12, color:forgeTextColor(isLit ? FORGE_COLORS.emberCore : "#5a5550")}}
        >
          {tempConfig.label}
        </div>

        {/* Hearth label */}
        <div className="forge-caption"
          style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: "center",
            color:forgeTextColor(isLit ? "rgba(255,107,26,0.6)" : "#3a3632")
          }}
        >
          The Forge Hearth
        </div>

        {/* Ember particles inside hearth */}
        <EmberParticles
          active={isLit}
          intensity={temperature === "white-hot" ? "white-hot" : temperature === "hot" ? "hot" : "normal"}
        />
      </div>

      {/* Bellows */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          marginTop: 10
        }}
      >
        <button
          onClick={onPumpBellows}
          disabled={bellowsCooldown}
          className={bellowsCooldown ? "forge-caption" : "forge-caption forge-bellows-squeeze"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            border: `1px solid ${bellowsCooldown ? "#2a2420" : FORGE_COLORS.emberDim}`,
            borderRadius: 4,
            backgroundColor: bellowsCooldown ? "rgba(26,21,16,0.5)" : "rgba(139,58,0,0.15)",
            color:forgeTextColor(bellowsCooldown ? "#5a5550" : FORGE_COLORS.emberCore),
            cursor: bellowsCooldown ? "not-allowed" : "pointer",
            transition: "all 200ms ease"
          }}
          onMouseEnter={(e) => {
            if (!bellowsCooldown) {
              e.currentTarget.style.backgroundColor = "rgba(255,107,26,0.15)";
              e.currentTarget.style.borderColor = FORGE_COLORS.emberCore;
            }
          }}
          onMouseLeave={(e) => {
            if (!bellowsCooldown) {
              e.currentTarget.style.backgroundColor = "rgba(139,58,0,0.15)";
              e.currentTarget.style.borderColor = FORGE_COLORS.emberDim;
            }
          }}
        >
          <Wind size={14} />
          Pump Bellows
        </button>

        {/* Bellows charge meter */}
        <div style={{ flex: "0 0 80px" }}>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              overflow: "hidden",
              backgroundColor: "#1a1510",
              border: "1px solid #2a2420"
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${bellowsCharge}%`,
                borderRadius: 3,
                backgroundColor:
                  bellowsCharge > 80
                    ? FORGE_COLORS.emberHot
                    : bellowsCharge > 40
                    ? FORGE_COLORS.emberCore
                    : FORGE_COLORS.emberDim,
                transition: "width 300ms ease, background-color 300ms ease",
                boxShadow:
                  bellowsCharge > 60
                    ? `0 0 6px ${FORGE_COLORS.emberCore}60`
                    : "none"
              }}
            />
          </div>
          <div className="forge-caption"
            style={{color:forgeTextColor("#5a5550"), textAlign: "center", marginTop: 2}}
          >
            AIR {bellowsCharge}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Anvil (CSS-drawn) ──────────────────────────────────────────

function Anvil({ forgeLit }: {forgeLit:boolean}) {
  return (
    <div
      aria-label="Anvil"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        margin: "16px auto 8px",
      }}
    >
      {/* Top plate (wide, flat working surface) */}
      <div
        style={{
          position: "relative",
          width: 140,
          height: 16,
          background: forgeLit
            ? `linear-gradient(180deg, #5a4a3a 0%, #2a2825 60%, #1a1815 100%)`
            : `linear-gradient(180deg, ${FORGE_COLORS.anvilGrey} 0%, #2a2825 70%, #1a1815 100%)`,
          borderRadius: "3px 3px 2px 2px",
          boxShadow: `0 3px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)`,
          transition: "background 600ms ease"
        }}
      >
        {/* Pointed horn on LEFT (CSS triangle) */}
        <div
          style={{
            position: "absolute",
            left: -22,
            top: 0,
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderRight: `22px solid ${FORGE_COLORS.anvilGrey}`,
            filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.45))"
          }}
        />
        {/* Heel / step on RIGHT top surface */}
        <div
          style={{
            position: "absolute",
            right: -6,
            top: 2,
            width: 10,
            height: 12,
            background: `linear-gradient(180deg, ${FORGE_COLORS.iron} 0%, ${FORGE_COLORS.anvilGrey} 100%)`,
            borderRadius: "2px",
            boxShadow: "0 2px 3px rgba(0,0,0,0.4)"
          }}
        />
        {/* Top surface reflection when lit */}
        {forgeLit && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              borderRadius: "3px 3px 0 0",
              background: "linear-gradient(180deg, rgba(255,107,26,0.12) 0%, transparent 100%)",
              pointerEvents: "none"
            }}
          />
        )}
      </div>
      {/* Tapered waist (narrower than top plate) */}
      <div
        style={{
          width: 80,
          height: 20,
          background: forgeLit
            ? `linear-gradient(180deg, #3a3430 0%, #1f1c19 100%)`
            : `linear-gradient(180deg, ${FORGE_COLORS.anvilGrey} 0%, #1a1815 100%)`,
          clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          transition: "background 600ms ease"
        }}
      />
      {/* Stand / base (wider than waist) */}
      <div
        style={{
          width: 110,
          height: 22,
          background: FORGE_COLORS.leather,
          borderRadius: "2px 2px 6px 6px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)"
        }}
      />
    </div>
  );
}

// ─── Weapon Rack ────────────────────────────────────────────────

function WeaponRack() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 16,
        padding: "8px 16px",
        marginTop: 8
      }}
    >
      {RACK_SILHOUETTES.map((weapon, i) => (
        <div
          key={i}
          title={weapon.label}
          style={{
            width: weapon.width,
            height: weapon.height,
            backgroundColor: "#4a3f35",
            borderRadius:
              weapon.type === "shield"
                ? "4px"
                : weapon.type === "axe"
                ? "2px 2px 6px 6px"
                : "2px 2px 1px 1px",
            filter: "brightness(1)",
            transition: "filter 300ms ease",
            cursor: "default",
            position: "relative"
          }}
          className="forge-weapon-silhouette"
        >
          {/* Blade tip for swords/daggers */}
          {(weapon.type === "sword" || weapon.type === "dagger" || weapon.type === "spear") && (
            <div
              style={{
                position: "absolute",
                top: -4,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: `${weapon.width / 2}px solid transparent`,
                borderRight: `${weapon.width / 2}px solid transparent`,
                borderBottom: `6px solid #4a3f35`,
                filter: "inherit"
              }}
            />
          )}
          {/* Axe head */}
          {weapon.type === "axe" && (
            <div
              style={{
                position: "absolute",
                top: 4,
                right: -8,
                width: 12,
                height: 16,
                backgroundColor: "#4a3f35",
                borderRadius: "0 8px 8px 0",
                filter: "inherit"
              }}
            />
          )}
          {/* Mace head */}
          {weapon.type === "mace" && (
            <div
              style={{
                position: "absolute",
                top: -6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 16,
                height: 16,
                backgroundColor: "#4a3f35",
                borderRadius: "50%",
                filter: "inherit"
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Resource Shelf ─────────────────────────────────────────────

function ResourceShelf({ resources }: {resources:ForgeResources}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "center",
        padding: "8px 0"
      }}
    >
      {FORGE_RESOURCES.map((res) => {
        const value = resources[res.key] || 0;
        const maxBar = 60;
        const barWidth = Math.min((value / maxBar) * 100, 100);

        return (
          <div
            key={res.key}
            style={{ minWidth: 90, flex: "0 0 auto" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 2
              }}
            >
              <span className="forge-caption"
                style={{color: forgeTextColor(res.color)}}
              >
                {res.icon} {res.label}
              </span>
              <span className="forge-caption"
                style={{color: forgeTextColor("#a89070")}}
              >
                {value}
              </span>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                overflow: "hidden",
                backgroundColor: "#1a1510",
                border: "1px solid #2a2420"
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${barWidth}%`,
                  borderRadius: 3,
                  backgroundColor: res.color,
                  transition: "width 400ms ease",
                  boxShadow:
                    res.key === "coal"
                      ? `inset 0 0 4px ${FORGE_COLORS.emberDim}`
                      : "none"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── NPC Portrait (reusable) ────────────────────────────────────

function NpcPortrait({ initial, role, borderColor, size = 64 }: {initial:string|undefined; role:"smith"|"apprentice"|"buyer"; borderColor:string; size?:number}) {
  const bgMap = {
    smith:      "linear-gradient(135deg, #3a2a18, #1a1208)",
    apprentice: "linear-gradient(135deg, #2a2018, #1a1510)",
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid ${borderColor}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Cinzel Decorative, Cinzel, serif",
        fontSize: size * 0.35,
        color: FORGE_COLORS.parchment,
        background: role === "buyer" ? bgMap.smith : bgMap[role],
        flexShrink: 0
      }}
    >
      {initial}
    </div>
  );
}

// ─── NPC Panels (Interactive — Phase 4) ─────────────────────────

function GodricPanel({ greeting, respect, tier, onTalk, militaryLine }: {greeting:string|undefined; respect:number; tier:RespectTier; onTalk:()=>void; militaryLine?:string|null}) {
  const [showMilitary, setShowMilitary] = useState(false);

  return (
    <div
      style={{
        flex: "1 1 200px",
        border: `1px solid ${tier.borderColor}40`,
        borderRadius: 6,
        backgroundColor: "rgba(26,21,16,0.6)",
        padding: 12
      }}
    >
      <div className="flex items-start gap-3">
        <NpcPortrait initial="G" role="smith" borderColor={tier.borderColor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="forge-caption"
              style={{color: forgeTextColor(tier.borderColor), margin: "0 0 2px"}}
            >
              Godric
            </h4>
            {/* Respect indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#1a1510",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${respect}%`,
                    height: "100%",
                    borderRadius: 2,
                    backgroundColor: tier.borderColor,
                    transition: "width 600ms ease"
                  }}
                />
              </div>
              <span className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
                {respect}
              </span>
            </div>
          </div>
          <p className="forge-caption"
            style={{color: forgeTextColor("#6a5a42"), margin: "0 0 6px"}}
          >
            Master Smith
          </p>
          <p className="forge-lore"
            style={{color: forgeTextColor("#c8b090"), margin: "0 0 6px"}}
          >
            &ldquo;{showMilitary && militaryLine ? militaryLine : greeting}&rdquo;
          </p>
          <div className="flex gap-2">
            <button className="forge-caption"
              onClick={onTalk}
              style={{
                color: forgeTextColor(tier.borderColor),
                background: "rgba(255,107,26,0.08)",
                border: `1px solid ${tier.borderColor}40`,
                borderRadius: 3,
                padding: "3px 8px",
                cursor: "pointer"
              }}
            >
              Talk
            </button>
            {militaryLine && (
              <button className="forge-caption"
                aria-expanded={showMilitary}
                onClick={() => setShowMilitary(prev => !prev)}
                style={{
                  color: forgeTextColor("#8a9098"),
                  background: "rgba(90,85,80,0.08)",
                  border: "1px solid rgba(90,85,80,0.3)",
                  borderRadius: 3,
                  padding: "3px 8px",
                  cursor: "pointer"
                }}
              >
                {showMilitary ? "Greeting" : "Readiness"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WatPanel({ idleBehavior, fact, onTalk }: {idleBehavior:string|undefined; fact:WatFact; onTalk:()=>void}) {
  const [showFact, setShowFact] = useState(false);

  return (
    <div
      style={{
        flex: "1 1 200px",
        border: "1px solid rgba(90,85,80,0.2)",
        borderRadius: 6,
        backgroundColor: "rgba(26,21,16,0.6)",
        padding: 12
      }}
    >
      <div className="flex items-start gap-3">
        <NpcPortrait initial="W" role="apprentice" borderColor="#8a7a5a" size={56} />
        <div className="flex-1 min-w-0">
          <h4 className="forge-caption"
            style={{color: forgeTextColor("#a89070"), margin: "0 0 2px"}}
          >
            Wat
          </h4>
          <p className="forge-caption"
            style={{color: forgeTextColor("#6a5a42"), margin: "0 0 6px"}}
          >
            Apprentice
          </p>
          <p className="forge-lore"
            style={{color: forgeTextColor(showFact ? "#b8a878" : "#8a7a5a"), margin: "0 0 4px"}}
          >
            {showFact && fact ? fact.dialogue : idleBehavior}
          </p>
          {showFact && fact?.topic && (
            <p className="forge-caption"  style={{color: forgeTextColor("#6a8a5a"), margin: "0 0 4px"}}>
              {fact.topic}
            </p>
          )}
          <div className="flex gap-2">
            <button className="forge-caption"
              onClick={() => {
                if (!showFact) onTalk();
                setShowFact(prev => !prev);
              }}
              style={{
                color: forgeTextColor("#a89070"),
                background: "rgba(90,85,80,0.08)",
                border: "1px solid rgba(90,85,80,0.3)",
                borderRadius: 3,
                padding: "3px 8px",
                cursor: "pointer"
              }}
            >
              {showFact ? "Never mind" : "Did you know...?"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Garrison Readiness Meter ───────────────────────────────────

function GarrisonReadiness({garrison,maxGarrison}:{garrison:number;maxGarrison:number}) {
  const readiness=maxGarrison>0?Math.round(garrison/maxGarrison*100):0;
  return <div className="forge-garrison">
    <span>Garrison</span><strong>{garrison}/{maxGarrison}</strong>
    <div className="forge-meter" role="meter" aria-label="Garrison capacity" aria-valuemin={0} aria-valuemax={maxGarrison} aria-valuenow={Math.min(garrison,maxGarrison)} aria-valuetext={garrison+' soldiers; reference capacity '+maxGarrison}>
      <div style={{width:Math.min(readiness,100)+'%'}}/>
    </div>
  </div>;
}

// ─── Forge Navigation ───────────────────────────────────────────

function ForgeNavigation({currentView,onSetView}:{currentView:ForgeView;onSetView:(view:ForgeView)=>void}) {
  return <nav className="forge-navigation" aria-label="Forge">
    {FORGE_VIEWS.map(view=>{
      const isActive=currentView===view.id, ViewIcon=VIEW_ICONS[view.id];
      return <button type="button" key={view.id} aria-current={isActive?'page':undefined} onClick={()=>onSetView(view.id)}>
        <ViewIcon size={18} aria-hidden="true"/><span>{view.label}</span>
      </button>;
    })}
  </nav>;
}

// ─── Forge Button (reusable styled button) ──────────────────
function ForgeButton({onClick,disabled,children,variant='default',style,className=''}:{onClick:MouseEventHandler<HTMLButtonElement>;disabled?:boolean;children:ReactNode;variant?:'default'|'danger'|'gold'|'green';style?:CSSProperties;className?:string}) {
  return <button type="button" className={'forge-button forge-button-'+variant+' '+className} onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

/** Native top-layer confirmation keeps the game inert until the choice is dismissed. */
function ForgeConfirmation({title,children,onDismiss,fallbackItemUid}:{title:string;children:ReactNode;onDismiss:()=>void;fallbackItemUid:number}) {
  const ref=useRef<HTMLDialogElement>(null), heading=useRef<HTMLHeadingElement>(null), titleId=useId();
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return;
    const previous=document.activeElement;dialog.showModal();heading.current?.focus();
    return ()=>{
      dialog.close();
      const fallback=document.querySelector<HTMLElement>('[data-forge-item-uid="'+fallbackItemUid+'"]') ?? document.querySelector<HTMLElement>('.forge-navigation button[aria-current="page"]');
      const target=previous instanceof HTMLElement && previous.isConnected && !previous.matches(':disabled')?previous:fallback;
      target?.focus();
    };
  },[fallbackItemUid]);
  return <dialog ref={ref} className="forge-confirmation" aria-modal="true" aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();onDismiss();}}
    onKeyDown={event=>{
      if(event.key!=='Tab')return;
      const buttons=event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'), first=buttons[0],last=buttons[buttons.length-1];
      if(document.activeElement===heading.current){event.preventDefault();(event.shiftKey?last:first)?.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }}
    onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();if(event.target===event.currentTarget&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))onDismiss();}}>
    <h3 ref={heading} id={titleId} tabIndex={-1}>{title}</h3>{children}
  </dialog>;
}

// ─── Section Label ───────────────────────────────────────────
function SectionLabel({children}:{children:ReactNode}) {
  return <h3 className="forge-section-label">{children}</h3>;
}

// ─── Commission Desk (Orders View) ──────────────────────────

function CommissionDesk({ resources, denarii, onCommission, godricRec }: {resources:ForgeResources; denarii:number; onCommission:(item:ForgeRecipe)=>void; godricRec:string}) {
  const [activeCategory, setActiveCategory] = useState<ForgeCategory>("weapon");

  const items = useMemo(() =>
    Object.values(FORGEABLE_ITEMS).filter(i => i.category === activeCategory),
    [activeCategory]
  );

  function canAfford(item:ForgeRecipe) {
    if ((item.cost.gold || 0) > denarii) return false;
    for (const [key, amt] of Object.entries(item.cost)) {
      if (key === "gold") continue;
      if (amt > 0 && materialAmount(resources,key) < amt) return false;
    }
    return true;
  }

  return (
    <div>
      {/* Godric recommendation */}
      <div
        style={{
          padding: "8px 12px",
          marginBottom: 12,
          border: `1px solid ${FORGE_COLORS.emberDim}30`,
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.6)"
        }}
      >
        <div className="flex items-start gap-2">
          <NpcPortrait initial="G" role="smith" borderColor={FORGE_COLORS.emberCore} size={36} />
          <p className="forge-lore"
            style={{color: forgeTextColor("#c8b090"), margin: 0}}
          >
            &ldquo;{godricRec}&rdquo;
          </p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="forge-categories">
        {ITEM_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button className="forge-caption"
              key={cat.id}
              aria-pressed={isActive}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                flex: 1,
                padding: "5px 4px",
                border: "none",
                borderBottom: isActive ? `2px solid ${FORGE_COLORS.emberCore}` : "2px solid transparent",
                backgroundColor: isActive ? "rgba(255,107,26,0.08)" : "transparent",
                color: forgeTextColor(isActive ? FORGE_COLORS.emberCore : "#5a5550"),
                cursor: "pointer",
                transition: "all 200ms ease"
              }}
            >
              {cat.icon} {cat.label}
            </button>
          );
        })}
      </div>

      {/* Item grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%,260px), 1fr))" }}>
        {items.map((item) => {
          const affordable = canAfford(item);
          const diff = DIFFICULTY_DISPLAY[item.difficulty] || DIFFICULTY_DISPLAY.easy;

          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${affordable ? "rgba(255,107,26,0.2)" : "rgba(90,85,80,0.2)"}`,
                borderRadius: 6,
                backgroundColor: "rgba(26,21,16,0.5)",
                padding: 10,
                transition: "all 200ms ease"
              }}
            >
              {/* Item name + difficulty */}
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <h4 className="forge-caption"
                  style={{color: forgeTextColor(affordable ? FORGE_COLORS.parchment : "#5a5550"), margin: 0}}
                >
                  {item.name}
                </h4>
                <span className="forge-caption"
                  style={{color: forgeTextColor(diff.color)}}
                >
                  {"⚒".repeat(diff.anvils)}
                </span>
              </div>

              {/* Description */}
              <p className="forge-body"
                style={{color: forgeTextColor("#8a7a5a"), margin: "0 0 6px"}}
              >
                {item.description}
              </p>

              {/* Stats row */}
              {item.baseMilitary > 0 && (
                <div className="forge-caption"  style={{color: forgeTextColor("#8a9098"), marginBottom: 2}}>
                  Military: +{item.baseMilitary}
                </div>
              )}
              {'effect' in item && item.effect && (
                <div className="forge-caption"  style={{color: forgeTextColor("#6a8a5a"), marginBottom: 2}}>
                  {item.effect}
                </div>
              )}
              <div className="forge-caption"  style={{color: forgeTextColor("#a89050"), marginBottom: 6}}>
                Trade: {item.baseTradeValue} denarii
              </div>

              {/* Resource cost */}
              <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ marginBottom: 8 }}>
                {Object.entries(item.cost).map(([key, amt]) => {
                  if (amt === 0) return null;
                  const has = key === "gold" ? denarii >= amt : materialAmount(resources,key) >= amt;
                  return (
                    <span className="forge-caption"
                      key={key}
                      style={{color: forgeTextColor(has ? "#6a8a5a" : "#c86040"), display: "flex", alignItems: "center", gap: 2}}
                    >
                      {has ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                      {amt} {key}{!has && " (short)"}
                    </span>
                  );
                })}
              </div>

              {/* Commission button */}
              <ForgeButton className="forge-caption"
                onClick={() => onCommission(item)}
                disabled={!affordable}
                variant="gold"
                style={{width: "100%", padding: "5px 8px"}}
              >
                Commission
              </ForgeButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Armory View ─────────────────────────────────────────────

function ArmoryView({ inventory, equipped, dispatch, garrison }: {inventory:readonly ForgeSavedItem[]; equipped:readonly ForgeSavedItem[]; dispatch:ForgeDispatch; garrison:number}) {
  const [selectedItem, setSelectedItem] = useState<ForgeSavedItem|null>(null);
  const [confirmAction, setConfirmAction] = useState<{action:Destination; item:ForgeSavedItem}|null>(null);




  const totalMilitary = equipped.reduce((sum, i) => sum + (i.militaryBonus || 0), 0);
  const {weapon: weaponCount, armor: armorCount} = countFunctionalEquipment(equipped);

  function handleAction(action:Destination, item:ForgeSavedItem) {
    setConfirmAction({ action, item });
  }

  function executeAction() {
    if (!confirmAction) return;
    const { action, item } = confirmAction;
    if (action === "equip") {
      dispatch({ type: "BLACKSMITH_EQUIP_ITEM", payload: { itemUid: item.uid } });
    } else if (action === "sell") {
      dispatch({ type: "BLACKSMITH_SELL_ITEM", payload: { itemUid: item.uid } });
    } else if (action === "scrap") {
      dispatch({ type: "BLACKSMITH_SCRAP_ITEM", payload: { itemUid: item.uid } });
    }
    setConfirmAction(null);
    setSelectedItem(null);
  }

  function renderItemCard(item:ForgeSavedItem, isEquipped:boolean) {
    const gradeData = gradeDefinition(item.grade);
    const isSelected = selectedItem?.uid === item.uid;

    return (
      <div
        key={item.uid}
        style={{
          border: `1px solid ${isSelected ? gradeData.color + "80" : "rgba(90,85,80,0.2)"}`,
          borderRadius: 6,
          backgroundColor: isSelected ? "rgba(255,107,26,0.06)" : "rgba(26,21,16,0.5)",
          padding: 8,
          transition: "all 200ms ease"
        }}
      >
        <button type="button" className="flex items-center justify-between" data-forge-item-uid={item.uid} aria-label={`Select ${item.grade} ${item.name}`} aria-expanded={isSelected} onClick={() => setSelectedItem(isSelected ? null : item)} style={{
          width: "100%",
          minHeight: 44,
          gap: 8,
          marginBottom: 2,
          padding: 0,
          border: 0,
          background: "transparent",
          textAlign: "left",
          cursor: "pointer"
        }}>
          <span className="forge-caption"  style={{color: forgeTextColor(FORGE_COLORS.parchment)}}>
            {item.name}
          </span>
          <span className="forge-caption"  style={{color: forgeTextColor(gradeData.color)}}>
            {item.grade}
          </span>
        </button>
        <div className="flex gap-3" style={{ marginTop: 2 }}>
          {(item.militaryBonus ?? 0) > 0 && (
            <span className="forge-caption"  style={{color: forgeTextColor("#8a9098")}}>
              +{item.militaryBonus} mil
            </span>
          )}
          <span className="forge-caption"  style={{color: forgeTextColor("#a89050")}}>
            {item.tradeValue}d
          </span>
          <span className="forge-caption"  style={{color: forgeTextColor("#6a5a4a")}}>
            {item.durability}
          </span>
        </div>

        {/* Action buttons when selected */}
        {isSelected && !isEquipped && (
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            {getDeployableTool(item.itemId) && (
              <ForgeButton className="forge-caption"  onClick={(e) => {e.stopPropagation(); handleAction("equip", item);}} variant="green" disabled={!isWorkingTool(item)} style={{flex: 1, padding: "6px"}}>Deploy</ForgeButton>
            )}
            {(item.category === "weapon" || item.category === "armor") && (
              <ForgeButton className="forge-caption"  onClick={(e) => { e.stopPropagation(); handleAction("equip", item); }} variant="green" disabled={!hasDefenseBonus(item.militaryBonus)}
                style={{flex: 1, padding: "4px 6px"}}>
                <Shield size={10} /> Equip
              </ForgeButton>
            )}
            <ForgeButton className="forge-caption"  onClick={(e) => { e.stopPropagation(); handleAction("sell", item); }} variant="gold"
              style={{flex: 1, padding: "4px 6px"}}>
              <Coins size={10} /> Sell
            </ForgeButton>
            <ForgeButton className="forge-caption"  onClick={(e) => { e.stopPropagation(); handleAction("scrap", item); }} variant="danger"
              style={{flex: 1, padding: "4px 6px"}}>
              <Trash2 size={10} /> Scrap
            </ForgeButton>
          </div>
        )}
        {isSelected && getDeployableTool(item.itemId) && <p className="forge-caption"  role="status" style={{color: forgeTextColor(FORGE_COLORS.parchment), marginTop: 8}}>{isWorkingTool(item) ? `${isEquipped ? 'Deployed. ' : ''}${getToolDeploymentDescription(item.itemId)}` : getBrokenToolDescription(item.itemId)}</p>}
        {isSelected && (item.category === "weapon" || item.category === "armor") && !hasDefenseBonus(item.militaryBonus) && (
          <p className="forge-caption"  role="status" style={{color: forgeTextColor(FORGE_COLORS.parchment), marginTop: 8}}>Provides no defense bonus.</p>
        )}
      </div>
    );
  }

  return (
    <div >
      {/* Confirmation dialog */}
      {confirmAction && <ForgeConfirmation fallbackItemUid={confirmAction.item.uid}
        title={confirmAction.action==='equip'?(getDeployableTool(confirmAction.item.itemId)?'Deploy on the Estate?':'Equip to Garrison?'):confirmAction.action==='sell'?'Sell Item?':'Scrap Item?'}
        onDismiss={()=>setConfirmAction(null)}>
        <p>{confirmAction.item.grade} {confirmAction.item.name}</p>
        {confirmAction.action==='equip' && <p className="forge-success">{getDeployableTool(confirmAction.item.itemId)?getToolDeploymentDescription(confirmAction.item.itemId):'+'+confirmAction.item.militaryBonus+' military bonus to garrison.'}</p>}
        {confirmAction.action==='sell' && <p>Receive {confirmAction.item.tradeValue} denarii.</p>}
        {confirmAction.action==='scrap' && <p className="forge-danger">Destroy item. Recover ~{Math.round(SCRAP_RECOVERY_RATE*100)}% of materials.</p>}
        <div className="forge-confirm-actions">
          <ForgeButton onClick={executeAction} variant={confirmAction.action==='scrap'?'danger':'gold'}>Confirm</ForgeButton>
          <ForgeButton onClick={()=>setConfirmAction(null)}>Cancel</ForgeButton>
        </div>
      </ForgeConfirmation>}

      {/* Garrison equipment summary */}
      <div
        style={{
          padding: "8px 12px",
          marginBottom: 12,
          border: "1px solid rgba(90,85,80,0.2)",
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.5)"
        }}
      >
        <SectionLabel>Usable Garrison Equipment</SectionLabel>
        <div className="forge-stat-grid">
          <div className="text-center">
            <div className="forge-value"  style={{color: forgeTextColor("#8a9098")}}>{totalMilitary}</div>
            <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
              TOTAL BONUS
            </div>
          </div>
          <div className="text-center">
            <div className="forge-value"  style={{color: forgeTextColor(FORGE_COLORS.emberCore)}}>{weaponCount}</div>
            <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
              WEAPONS
            </div>
          </div>
          <div className="text-center">
            <div className="forge-value"  style={{color: forgeTextColor("#6a8a5a")}}>{armorCount}</div>
            <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
              ARMOR
            </div>
          </div>
          <div className="text-center">
            <div className="forge-value"  style={{color: forgeTextColor(FORGE_COLORS.parchment)}}>{garrison}</div>
            <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
              SOLDIERS
            </div>
          </div>
        </div>
      </div>

      {/* Equipped items */}
      {equipped.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Equipped ({equipped.length})</SectionLabel>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%,260px), 1fr))" }}>
            {equipped.map(item => renderItemCard(item, true))}
          </div>
        </div>
      )}

      {/* Stored inventory */}
      <SectionLabel>Armory ({inventory.length})</SectionLabel>
      {inventory.length === 0 ? (
        <p className="forge-lore"  style={{color: forgeTextColor("#4a4030"), textAlign: "center", padding: "20px 0"}}>
          The armory is empty. Visit the Commission Desk to forge something.
        </p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%,260px), 1fr))" }}>
          {inventory.map(item => renderItemCard(item, false))}
        </div>
      )}
    </div>
  );
}

// ─── Storefront View ─────────────────────────────────────────

function StorefrontView({ forgeResources, denarii, blacksmith, dispatch, season, market, turn }: {forgeResources:ForgeResources; denarii:number; blacksmith:ForgeSaveState; dispatch:ForgeDispatch; season:ForgeSeason; market:unknown; turn:number}) {
  const [buyQty, setBuyQty] = useState<Partial<Record<ForgeResourceId,number>>>({});

  function handleBuy(resource:ForgeResourceId, qty:number) {
    const price = getForgeResourceQuote(resource, season, blacksmith);
    if (price === null) return;
    const totalCost = price * qty;
    if (denarii < totalCost||qty>remainingMarketSupply(market,turn,resource)) return;
    dispatch({
      type: "BLACKSMITH_BUY_RESOURCE",
      payload: { resource, quantity: qty },
    });
  }

  return (
    <div>
      <SectionLabel>Material Market</SectionLabel>

      {/* Season indicator */}
      <div className="text-center" style={{ marginBottom: 12 }}>
        <span className="forge-lore"  style={{color: forgeTextColor("#c8b090")}}>
          Purchases share a 100-unit supply per material each season with the Market. Selling does not replenish it.
        </span>
      </div>

      {/* Resource list */}
      <div className="grid gap-3">
        {FORGE_RESOURCES.map((res) => {
          const marketInfo = RESOURCE_MARKET[res.key];
          if (!marketInfo) return null;
          const price = getForgeResourceQuote(res.key, season, blacksmith);
          const seasonMod = marketInfo.seasonal[season] || 1.0;
          const current = forgeResources[res.key] || 0;
          const qty = buyQty[res.key] || 1;
          const totalCost = price === null ? 0 : price * qty;
          const remaining=remainingMarketSupply(market,turn,res.key);
          const canBuy = price !== null && denarii >= totalCost && qty<=remaining;

          // Price trend indicator
          const trend = seasonMod > 1.1 ? "high" : seasonMod < 0.9 ? "low" : "normal";

          return (
            <div
              key={res.key}
              data-testid={`forge-resource-${res.key}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                border: "1px solid rgba(90,85,80,0.2)",
                borderRadius: 6,
                backgroundColor: "rgba(26,21,16,0.5)"
              }}
            >
              {/* Resource info */}
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
                  <span className="forge-caption"  style={{color: forgeTextColor(res.color)}}>
                    {res.icon} {marketInfo.label}
                  </span>
                  {trend === "high" && (
                    <span className="forge-caption"  style={{color: forgeTextColor("#c86040")}}>
                      SCARCE
                    </span>
                  )}
                  {trend === "low" && (
                    <span className="forge-caption"  style={{color: forgeTextColor("#6a8a5a")}}>
                      ABUNDANT
                    </span>
                  )}
                </div>
                <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
                  In stock: {current} | Price: {price === null ? "Unavailable" : `${price}d`} per {marketInfo.unit}
                </div>
                <span className="forge-caption"  style={{color: forgeTextColor("#c8b090")}}>Supply: {remaining}</span>
              </div>

              {/* Quantity selector */}
              <div className="flex items-center gap-1" role="group" aria-label={res.label+' quantity'}>
                {[1, 5, 10].map((q) => (
                  <button className="forge-caption"
                    key={q}
                    aria-pressed={qty===q}
                    onClick={() => setBuyQty(prev => ({ ...prev, [res.key]: q }))}
                    style={{
                      width: 28,
                      height: 24,
                      border: `1px solid ${qty === q ? FORGE_COLORS.emberCore : FORGE_COLORS.iron}`,
                      borderRadius: 3,
                      backgroundColor: qty === q ? "rgba(255,107,26,0.15)" : "transparent",
                      color: forgeTextColor(qty === q ? FORGE_COLORS.emberCore : "#5a5550"),
                      cursor: "pointer"
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Buy button */}
              <ForgeButton className="forge-caption"
                onClick={() => handleBuy(res.key, qty)}
                disabled={!canBuy}
                variant="gold"
                style={{padding: "4px 10px", whiteSpace: "nowrap"}}
              >
                {remaining===0?"Out of stock":price === null ? "Unavailable" : `Buy ${qty} (${totalCost}d)`}
              </ForgeButton>
            </div>
          );
        })}
      </div>

      {/* Treasury display */}
      <div className="text-center" style={{ marginTop: 12 }}>
        <span className="forge-caption"  style={{color: forgeTextColor("#a89050")}}>
          Treasury: {denarii} denarii
        </span>
      </div>
    </div>
  );
}

// ─── Post-Forge Result View ─────────────────────────────────

function ForgeResultView({ result, dispatch, onDone }: {result:CollectedResult; dispatch:ForgeDispatch; onDone:()=>void}) {
  const [actionTaken, setActionTaken] = useState(false);
  if (!result) return null;

  const { item, grade, qualityScore } = result;
  const gradeData = gradeDefinition(grade.grade);
  const militaryBonus = Math.round((item.baseMilitary || 0) * (gradeData.statMultiplier ?? 1));
  const tradeValue = Math.round((item.baseTradeValue || 0) * (gradeData.tradeMultiplier ?? 1));
  const isWeaponOrArmor = item.category === "weapon" || item.category === "armor";

  // The item has already been added to inventory by BLACKSMITH_FORGE_COMPLETE.
  // These actions move/transform it from inventory.
  const latestUid = result.itemUid;

  function handleDestination(action:Destination) {
    if (actionTaken) return;
    setActionTaken(true);
    if (action === "equip" && (isWeaponOrArmor || getDeployableTool(item.id))) {
      dispatch({ type: "BLACKSMITH_EQUIP_ITEM", payload: { itemUid: latestUid } });
    } else if (action === "sell") {
      dispatch({ type: "BLACKSMITH_SELL_ITEM", payload: { itemUid: latestUid } });
    } else if (action === "scrap") {
      dispatch({ type: "BLACKSMITH_SCRAP_ITEM", payload: { itemUid: latestUid } });
    }
    // "store" = do nothing, already in inventory
    onDone();
  }

  return (
    <div className="forge-result-reveal" style={{ padding: "16px 0" }}>
      {/* Item reveal */}
      <div className="text-center" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "inline-block",
            padding: "12px 24px",
            border: `2px solid ${gradeData.color}60`,
            borderRadius: 8,
            backgroundColor: "rgba(26,21,16,0.8)"
          }}
        >
          <div className="forge-caption"  style={{color: forgeTextColor(gradeData.color), marginBottom: 4}}>
            {gradeData.grade.toUpperCase()}
          </div>
          <div className="forge-heading"  style={{color: forgeTextColor(FORGE_COLORS.parchment), marginBottom: 4}}>
            {item.name}
          </div>
          <div className="forge-caption"  style={{color: forgeTextColor("#8a7a5a")}}>
            Quality: {qualityScore}% | {gradeData.durability}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="forge-stat-grid" style={{ marginBottom: 16 }}>
        {militaryBonus > 0 && (
          <div className="text-center">
            <div className="forge-value"  style={{color: forgeTextColor("#8a9098")}}>+{militaryBonus}</div>
            <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>MILITARY</div>
          </div>
        )}
        <div className="text-center">
          <div className="forge-value"  style={{color: forgeTextColor("#a89050")}}>{tradeValue}d</div>
          <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>TRADE VALUE</div>
        </div>
      </div>

      {/* Destination buttons */}
      <SectionLabel>What shall we do with it?</SectionLabel>
      {isWeaponOrArmor && !hasDefenseBonus(militaryBonus) && <p className="forge-caption"  role="status" style={{color: forgeTextColor(FORGE_COLORS.parchment), textAlign: "center", marginBottom: 8}}>Provides no defense bonus.</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 400, margin: "0 auto" }}>
        {getDeployableTool(item.id) && <ForgeButton onClick={() => handleDestination("equip")} variant="green" disabled={actionTaken || !isWorkingTool({uid: latestUid, itemId: item.id, category: item.category, grade: grade.grade, qualityScore})}>Deploy on Estate</ForgeButton>}
        {getDeployableTool(item.id) && <p className="forge-caption"  role="status" style={{color: forgeTextColor(FORGE_COLORS.parchment)}}>{grade.grade === 'Scrap' ? getBrokenToolDescription(item.id) : `${getToolDeploymentDescription(item.id)}`}</p>}
        {isWeaponOrArmor && (
          <ForgeButton onClick={() => handleDestination("equip")} variant="green" disabled={actionTaken || !hasDefenseBonus(militaryBonus)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px" }}>
            <Shield size={14} /> Equip Garrison
          </ForgeButton>
        )}
        <ForgeButton onClick={() => handleDestination("store")} disabled={actionTaken}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px" }}>
          <Package size={14} /> Store in Armory
        </ForgeButton>
        <ForgeButton onClick={() => handleDestination("sell")} variant="gold" disabled={actionTaken}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px" }}>
          <Coins size={14} /> Sell ({tradeValue}d)
        </ForgeButton>
        {grade.grade === "Scrap" && (
          <ForgeButton onClick={() => handleDestination("scrap")} variant="danger" disabled={actionTaken}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px" }}>
            <Trash2 size={14} /> Scrap for Parts
          </ForgeButton>
        )}
      </div>
    </div>
  );
}

// ─── Seasonal Buyers Panel (in Armory sell flow) ────────────

function BuyerPanel({ buyers, inventory, dispatch, salesThisSeason }: {buyers:readonly (ForgeBuyerDefinition & {id:ForgeBuyerId})[]; inventory:readonly ForgeSavedItem[]; dispatch:ForgeDispatch; salesThisSeason:number}) {
  const [confirmSale, setConfirmSale] = useState<{buyer:ForgeBuyerDefinition & {id:ForgeBuyerId}; item:ForgeSavedItem; price:number}|null>(null);

  if (buyers.length === 0) return null;

  function handleSellToBuyer(buyer:ForgeBuyerDefinition & {id:ForgeBuyerId}, item:ForgeSavedItem) {
    const price = getBuyerPrice(buyer, item, salesThisSeason);
    setConfirmSale({ buyer, item, price });
  }

  function executeSale() {
    if (!confirmSale) return;
    const { buyer, item } = confirmSale;
    dispatch({
      type: "BLACKSMITH_SELL_ITEM",
      payload: {itemUid: item.uid, buyerId: buyer.id},
    });
    setConfirmSale(null);
  }

  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>Seasonal Buyers</SectionLabel>
      <div className="grid gap-3">
        {buyers.map((buyer) => {
          const preferred = inventory.filter(i => buyer.prefers.includes(i.category));
          return (
            <div
              key={buyer.id}
              style={{
                border: `1px solid ${buyer.id === "mortimer_agent" ? "#6a2020" : "rgba(90,85,80,0.2)"}`,
                borderRadius: 6,
                backgroundColor: buyer.id === "mortimer_agent" ? "rgba(106,32,32,0.08)" : "rgba(26,21,16,0.5)",
                padding: 10
              }}
            >
              <div className="flex items-start gap-2" style={{ marginBottom: 6 }}>
                <NpcPortrait
                  initial={buyer.name[0]}
                  role="buyer"
                  borderColor={buyer.id === "mortimer_agent" ? "#c86040" : "#8a7a5a"}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <h4 className="forge-caption"  style={{color: forgeTextColor(FORGE_COLORS.parchment), margin: 0}}>
                    {buyer.name}
                  </h4>
                  <p className="forge-body"  style={{color: forgeTextColor("#8a7a5a"), margin: "2px 0 0"}}>
                    {buyer.description}
                  </p>
                </div>
                {buyer.premium > 0 && (
                  <span className="forge-caption"  style={{color: forgeTextColor("#d4a820")}}>
                    +{Math.round(buyer.premium * 100)}%
                  </span>
                )}
              </div>

              {/* Dialogue */}
              <p className="forge-lore"  style={{color: forgeTextColor("#c8b090"), margin: "0 0 6px", paddingLeft: 8, borderLeft: "2px solid rgba(90,85,80,0.3)"}}>
                &ldquo;{buyer.dialogue}&rdquo;
              </p>

              {/* Godric warning for Mortimer */}
              {buyer.godricWarning && (
                <p className="forge-lore"  style={{color: forgeTextColor("#c86040"), margin: "0 0 6px", paddingLeft: 8, borderLeft: "2px solid #6a2020"}}>
                  Godric: &ldquo;{buyer.godricWarning}&rdquo;
                </p>
              )}

              {/* Items this buyer wants */}
              {preferred.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {preferred.map((item) => {
                    const price = getBuyerPrice(buyer, item, salesThisSeason);
                    return (
                      <button className="forge-caption"
                        key={item.uid}
                        onClick={() => handleSellToBuyer(buyer, item)}
                        style={{
                          color: forgeTextColor(FORGE_COLORS.parchment),
                          background: "rgba(139,58,0,0.12)",
                          border: `1px solid ${FORGE_COLORS.iron}`,
                          borderRadius: 4,
                          padding: "4px 8px",
                          cursor: "pointer",
                          transition: "all 200ms ease"
                        }}
                      >
                        {item.name} ({price}d)
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="forge-body"  style={{color: forgeTextColor("#4a4030")}}>
                  No items in stock that interest this buyer.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm sale dialog */}
      {confirmSale && <ForgeConfirmation title={'Sell to '+confirmSale.buyer.name+'?'} fallbackItemUid={confirmSale.item.uid} onDismiss={()=>setConfirmSale(null)}>
        <p>{confirmSale.item.grade} {confirmSale.item.name}</p>
        <p className="forge-gold">{confirmSale.price} denarii</p>
        {confirmSale.buyer.respectCost && <p className="forge-danger">Godric will disapprove. ({confirmSale.buyer.respectCost} respect)</p>}
        <div className="forge-confirm-actions">
          <ForgeButton onClick={executeSale} variant={confirmSale.buyer.id==='mortimer_agent'?'danger':'gold'}>Sell</ForgeButton>
          <ForgeButton onClick={()=>setConfirmSale(null)}>Cancel</ForgeButton>
        </div>
      </ForgeConfirmation>}
    </div>
  );
}

// ─── Forge Ledger View ────────────────────────────────────────

function ForgeLedger({ blacksmith, garrison }: {blacksmith:ForgeSaveState; garrison:number}) {
  const bs = blacksmith || {};
  const log = bs.productionLog || [];
  const totalForged = bs.totalItemsForged || 0;
  const invested = bs.totalGoldInvested || 0;
  const earned = bs.totalGoldEarned || 0;
  const equipped = bs.equipped || [];
  const profit = earned - invested;

  // Grade breakdown
  const gradeCount = { Masterwork: 0, Fine: 0, Standard: 0, Rough: 0, Scrap: 0 };
  for (const entry of log) {
    if (isGrade(entry.grade)) gradeCount[entry.grade]++;
  }

  // Quality trend (last 10 items)
  const recentQuality = log.slice(-10).map(e => e.qualityScore ?? 50);

  // Readiness
  const readiness = calculateForgeReadiness(equipped, garrison);

  // Category breakdown
  const catCount = { weapon: 0, armor: 0, tool: 0, trade_good: 0 };
  for (const entry of log) {
    if (catCount[entry.category] !== undefined) catCount[entry.category]++;
  }

  return (
    <div>
      <SectionLabel>Forge Production Ledger</SectionLabel>

      {/* Economy summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: 8,
          marginBottom: 16
        }}
      >
        {[
          { label: "ITEMS FORGED", value: totalForged, color: FORGE_COLORS.emberCore },
          { label: "MASTERWORKS", value: bs.masterworksCreated || 0, color: "#ffd700" },
          { label: "GOLD INVESTED", value: invested, color: "#c86040" },
          { label: "GOLD EARNED", value: earned, color: "#d4a820" },
          { label: "NET PROFIT", value: profit, color: profit >= 0 ? "#6a8a5a" : "#c86040" },
          { label: "READINESS", value: `${readiness.readiness}%`, color: readiness.readiness >= 60 ? "#6a8a5a" : readiness.readiness >= 30 ? FORGE_COLORS.emberCore : "#c86040" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="text-center"
            style={{
              padding: "8px 4px",
              border: "1px solid rgba(90,85,80,0.2)",
              borderRadius: 6,
              backgroundColor: "rgba(26,21,16,0.5)"
            }}
          >
            <div className="forge-value"  style={{color: forgeTextColor(stat.color)}}>
              {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
            </div>
            <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Grade distribution (CSS bar chart) */}
      <div style={{
        padding: "10px 12px",
        border: "1px solid rgba(90,85,80,0.2)",
        borderRadius: 6,
        backgroundColor: "rgba(26,21,16,0.5)",
        marginBottom: 12
      }}>
        <div className="forge-caption"  style={{color: forgeTextColor("#5a5550"), textAlign: "center", marginBottom: 8}}>
          Quality Distribution
        </div>
        {totalForged === 0 ? (
          <p className="forge-body"  style={{color: forgeTextColor("#4a4030"), textAlign: "center"}}>
            No items forged yet.
          </p>
        ) : (
          <div className="grid gap-2">
            {Object.entries(gradeCount).map(([grade, count]) => {
              const pct = totalForged > 0 ? (count / totalForged) * 100 : 0;
              const gradeData = isGrade(grade) ? QUALITY_GRADES[grade] : undefined;
              return (
                <div key={grade} className="flex items-center gap-2">
                  <span className="forge-caption"  style={{color: forgeTextColor(gradeData?.color || "#5a5550"), width: 110, minWidth: 110, textAlign: "right"}}>
                    {grade}
                  </span>
                  <div style={{ flex: 1, height: 12, borderRadius: 3, backgroundColor: "#1a1510", overflow: "hidden", border: "1px solid #2a2420" }}>
                    <div style={{
                      height: "100%",
                      width: `${pct}%`,
                      backgroundColor: gradeData?.color || "#5a5550",
                      borderRadius: 3,
                      transition: "width 600ms ease",
                      opacity: 0.7
                    }} />
                  </div>
                  <span className="forge-caption"  style={{color: forgeTextColor("#8a7a5a"), width: 20, textAlign: "right"}}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quality trend (last 10 items) */}
      {recentQuality.length > 1 && (
        <div style={{
          padding: "10px 12px",
          border: "1px solid rgba(90,85,80,0.2)",
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.5)",
          marginBottom: 12
        }}>
          <div className="forge-caption"  style={{color: forgeTextColor("#5a5550"), textAlign: "center", marginBottom: 8}}>
            Quality Trend (Last {recentQuality.length})
          </div>
          <div className="forge-quality-history" role="list" aria-label="Recent Forge qualities">
            {recentQuality.map((q, i) => {
              const barColor = q >= 90 ? "#ffd700" : q >= 70 ? "#c0c0c0" : q >= 50 ? "#8a8a8a" : q >= 30 ? "#6a5a4a" : "#4a3a2a";
              return (
                <div key={i} className="forge-quality-column" role="listitem" aria-label={`Quality ${q}%`}>
                  <span className="forge-caption">{q}</span>
                  <div className="forge-quality-well" aria-hidden="true">
                    <div style={{height:`${q}%`,backgroundColor:barColor}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {totalForged > 0 && (
        <div style={{
          padding: "10px 12px",
          border: "1px solid rgba(90,85,80,0.2)",
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.5)",
          marginBottom: 12
        }}>
          <div className="forge-caption"  style={{color: forgeTextColor("#5a5550"), textAlign: "center", marginBottom: 6}}>
            Production by Type
          </div>
          <div className="forge-stat-grid">
            {([
              { key: "weapon", label: "Weapons", icon: "⚔", color: FORGE_COLORS.emberCore },
              { key: "armor", label: "Armor", icon: "⛊", color: "#8a9098" },
              { key: "tool", label: "Tools", icon: "⚒", color: "#6a8a5a" },
              { key: "trade_good", label: "Trade", icon: "⚖", color: "#d4a820" },
            ] as const).map((cat) => (
              <div key={cat.key} className="text-center">
                <div className="forge-caption"  style={{color: forgeTextColor(cat.color)}}>{catCount[cat.key]}</div>
                <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>{cat.icon} {cat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Garrison readiness breakdown */}
      <div style={{
        padding: "10px 12px",
        border: "1px solid rgba(90,85,80,0.2)",
        borderRadius: 6,
        backgroundColor: "rgba(26,21,16,0.5)",
        marginBottom: 12
      }}>
        <div className="forge-caption"  style={{color: forgeTextColor("#5a5550"), textAlign: "center", marginBottom: 6}}>
          Garrison Equipment Readiness
        </div>
        <div className="forge-stat-grid">
          {[
            { label: "ARMED", value: `${readiness.armed}/${garrison}`, color: readiness.armed >= garrison ? "#6a8a5a" : FORGE_COLORS.emberCore },
            { label: "ARMORED", value: `${readiness.armored}/${garrison}`, color: readiness.armored >= garrison ? "#6a8a5a" : "#8a9098" },
            { label: "AVG QUALITY", value: `${readiness.quality}%`, color: readiness.quality >= 70 ? "#ffd700" : "#8a7a5a" },
            { label: "DEF BONUS", value: `+${readiness.defenseBonus}`, color: "#6a8a5a" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="forge-caption"  style={{color: forgeTextColor(s.color)}}>{s.value}</div>
              <div className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* Readiness bar */}
        <div style={{ marginTop: 8, height: 8, borderRadius: 4, backgroundColor: "#1a1510", border: "1px solid #2a2420", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${readiness.readiness}%`,
            borderRadius: 4,
            backgroundColor: readiness.readiness >= 60 ? "#6a8a5a" : readiness.readiness >= 30 ? FORGE_COLORS.emberCore : "#c86040",
            transition: "width 600ms ease",
            boxShadow: `0 0 6px ${readiness.readiness >= 60 ? "#6a8a5a" : FORGE_COLORS.emberCore}40`
          }} />
        </div>
      </div>

      {/* Recent production log */}
      {log.length > 0 && (
        <div style={{
          padding: "10px 12px",
          border: "1px solid rgba(90,85,80,0.2)",
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.5)"
        }}>
          <div className="forge-caption"  style={{color: forgeTextColor("#5a5550"), textAlign: "center", marginBottom: 6}}>
            Recent Production ({Math.min(log.length, 8)} of {log.length})
          </div>
          <div className="grid gap-1">
            {log.slice(-8).reverse().map((entry, i) => {
              const gradeData = isGrade(entry.grade) ? QUALITY_GRADES[entry.grade] : undefined;
              return (
                <div key={i} className="flex items-center justify-between" style={{ padding: "3px 0", borderBottom: "1px solid rgba(90,85,80,0.1)" }}>
                  <span className="forge-caption"  style={{color: forgeTextColor(FORGE_COLORS.parchment)}}>
                    {entry.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="forge-caption"  style={{color: forgeTextColor(gradeData?.color || "#5a5550")}}>
                      {entry.grade}
                    </span>
                    <span className="forge-caption"  style={{color: forgeTextColor("#a89050")}}>
                      {entry.tradeValue}d
                    </span>
                    <span className="forge-caption"  style={{color: forgeTextColor("#5a5550")}}>
                      T{entry.turn}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supply Event Banner ──────────────────────────────────────

function SupplyEventBanner({ event, onDismiss, onInvest, denarii, acknowledged, remaining, ironVeinActive }: {event:ForgeSupplyDefinition; onDismiss:()=>void; onInvest:()=>void; denarii:number; acknowledged:boolean; remaining:number; ironVeinActive:boolean}) {
  if (!event) return null;

  const isInvestment = event.effect === "iron_investment";
  const canInvest = isInvestment && !ironVeinActive && denarii >= event.investCost;

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "10px 14px",
        border: `1px solid ${FORGE_COLORS.emberDim}`,
        borderRadius: 6,
        backgroundColor: "rgba(139,58,0,0.08)",
        borderLeft: `3px solid ${FORGE_COLORS.emberCore}`
      }}
    >
      <div className="flex items-start gap-2" style={{ marginBottom: 6 }}>
        <AlertTriangle size={14} style={{ color: FORGE_COLORS.emberCore, marginTop: 2, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <h4 className="forge-caption"  style={{color: forgeTextColor(FORGE_COLORS.parchment), margin: "0 0 4px"}}>
            {event.name}
          </h4>
          <p className="forge-body"  style={{color: forgeTextColor("#a89070"), margin: "0 0 6px"}}>
            {event.description}
          </p>
          <p className="forge-lore"  style={{color: forgeTextColor("#c8b090"), margin: 0}}>
            Godric: &ldquo;{event.godricComment}&rdquo;
          </p>
        </div>
      </div>
      <div className="flex gap-2" style={{ marginTop: 8 }}>
        {acknowledged ? <p className="forge-caption"  role="status" style={{color: forgeTextColor(FORGE_COLORS.parchment)}}>Acknowledged.{remaining > 0 ? ` Supply conditions continue for ${remaining} season${remaining === 1 ? "" : "s"}.` : event.duration > 0 ? " Supply conditions have ended." : ""}</p> : (
        isInvestment ? (
          <>
            <ForgeButton className="forge-caption"  onClick={onInvest} disabled={!canInvest} variant="gold" >
              Invest {event.investCost}d
            </ForgeButton>
            <ForgeButton className="forge-caption"  onClick={onDismiss} >
              Decline
            </ForgeButton>
          </>
        ) : (
          <ForgeButton className="forge-caption"  onClick={onDismiss} >
            Acknowledged
          </ForgeButton>
        )
        )}
      </div>
    </div>
  );
}

// ─── Banter Display ──────────────────────────────────────────

function BanterDisplay({ banter }: {banter:Banter}) {
  if (!banter) return null;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 12px",
        border: `1px solid ${FORGE_COLORS.emberDim}20`,
        borderRadius: 6,
        backgroundColor: "rgba(26,21,16,0.5)"
      }}
    >
      <div className="forge-caption"  style={{color: forgeTextColor("#5a5550"), marginBottom: 6, textAlign: "center"}}>
        Overheard at the Forge
      </div>
      {banter.map(({ speaker, line }, i) => (
        <p className="forge-lore"  key={i} style={{color: forgeTextColor(speaker === "godric" ? FORGE_COLORS.emberCore : "#a89070"), margin: "2px 0"}}>
          <strong>{speaker === "godric" ? "Godric" : "Wat"}:</strong> &ldquo;{line}&rdquo;
        </p>
      ))}
    </div>
  );
}

// ─── Workshop View (Phase 1 + Phase 4 NPC interactions) ─────────

function Workshop({
  forgeState,
  resources,
  godricGreeting,
  watBehavior,
  onPumpBellows,
  respect,
  tier,
  militaryLine,
  onGodricTalk,
  watFact,
  onWatTalk,
  banter,
}: WorkshopProps) {
  const isLit = forgeState.temperature !== "cold";

  return (
    <div>
      {/* Anvil */}
      <Anvil forgeLit={isLit} />

      {/* NPC panels: Godric (left), Wat (right) */}
      <div className="flex flex-col sm:flex-row gap-3" style={{ marginTop: 12 }}>
        <GodricPanel
          greeting={godricGreeting}
          respect={respect}
          tier={tier}
          onTalk={onGodricTalk}
          militaryLine={militaryLine}
        />
        <WatPanel
          idleBehavior={watBehavior}
          fact={watFact}
          onTalk={onWatTalk}
        />
      </div>

      {/* Banter */}
      {banter && <BanterDisplay banter={banter} />}

      {/* Forge Hearth */}
      <ForgeHearth
        temperature={forgeState.temperature}
        bellowsCharge={forgeState.bellowsCharge}
        bellowsCooldown={forgeState.bellowsCooldown}
        onPumpBellows={onPumpBellows}
      />

      {/* Weapon Rack — info-only panel. Solid semi-opaque background so it
          reads as a fully-rendered panel at full opacity over the forge's
          darker lower gradient instead of looking disabled/dimmed (B-55). */}
      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          border: "1px solid rgba(58,54,50,0.4)",
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.75)"
        }}
      >
        <div className="forge-caption"
          style={{color: forgeTextColor("#c4a24a"), textAlign: "center", marginBottom: 4}}
        >
          Weapon Rack
        </div>
        <WeaponRack />
      </div>

      {/* Resource Shelf — info-only panel, matches Weapon Rack contrast so
          both lower info panels read as fully visible (B-55). */}
      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          border: "1px solid rgba(58,54,50,0.4)",
          borderRadius: 6,
          backgroundColor: "rgba(26,21,16,0.75)"
        }}
      >
        <div className="forge-caption"
          style={{color: forgeTextColor("#c4a24a"), textAlign: "center", marginBottom: 6}}
        >
          Forge Materials
        </div>
        <ResourceShelf resources={resources} />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function BlacksmithTab({ state, dispatch }: {state:BlacksmithViewState; dispatch:ForgeDispatch}) {
  const revealFocusedControl=useHallReadingFocus();
  const [currentView, setCurrentView] = useState<ForgeView>("workshop");
  const [ambientIndex, setAmbientIndex] = useState(0);
  const [ambientVisible, setAmbientVisible] = useState(true);

  // Local forge state (Phase 1 — local only; Phase 2+ will move to reducer)
  const [forgeState, setForgeState] = useState<LocalForgeState>({
    temperature: "cold",
    bellowsCharge: 0,
    bellowsCooldown: false,
    fuelLevel: 100,
    isLit: false,
  });

  // NPC state
  const [godricLine, setGodricLine] = useState<string|null|undefined>(null);
  const [activeBanter, setActiveBanter] = useState<Banter|null|undefined>(null);

  const [watBehavior] = useState(
    () => WAT_IDLE[Math.floor(Math.random() * WAT_IDLE.length)]
  );

  const [godricBellowsLine, setGodricBellowsLine] = useState<string|null|undefined>(null);

  // Dispatch visit tracking on mount
  const visitDispatched = useRef(false);
  const talkQueued = useRef(false);
  useEffect(() => { talkQueued.current = false; }, [state.rngState]);
  useEffect(() => {
    if (!visitDispatched.current) {
      visitDispatched.current = true;
      dispatch({ type: "BLACKSMITH_VISIT" });
    }
  }, [dispatch]);

  // Bellows cooldown ref
  const bellowsTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Cycle ambient text every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setAmbientVisible(false);
      const fadeTimer = setTimeout(() => {
        setAmbientIndex((prev) => (prev + 1) % FORGE_AMBIENT_TEXTS.length);
        setAmbientVisible(true);
      }, 500);
      return () => clearTimeout(fadeTimer);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Bellows charge decay
  const hasCharge = forgeState.bellowsCharge > 0;
  useEffect(() => {
    if (!hasCharge) return;
    const decay = setInterval(() => {
      setForgeState((prev) => ({
        ...prev,
        bellowsCharge: Math.max(0, prev.bellowsCharge - BELLOWS_CONFIG.decayPerSecond),
      }));
    }, 1000);
    return () => clearInterval(decay);
  }, [hasCharge]);

  // Pump bellows handler
  const handlePumpBellows = useCallback(() => {
    if (forgeState.bellowsCooldown) return;

    setForgeState((prev) => {
      const newCharge = Math.min(prev.bellowsCharge + BELLOWS_CONFIG.chargePerPump, BELLOWS_CONFIG.maxCharge);

      // Temperature escalation
      let newTemp = prev.temperature;
      if (newCharge >= BELLOWS_CONFIG.heatThreshold) {
        const temps = ["cold", "warm", "hot", "white-hot"] as const;
        const currentIdx = temps.indexOf(prev.temperature);
        if (currentIdx < temps.length - 1) {
          newTemp = temps[currentIdx + 1] ?? prev.temperature;
        }
      }

      // Godric reaction
      if (newCharge >= 90) {
        const warns = GODRIC_BELLOWS.warn;
        setGodricBellowsLine(warns[Math.floor(Math.random() * warns.length)]);
      } else if (newCharge >= 30 && prev.bellowsCharge < 30) {
        const encourages = GODRIC_BELLOWS.encourage;
        setGodricBellowsLine(encourages[Math.floor(Math.random() * encourages.length)]);
      }

      return {
        ...prev,
        bellowsCharge: newCharge,
        temperature: newTemp,
        isLit: newTemp !== "cold",
        bellowsCooldown: true,
      };
    });

    // Cooldown
    if (bellowsTimerRef.current) clearTimeout(bellowsTimerRef.current);
    bellowsTimerRef.current = setTimeout(() => {
      setForgeState((prev) => ({ ...prev, bellowsCooldown: false }));
    }, BELLOWS_CONFIG.cooldownMs);

    // Clear Godric bellows line after 3 seconds
    setTimeout(() => setGodricBellowsLine(null), 3000);
  }, [forgeState.bellowsCooldown]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (bellowsTimerRef.current) clearTimeout(bellowsTimerRef.current);
    };
  }, []);

  // Commission item (pre-selected from Commission Desk)
  const [commissionItem, setCommissionItem] = useState<ForgeRecipe|null>(null);

  // Post-forge result for destination routing
  const [forgeResult, setForgeResult] = useState<CollectedResult|null>(null);
  const [forgeError, setForgeError] = useState<string|null>(null);

  // Commission handler — start forging a specific item
  const handleCommission = useCallback((item:ForgeRecipe) => {
    setForgeError(null);
    setCommissionItem(item);
    setCurrentView("forging");
  }, []);

  // Forging completion handler — dispatch + show destination screen
  const handleForgingComplete = useCallback((result:ForgingResult) => {
    const payload = {itemId: result.item.id, qualityScore: result.qualityScore, completionUid: result.completionUid};
    if (!planForgeCompletion(state, payload)) {
      setCommissionItem(null);
      setForgeResult(null);
      setForgeError("This commission could not be completed. Check your materials and gold, then start again.");
      setCurrentView("workshop");
      return;
    }
    setForgeError(null);
    dispatch({type: "BLACKSMITH_FORGE_COMPLETE", payload});
    const nextUid = result.completionUid;
    setForgeResult({
      item: result.item,
      grade: result.grade,
      qualityScore: result.qualityScore,
      itemUid: nextUid,
    });
    setCommissionItem(null);
    setCurrentView("forge_result");
  }, [dispatch, state]);

  const handleForgingCancel = useCallback(() => {
    setCommissionItem(null);
    setCurrentView("workshop");
  }, []);

  const handleForgeResultDone = useCallback(() => {
    setForgeResult(null);
    setCurrentView("workshop");
  }, []);

  // NPC interaction handlers
  const handleGodricTalk = useCallback(() => {
    if (talkQueued.current) return;
    const seed = state.rngState === undefined ? seedLegacySnapshot(state) : state.rngState;
    if (!isRandomState(seed)) return;
    const outcome = planForgeTalk(state, createRandomCursor(seed).next);
    if (!outcome) return;
    const mood = deriveGodricMood(state);
    const lines = GODRIC_GREETINGS[mood] || GODRIC_GREETINGS.working;
    setGodricLine(lines[Math.floor(Math.random() * lines.length)]);
    setActiveBanter(outcome.banterIndex === null ? null : GODRIC_WAT_BANTER[outcome.banterIndex % GODRIC_WAT_BANTER.length]);
    talkQueued.current = true;
    dispatch({ type: "BLACKSMITH_TALK" });
  }, [state, dispatch]);

  const handleWatTalk = useCallback(() => {
    dispatch({ type: "BLACKSMITH_ADVANCE_WAT" });
  }, [dispatch]);

  const handleDismissSupplyEvent = useCallback(() => {
    dispatch({ type: "BLACKSMITH_DISMISS_SUPPLY_EVENT" });
  }, [dispatch]);

  const handleInvestIronVein = useCallback(() => {
    dispatch({ type: "BLACKSMITH_INVEST_IRON_VEIN" });
  }, [dispatch]);

  // Derived values
  const bs = state.blacksmith || {};
  const inv = state.inventory || {};
  const forgeResources = useMemo(() => ({
    iron: inv.iron ?? 0,
    steel: inv.steel ?? 0,
    coal: inv.coal ?? 0,
    leather: inv.leather ?? 0,
    wood: inv.wood ?? 0,
  }), [inv.iron, inv.steel, inv.coal, inv.leather, inv.wood]);
  const inventory = bs.inventory || [];
  const equipped = useMemo(() => bs.equipped || [], [bs.equipped]);
  const garrison = state.garrison || 0;
  const maxGarrison = 25;
  const isLit = forgeState.temperature !== "cold";
  const godricRec = useMemo(() => getGodricRecommendation(state), [state]);
  const season = state.season || "spring";
  const buyers = useMemo(() => getAvailableBuyers(season, state), [season, state]);
  const supplyStatus = getForgeSupplyStatus(bs);
  const supplyEvent = supplyStatus?.event;
  const forgingDisabled = supplyStatus !== null && supplyEvent?.effect === "forging_disabled" && supplyStatus.remaining > 0;

  // NPC derived state
  const respect = bs.godricRespect ?? 50;
  const godricTier = useMemo(() => getGodricTier(respect), [respect]);
  const godricMood = useMemo(() => deriveGodricMood(state), [state]);
  const godricGreeting = useMemo(() => {
    if (godricLine) return godricLine;
    const lines = GODRIC_GREETINGS[godricMood] || GODRIC_GREETINGS.working;
    return lines[(bs.totalItemsForged || 0) % lines.length];
  }, [godricMood, godricLine, bs.totalItemsForged]);

  const readinessTierKey = useMemo(() => getReadinessTier(equipped, garrison), [equipped, garrison]);
  const militaryLine = useMemo(() => {
    const lines = GODRIC_MILITARY[readinessTierKey];
    if (!lines) return null;
    return lines[(bs.totalItemsForged || 0) % lines.length];
  }, [readinessTierKey, bs.totalItemsForged]);

  const watFactIndex = bs.watFactIndex || 0;
  const watFact = useMemo(() => pickWatFact("forge_general", watFactIndex), [watFactIndex]);

  return (
    <div
      className="forge-ui mx-auto forge-container"
      onFocusCapture={event=>{if(!event.target.closest('.forge-minigame, dialog'))revealFocusedControl(event);}}
      style={{
        position: "relative",
        minHeight: 500,
        borderRadius: 8,
        overflow: "hidden",
        background: `
          radial-gradient(
            ellipse 60% 80% at 50% 90%,
            ${isLit ? "rgba(255,107,26,0.12)" : "rgba(0,0,0,0)"} 0%,
            ${isLit ? "rgba(204,85,0,0.06)" : "rgba(0,0,0,0)"} 30%,
            ${isLit ? "rgba(139,58,0,0.02)" : "rgba(0,0,0,0)"} 60%,
            transparent 100%
          ),
          linear-gradient(
            180deg,
            ${FORGE_COLORS.black} 0%,
            ${FORGE_COLORS.soot} 40%,
            ${isLit ? FORGE_COLORS.coalRed : FORGE_COLORS.soot} 95%,
            ${isLit ? FORGE_COLORS.emberDim : "#1a1510"} 100%
          )
        `,
        border: `1px solid ${isLit ? "rgba(255,107,26,0.15)" : FORGE_COLORS.iron + "30"}`,
        padding: "0 0 8px",
        paddingBottom: "180px",
        transition: "background 800ms ease"
      }}
    >
      {/* ═══ Header ═══ */}
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: `1px solid ${isLit ? "rgba(255,107,26,0.15)" : FORGE_COLORS.iron + "30"}`
        }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Hammer size={18} style={{ color: FORGE_COLORS.emberCore }} />
            <h2 className="forge-heading"
              style={{color: forgeTextColor(FORGE_COLORS.emberCore), margin: 0, textShadow: isLit ? `0 0 12px ${FORGE_COLORS.emberCore}40` : "none"}}
            >
              The Blacksmith&rsquo;s Forge
            </h2>
          </div>
          <GarrisonReadiness garrison={garrison} maxGarrison={maxGarrison} />
        </div>

        {/* Resource summary row */}
        <div
          className="flex flex-wrap gap-x-4 gap-y-1"
          style={{ marginTop: 6 }}
        >
          {FORGE_RESOURCES.map((res) => (
            <span className="forge-caption"
              key={res.key}
              style={{color: forgeTextColor(res.color)}}
            >
              {res.label}: {forgeResources[res.key] || 0}
            </span>
          ))}
        </div>
      </div>

      {/* ═══ Forge Navigation ═══ */}
      <div style={{ padding: "0 16px" }}>
        <ForgeNavigation
          currentView={currentView}
          onSetView={setCurrentView}
        />
      </div>

      {/* ═══ Content Area ═══ */}
      <div style={{ padding: "8px 16px" }}>
        {/* Supply event banner (shows on all views) */}
        {supplyEvent && (
          <SupplyEventBanner
            event={supplyEvent}
            remaining={supplyStatus.remaining}
            acknowledged={Array.isArray(bs.usedSupplyEventIds) && bs.usedSupplyEventIds.includes(supplyEvent.id)}
            ironVeinActive={bs.ironVeinActive === true}
            onDismiss={handleDismissSupplyEvent}
            onInvest={handleInvestIronVein}
            denarii={state.denarii || 0}
          />
        )}

        {forgeError && <p role="alert" style={{color: FORGE_COLORS.parchment}}>{forgeError}</p>}
      {currentView === "workshop" && (
          <Workshop
            forgeState={forgeState}
            resources={forgeResources}
            godricGreeting={godricGreeting}
            watBehavior={watBehavior}
            onPumpBellows={handlePumpBellows}
            respect={respect}
            tier={godricTier}
            militaryLine={militaryLine}
            onGodricTalk={handleGodricTalk}
            watFact={watFact}
            onWatTalk={handleWatTalk}
            banter={activeBanter}
          />
        )}

        {currentView === "forging" && (
          forgingDisabled ? (
            <div className="text-center" style={{ padding: "40px 0" }}>
              <AlertTriangle size={32} style={{ color: FORGE_COLORS.emberDim, margin: "0 auto 12px" }} />
              <h3 className="forge-caption"  style={{color: forgeTextColor(FORGE_COLORS.emberCore), marginBottom: 8}}>
                Forge Offline
              </h3>
              <p className="forge-lore"  style={{color: forgeTextColor("#c8b090")}}>
                &ldquo;{supplyEvent?.godricComment || "The bellows need repair."}&rdquo;
              </p>
              <p className="forge-caption"  style={{color: forgeTextColor("#5a5550"), marginTop: 8}}>
                Forging resumes in {bs.supplyEventTurnsLeft || 1} season{(bs.supplyEventTurnsLeft || 1) > 1 ? "s" : ""}.
              </p>
            </div>
          ) : (
            <ForgingGame
              resources={forgeResources}
              onComplete={handleForgingComplete}
              onCancel={handleForgingCancel}
              commissionItem={commissionItem}
              completionUid={bs.nextItemUid ?? 1}
              denarii={state.denarii}
            />
          )
        )}

        {currentView === "forge_result" && forgeResult && (
          <ForgeResultView
            result={forgeResult}
            dispatch={dispatch}
            onDone={handleForgeResultDone}
          />
        )}

        {currentView === "orders" && (
          forgingDisabled ? (
            <div className="text-center" style={{ padding: "40px 0" }}>
              <AlertTriangle size={24} style={{ color: FORGE_COLORS.emberDim, margin: "0 auto 8px" }} />
              <p className="forge-caption"  style={{color: forgeTextColor(FORGE_COLORS.emberCore)}}>
                Forge offline — no commissions until repairs are complete.
              </p>
            </div>
          ) : (
            <CommissionDesk
              resources={forgeResources}
              denarii={state.denarii || 0}
              onCommission={handleCommission}
              godricRec={godricRec}
            />
          )
        )}

        {currentView === "armory" && (
          <>
            <ArmoryView
              inventory={inventory}
              equipped={equipped}
              dispatch={dispatch}
              garrison={garrison}
            />
            <BuyerPanel
              buyers={buyers}
              inventory={inventory}
              dispatch={dispatch}
              salesThisSeason={bs.salesThisSeason || 0}
            />
          </>
        )}

        {currentView === "storefront" && (
          <StorefrontView
            market={state.market}
            turn={state.turn}
            forgeResources={forgeResources}
            denarii={state.denarii || 0}
            blacksmith={bs}
            dispatch={dispatch}
            season={season}
          />
        )}

        {currentView === "ledger" && (
          <ForgeLedger
            blacksmith={bs}
            garrison={garrison}
          />
        )}
      </div>

      {/* ═══ Godric bellows reaction (floating) ═══ */}
      {godricBellowsLine && (
        <div
          className="forge-bellows-reaction forge-lore"
          style={{
            position: "absolute",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 320,
            padding: "6px 14px",
            borderRadius: 6,
            backgroundColor: "rgba(13,10,8,0.9)",
            border: `1px solid ${FORGE_COLORS.emberDim}40`,
            color: forgeTextColor("#c8b090"),
            textAlign: "center",
            zIndex: 10,
            pointerEvents: "none"
          }}
        >
          Godric: &ldquo;{godricBellowsLine}&rdquo;
        </div>
      )}

      {/* ═══ Ambient Footer ═══
          Scribe's-note flavor italic. Bumped from #a89070 to #c8b090 so the
          text reads as fully visible against the dark lower gradient (B-55). */}
      <div
        style={{
          padding: "10px 16px 6px",
          borderTop: `1px solid ${FORGE_COLORS.iron}20`,
          marginTop: 8,
        }}
      >
        <p className="forge-lore forge-ambient"
          style={{
            color: forgeTextColor(isLit ? "rgba(255,107,26,0.7)" : "#c8b090"),
            textAlign: "center",
            margin: 0,
            minHeight: "1.2em",
            opacity: ambientVisible ? 1 : 0,
            transition: "opacity 500ms ease"
          }}
        >
          {FORGE_AMBIENT_TEXTS[ambientIndex]}
        </p>
      </div>
    </div>
  );
}
