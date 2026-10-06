import { useEffect, useRef, type CSSProperties } from "react";
import { Hammer, Sparkles, Info, type LucideIcon } from "lucide-react";
import {isChronicleKind,type SavedChronicleEntry,type ChronicleKind} from '../engine/chronicle.ts';
import type {EconomySeason} from '../engine/foodRequirement.ts';

const SEASON_ICONS = {
  spring: "\u2741",
  summer: "\u2600",
  autumn: "\u2767",
  winter: "\u2744",
} satisfies Record<EconomySeason,string>;

const TYPE_PRESENTATION = {
  action: { Icon: Hammer, color: "#c4a24a", style:{borderLeft:"3px solid #c4a24a"} },
  event: { Icon: Sparkles, color: "#6a4a8a", style:{borderLeft:"3px solid #6a4a8a"} },
  system: { Icon: Info, color: "#6a5a42", style:{borderLeft:"3px solid #6a5a42",fontStyle:"italic"} },
} satisfies Record<ChronicleKind,{Icon:LucideIcon;color:string;style:CSSProperties}>;

export default function Chronicle({ entries }:{entries:readonly SavedChronicleEntry[]}) {
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  const reversed = [...entries].reverse();

  return (
    <div
      className="w-full max-w-xl mx-auto mt-4 rounded-lg border-2 overflow-hidden"
      style={{ borderColor: "#6a5a42", backgroundColor: "#231e16" }}
    >
      <div
        className="px-4 py-2 border-b font-heading text-base font-semibold uppercase tracking-widest"
        style={{ backgroundColor: "#1a1610", borderColor: "#6a5a42", color: "#c4a24a", fontFamily: "Cinzel, serif" }}
      >
        Chronicle of Your Reign
      </div>
      <div
        className="overflow-y-auto p-3 flex flex-col gap-2"
        style={{
          scrollbarGutter: "stable",
          backgroundColor: "#1a1610",
          maxHeight: "min(60vh, 480px)",
        }}
      >
        <div ref={topRef} />
        {reversed.map((entry, i) => {
          const icon = Object.entries(SEASON_ICONS).find(([season])=>season===entry.season)?.[1] ?? "";
          const typeIcon = TYPE_PRESENTATION[isChronicleKind(entry.type)?entry.type:'system'];
          const style = typeIcon.style;
          const season = entry.season ?? '';
          const TypeIcon = typeIcon.Icon;
          return (
            <div
              key={entries.length - 1 - i}
              className="pl-3 py-1.5 text-base leading-relaxed"
              style={{ ...style, color: "#a89070" }}
            >
              <TypeIcon size={12} aria-hidden="true" className="inline-block mr-1" style={{ color: typeIcon.color }} />
              <span className="text-sm font-semibold mr-1.5" style={{ color: "#c4a24a" }}>
                {icon} {entry.year == null?'Unknown year':`Y${entry.year}`} {season?season.charAt(0).toUpperCase()+season.slice(1):'Unknown season'}
              </span>
              <span>{entry.text}</span>
            </div>
          );
        })}
        {entries.length < 3 && (
          <div
            style={{
              color: "#6a5a42",
              fontStyle: "italic",
              fontFamily: "Crimson Text, serif",
              padding: "12px 16px",
              textAlign: "center",
            }}
          >
            New entries appear after each simulated season. Click {"\u2694"} Simulate Season to continue your reign.
          </div>
        )}
      </div>
    </div>
  );
}
