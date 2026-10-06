/**
 * ForgingGame.tsx
 *
 * Phase 2 — The Forging Mini-Game (Anvil Rhythm System)
 *
 * A simplified rhythm game: a strike indicator moves across a track,
 * the player clicks/taps/presses spacebar when it reaches the target zone.
 * Better timing = better quality = better items.
 *
 * Flow: Heating → Striking → Quenching → Result
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Flame, Droplets, Star, Circle, X } from "lucide-react";

import {
  FORGE_COLORS,
  FORGING_DIFFICULTY,
  FORGEABLE_ITEMS,
  GODRIC_FORGING,
  GODRIC_RESULTS,
  calculateGrade,
  FORGE_RESOURCES,
  type ForgeDifficulty,
  type ForgeItemId,
  type ForgeResourceId,
} from "../data/blacksmith";

type ForgeRecipe = typeof FORGEABLE_ITEMS[ForgeItemId];
type ForgeResources = Readonly<Record<ForgeResourceId, number>>;
type Accuracy = 'perfect' | 'good' | 'miss';
type Grade = ReturnType<typeof calculateGrade>;
interface Strike {readonly accuracy: Accuracy; readonly distance: number; readonly beat: number}
interface StrikeStats {
  readonly perfectCount: number; readonly goodCount: number; readonly missCount: number;
  readonly bestStreak: number; readonly streakBonus: number; readonly qualityScore: number;
  readonly strikes: readonly Strike[];
}
interface FinishedStats extends StrikeStats {readonly quenchResult: Accuracy; readonly quenchBonus: number}
export interface ForgingResult {
  readonly completionUid: number; readonly item: ForgeRecipe; readonly grade: Grade;
  readonly qualityScore: number; readonly stats: FinishedStats;
}
interface ForgingGameProps {
  readonly resources: ForgeResources; readonly denarii: number; readonly completionUid: number;
  readonly commissionItem?: ForgeRecipe | null;
  readonly onComplete: (result: ForgingResult) => void; readonly onCancel: () => void;
}
type ForgePhase =
  | {readonly phase: 'select'; readonly attemptUid: number}
  | {readonly phase: 'heating' | 'striking'; readonly attemptUid: number; readonly item: ForgeRecipe}
  | {readonly phase: 'quenching'; readonly attemptUid: number; readonly item: ForgeRecipe; readonly strikes: StrikeStats}
  | {readonly phase: 'result'; readonly result: ForgingResult};

// ─── Constants ──────────────────────────────────────────────────
const TRACK_WIDTH = 500;         // logical track width in px
const TARGET_CENTER = 0.65;      // target zone at 65% of track
const HEAT_DURATION = 3000;      // heating phase ms
const QUENCH_INDICATOR_SPEED = 0.45; // px per ms for quench
const BEAT_PAUSE = 400;          // ms pause between beats

// ─── Deterministic pick from array by index ─────────────────────
function pickLine(arr: readonly string[], index: number) {
  if (!arr || arr.length === 0) return "";
  return arr[index % arr.length] ?? "";
}

// ─── Quality score calculation ──────────────────────────────────
function computeQuality(perfectCount: number, goodCount: number, totalStrikes: number, streakBonus: number, quenchBonus: number) {
  if (totalStrikes === 0) return 0;
  const baseScore = ((perfectCount * 12 + goodCount * 6) / totalStrikes) * (100 / 12);
  return Math.min(100, Math.round(baseScore + streakBonus + quenchBonus));
}

/** Project logical timing coordinates into the rendered track without changing time windows. */
function projectTrack(position: number, pixelOffset = 0): string {
  return 'calc(' + (position / TRACK_WIDTH * 100) + '% - ' + pixelOffset + 'px)';
}
function usePhaseFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({preventScroll: true});
    ref.current?.scrollIntoView({block: 'center', behavior: 'instant'});
  }, []);
  return ref;
}
function isRhythmSpace(event: KeyboardEvent, track: HTMLElement | null): boolean {
  return !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey &&
    (event.code === 'Space' || event.key === ' ') &&
    (document.activeElement === track || document.activeElement === document.body);
}

// ─── Strike History Display ─────────────────────────────────────

function StrikeHistory({ strikes, totalRequired }: {strikes: readonly Strike[]; totalRequired: number}) {
  const slots = Array.from({ length: totalRequired }, (_, i) => {
    const strike = strikes[i];
    if (!strike) return { type: "pending", key: i };
    return { type: strike.accuracy, key: i };
  });

  return (
    <ol className="forge-strike-history" aria-label="Strike history">
      {slots.map(slot => {
        const Icon = slot.type === 'perfect' ? Star : slot.type === 'miss' ? X : Circle;
        return (
          <li key={slot.key} data-accuracy={slot.type} aria-label={'Strike ' + (slot.key + 1) + ': ' + slot.type}>
            <Icon size={18} aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );
}

// ─── Quality Gauge ──────────────────────────────────────────────

function QualityGauge({ score, overshoot }: {score: number; overshoot: boolean}) {
  const gradeColor =
    score >= 90 ? "#ffd700" :
    score >= 70 ? "#d4d1c9" :
    score >= 50 ? "#d0b997" :
    score >= 30 ? "#daac7c" :
    "#caa494";
  const gradeLabel =
    score >= 90 ? "Masterwork" :
    score >= 70 ? "Fine" :
    score >= 50 ? "Standard" :
    score >= 30 ? "Rough" :
    "Scrap";

  return (
    <div className="forge-quality">
      <div className="forge-quality-heading">
        <span>Quality</span>
        <span>{Math.round(score)}% — {gradeLabel}</span>
      </div>
      <div className="forge-quality-track" role="progressbar" aria-label="Crafting quality"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(score)}>
        <div className={'forge-quality-fill' + (overshoot ? ' forge-quality-overshoot' : '')}
          style={{width: Math.min(score, 100) + '%', backgroundColor: gradeColor}} />
      </div>
    </div>
  );
}

// ─── Item Preview (evolving shape during forging) ───────────────

function ItemPreview({ item, progress, qualityScore }: {item: ForgeRecipe; progress: number; qualityScore: number}) {
  // Progress: 0 to 1 (strikes completed / total)
  const stage = Math.floor(progress * 5);
  const isGood = qualityScore >= 50;

  const baseColor =
    stage <= 1 ? FORGE_COLORS.emberCore :
    stage <= 2 ? FORGE_COLORS.emberGlow :
    stage <= 3 ? "#8a7a6a" :
    isGood ? "#a0a0a0" : "#6a5a4a";

  // Generic evolving shape — wider and more defined as forging progresses
  const height = 20 + stage * 10;
  const width = item?.category === "armor" ? 30 + stage * 6 : 8 + stage * 4;
  const borderRadius =
    item?.category === "armor" ? `${4 + stage}px` :
    `${2}px ${2}px ${1}px ${1}px`;

  return (
    <figure className="forge-item-preview">
      <div aria-hidden="true" style={{width, height, borderRadius, backgroundColor: baseColor,
        boxShadow: stage <= 2 ? '0 0 ' + (8 + stage * 4) + 'px ' + FORGE_COLORS.emberCore + '40'
          : isGood ? '0 0 6px rgba(160,160,160,0.3)' : 'none',
        border: isGood && stage >= 3 ? '1px solid rgba(200,200,200,0.2)' : 'none'}} />
      <figcaption>{item.name || "Unknown"}</figcaption>
    </figure>
  );
}

// ─── Heating Phase ──────────────────────────────────────────────

function HeatingPhase({ item, onComplete }: {item: ForgeRecipe; onComplete: () => void}) {
  const headingRef = usePhaseFocus<HTMLHeadingElement>();
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let rafId = 0;
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const pct = Math.min(elapsed / HEAT_DURATION, 1);
      setProgress(pct);
      if (pct >= 1) {
        onComplete();
        return;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete]);

  const barColor =
    progress < 0.3 ? FORGE_COLORS.emberDim :
    progress < 0.7 ? FORGE_COLORS.emberCore :
    FORGE_COLORS.emberHot;

  return (
    <section className="forge-phase forge-heating" aria-labelledby="forge-heating-heading">
      <Flame size={32} className="forge-warm-icon" aria-hidden="true" />
      <h3 id="forge-heating-heading" ref={headingRef} tabIndex={-1}>Heating the Metal</h3>
      <p>{item.name} is placed in the forge...</p>
      <div className="forge-heat-track" role="progressbar" aria-label="Heating progress"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div style={{width: progress * 100 + '%', backgroundColor: barColor}} />
      </div>
      <p className="forge-controls">When ready, click the track or press Space as the diamond reaches the bright zone.</p>
      <blockquote className="forge-coaching">&ldquo;{pickLine(GODRIC_FORGING.start, 0)}&rdquo;</blockquote>
    </section>
  );
}

// ─── Strike Track (the main rhythm game) ────────────────────────

function StrikeTrack({
  difficulty,
  item,
  onAllStrikesComplete,
}: {difficulty: ForgeDifficulty; item: ForgeRecipe; onAllStrikesComplete: (stats: StrikeStats) => void}) {
  const config = FORGING_DIFFICULTY[difficulty];
  const { strikes: totalStrikes, tempo, perfectWindow, goodWindow } = config;

  const [currentBeat, setCurrentBeat] = useState(0);
  const [indicatorPos, setIndicatorPos] = useState(0);
  const [phase, setPhase] = useState<'moving' | 'struck' | 'pausing' | 'done'>("moving");
  const [strikeResults, setStrikeResults] = useState<readonly Strike[]>([]);
  const [perfectCount, setPerfectCount] = useState(0);
  const [goodCount, setGoodCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [streakBonus, setStreakBonus] = useState(0);
  const [qualityScore, setQualityScore] = useState(50);
  const [overshoot, setOvershoot] = useState(false);
  const [lastResult, setLastResult] = useState<Accuracy | null>(null);
  const [godricLine, setGodricLine] = useState(() => pickLine(GODRIC_FORGING.start, 0));
  const [flashClass, setFlashClass] = useState("");

  const rafRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const trackRef = usePhaseFocus<HTMLButtonElement>();
  const handleStrikeResultRef = useRef<((accuracy: Accuracy, distance: number) => void) | null>(null);

  const targetPx = TRACK_WIDTH * TARGET_CENTER;
  const speed = TRACK_WIDTH / tempo; // px per ms

  // Advance to next beat after pause
  const nextBeat = useCallback(() => {
    const next = currentBeat + 1;
    if (next >= totalStrikes) {
      setPhase("done");
      const q = computeQuality(perfectCount, goodCount, totalStrikes, streakBonus, 0);
      setQualityScore(q);
      onAllStrikesComplete({
        perfectCount,
        goodCount,
        missCount,
        bestStreak,
        streakBonus,
        qualityScore: q,
        strikes: strikeResults,
      });
      return;
    }
    setCurrentBeat(next);
    setIndicatorPos(0);
    startTimeRef.current = null;
    setPhase("moving");
    setLastResult(null);
  }, [currentBeat, totalStrikes, perfectCount, goodCount, missCount, bestStreak, streakBonus, strikeResults, onAllStrikesComplete]);

  // Wait on the committed strike counts before advancing. A timer captured in
  // the strike handler would report the previous beat's counts on completion.
  useEffect(() => {
    if (phase !== "pausing") return;
    const timer = setTimeout(nextBeat, BEAT_PAUSE);
    return () => clearTimeout(timer);
  }, [phase, nextBeat]);

  // Handle strike result
  const handleStrikeResult = useCallback((accuracy: Accuracy, distance: number) => {
    if (phase !== "moving") return;
    cancelAnimationFrame(rafRef.current);
    setPhase("struck");

    const result = { accuracy, distance, beat: currentBeat };
    setStrikeResults((prev) => [...prev, result]);
    setLastResult(accuracy);

    // Update counts
    let newPerfect = perfectCount;
    let newGood = goodCount;
    let newMiss = missCount;
    let newStreak = currentStreak;
    let newBest = bestStreak;
    let newStreakBonus = streakBonus;
    const lineIndex = currentBeat;

    if (accuracy === "perfect") {
      newPerfect++;
      newStreak++;
      setPerfectCount(newPerfect);
      setFlashClass("forge-strike-perfect");
      setGodricLine(pickLine(GODRIC_FORGING.perfect, lineIndex));
    } else if (accuracy === "good") {
      newGood++;
      setGoodCount(newGood);
      setFlashClass("forge-strike-good");
      setGodricLine(pickLine(GODRIC_FORGING.good, lineIndex));
    } else {
      newMiss++;
      newStreak = 0;
      setMissCount(newMiss);
      setFlashClass("forge-strike-miss");
      if (currentStreak >= 3) {
        setGodricLine(GODRIC_FORGING.streakBroken);
      } else {
        setGodricLine(pickLine(GODRIC_FORGING.miss, lineIndex));
      }
    }

    // Streak milestones
    if (newStreak === 3) {
      setGodricLine(GODRIC_FORGING.streak3);
    } else if (newStreak === 5) {
      setGodricLine(GODRIC_FORGING.streak5);
    } else if (newStreak === 8) {
      setGodricLine(GODRIC_FORGING.streak8);
    }

    newBest = Math.max(newBest, newStreak);
    newStreakBonus = Math.min(newBest, 15); // cap at +15

    setCurrentStreak(newStreak);
    setBestStreak(newBest);
    setStreakBonus(newStreakBonus);

    // Quality
    const totalDone = newPerfect + newGood + newMiss;
    const q = computeQuality(newPerfect, newGood, totalDone, newStreakBonus, 0);
    setQualityScore(q);

    // Overshoot animation on perfect
    if (accuracy === "perfect") {
      setOvershoot(true);
      setTimeout(() => setOvershoot(false), 300);
    }

    // Clear flash and pause before next beat
    setTimeout(() => setFlashClass(""), 400);
    setTimeout(() => {
      setPhase("pausing");
    }, 200);
  }, [phase, currentBeat, perfectCount, goodCount, missCount, currentStreak, bestStreak, streakBonus]);

  // Keep ref in sync for animation loop
  useEffect(() => { handleStrikeResultRef.current = handleStrikeResult; }, [handleStrikeResult]);

  // Animation loop (uses ref to avoid stale closure)
  useEffect(() => {
    if (phase !== "moving") return;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const newPos = elapsed * speed;

      if (newPos >= TRACK_WIDTH) {
        // Missed — indicator reached the end
        if (handleStrikeResultRef.current) handleStrikeResultRef.current("miss", TRACK_WIDTH);
        return;
      }

      setIndicatorPos(newPos);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, speed, currentBeat]);

  // Player strike handler
  const handlePlayerStrike = useCallback(() => {
    if (phase !== "moving") return;
    const distance = Math.abs(indicatorPos - targetPx);

    let accuracy: Accuracy;
    // Convert pixel distance to ms-equivalent for comparison with windows
    const msDistance = distance / speed;
    if (msDistance <= perfectWindow) {
      accuracy = "perfect";
    } else if (msDistance <= goodWindow) {
      accuracy = "good";
    } else {
      accuracy = "miss";
    }

    handleStrikeResult(accuracy, distance);
  }, [phase, indicatorPos, targetPx, speed, perfectWindow, goodWindow, handleStrikeResult]);

  // Keyboard support
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isRhythmSpace(e, trackRef.current)) {
        e.preventDefault();
        if (!e.repeat) handlePlayerStrike();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handlePlayerStrike, trackRef]);

  if (phase === "done") return null;

  // Target zone rendering
  const perfectHalfPx = (perfectWindow * speed);
  const goodHalfPx = (goodWindow * speed);

  return (
    <section className="forge-phase" aria-label={'Forging ' + item.name}>
      <div className="forge-phase-heading">
        <h3>Forging: {item.name}</h3>
        <p>Strike {Math.min(currentBeat + 1, totalStrikes)} of {totalStrikes}</p>
      </div>
      <div className="forge-quality-row">
        <QualityGauge score={qualityScore} overshoot={overshoot} />
        <p className="forge-streak">Streak: {currentStreak}</p>
      </div>
      <ItemPreview item={item} progress={strikeResults.length / totalStrikes} qualityScore={qualityScore} />
      <button type="button" ref={trackRef} className={'forge-rhythm-track ' + flashClass}
        aria-label="Strike the metal" aria-describedby="forge-strike-instructions"
        aria-disabled={phase !== 'moving'} onClick={handlePlayerStrike}>
        <span className="forge-hit-zone forge-hit-zone--good" aria-hidden="true"
          style={{left: projectTrack(targetPx - goodHalfPx), width: projectTrack(goodHalfPx * 2)}} />
        <span className="forge-hit-zone forge-hit-zone--perfect" aria-hidden="true"
          style={{left: projectTrack(targetPx - perfectHalfPx), width: projectTrack(perfectHalfPx * 2)}} />
        <span className="forge-target-line" aria-hidden="true" style={{left: projectTrack(targetPx, 1)}} />
        <span className="forge-rhythm-indicator" aria-hidden="true" data-accuracy={lastResult ?? 'pending'}
          style={{left: projectTrack(indicatorPos, 8)}} />
      </button>
      <p id="forge-strike-instructions" className="forge-controls">
        Click / Spacebar when the diamond reaches the bright zone. Enter also works on the focused track.
      </p>
      <p className="forge-strike-feedback" role="status">
        {strikeResults.at(-1)?.accuracy === 'perfect' ? 'Perfect strike' : strikeResults.at(-1)?.accuracy === 'good' ? 'Good strike'
          : strikeResults.at(-1)?.accuracy === 'miss' ? 'Missed strike' : 'Ready for the next strike'}
      </p>
      <StrikeHistory strikes={strikeResults} totalRequired={totalStrikes} />
      <blockquote className="forge-coaching"><span>Godric:{" "}</span>&ldquo;{godricLine}&rdquo;</blockquote>
    </section>
  );
}

// ─── Quenching Phase ────────────────────────────────────────────

function QuenchPhase({ onComplete }: {onComplete: (bonus: number, accuracy: Accuracy) => void}) {
  const trackRef = usePhaseFocus<HTMLButtonElement>();
  const [indicatorPos, setIndicatorPos] = useState(0);
  const [phase, setPhase] = useState<'moving' | 'struck' | 'done'>("moving");
  const [result, setResult] = useState<Accuracy | null>(null);
  const [steamActive, setSteamActive] = useState(false);
  const rafRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const handleQuenchRef = useRef<((accuracy: Accuracy) => void) | null>(null);

  const targetPx = TRACK_WIDTH * 0.5; // center for quench
  const perfectHalf = 80;
  const goodHalf = 140;

  const handleQuench = useCallback((accuracy: Accuracy) => {
    if (phase !== "moving") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("struck");
    setResult(accuracy);
    setSteamActive(true);

    const bonus =
      accuracy === "perfect" ? 10 :
      accuracy === "good" ? 5 : 0;

    setTimeout(() => {
      setPhase("done");
      onComplete(bonus, accuracy);
    }, 2000);
  }, [phase, onComplete]);

  // Sync ref and run animation loop
  useEffect(() => { handleQuenchRef.current = handleQuench; }, [handleQuench]);

  useEffect(() => {
    if (phase !== "moving") return;
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const pos = elapsed * QUENCH_INDICATOR_SPEED;
      if (pos >= TRACK_WIDTH) {
        if (handleQuenchRef.current) handleQuenchRef.current("miss");
        return;
      }
      setIndicatorPos(pos);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  const handleClick = useCallback(() => {
    if (phase !== "moving") return;
    const distance = Math.abs(indicatorPos - targetPx);
    const accuracy =
      distance <= perfectHalf ? "perfect" :
      distance <= goodHalf ? "good" :
      "miss";
    handleQuench(accuracy);
  }, [phase, indicatorPos, targetPx, handleQuench]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isRhythmSpace(e, trackRef.current)) {
        e.preventDefault();
        if (!e.repeat) handleClick();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleClick, trackRef]);

  const quenchLine = result
    ? (result === "perfect" ? GODRIC_FORGING.perfectQuench
      : result === "good" ? GODRIC_FORGING.goodQuench
      : GODRIC_FORGING.missedQuench)
    : pickLine(GODRIC_FORGING.preQuench, 0);

  return (
    <section className="forge-phase forge-quenching" aria-labelledby="forge-quench-heading">
      <Droplets size={28} className="forge-water-icon" aria-hidden="true" />
      <h3 id="forge-quench-heading">Quench the Steel</h3>
      <button type="button" ref={trackRef} className="forge-rhythm-track forge-rhythm-track--quench"
        aria-label="Quench the steel" aria-describedby="forge-quench-instructions"
        aria-disabled={phase !== 'moving'} onClick={handleClick}>
        <span className="forge-hit-zone forge-hit-zone--good" aria-hidden="true"
          style={{left: projectTrack(targetPx - goodHalf), width: projectTrack(goodHalf * 2)}} />
        <span className="forge-hit-zone forge-hit-zone--perfect" aria-hidden="true"
          style={{left: projectTrack(targetPx - perfectHalf), width: projectTrack(perfectHalf * 2)}} />
        <span className="forge-target-line" aria-hidden="true" style={{left: projectTrack(targetPx, 1)}} />
        <span className="forge-rhythm-indicator forge-rhythm-indicator--quench" aria-hidden="true"
          data-accuracy={result ?? 'pending'} style={{left: projectTrack(indicatorPos, 7)}} />
      </button>
      <p id="forge-quench-instructions" className="forge-controls">
        Click / Spacebar to Plunge when the diamond reaches the bright zone. Enter also works on the focused track.
      </p>
      <p className="forge-strike-feedback" role="status">
        {result === 'perfect' ? 'Perfect quench' : result === 'good' ? 'Good quench'
          : result === 'miss' ? 'Missed quench' : 'Ready to quench'}
      </p>
      {steamActive && <div className="forge-steam" aria-hidden="true">
        {Array.from({length: result === 'perfect' ? 12 : result === 'good' ? 6 : 2}).map((_, i) =>
          <span key={i} className="forge-steam-particle" style={{width: 4 + i % 3 * 2,
            height: 4 + i % 3 * 2, animationDelay: i * .1 + 's'}} />)}
      </div>}
      <blockquote className="forge-coaching">Godric: &ldquo;{quenchLine}&rdquo;</blockquote>
    </section>
  );
}

// ─── Result Screen ──────────────────────────────────────────────

function ResultScreen({ item, grade, qualityScore, stats, onFinish }: {item: ForgeRecipe; grade: Grade; qualityScore: number; stats: FinishedStats; onFinish: () => void}) {
  const headingRef = usePhaseFocus<HTMLHeadingElement>();
  const godricLine = useMemo(
    () => pickLine(GODRIC_RESULTS[grade.grade] || GODRIC_RESULTS.Standard, stats.bestStreak),
    [grade.grade, stats.bestStreak]
  );

  const finalMilitary = Math.round((item.baseMilitary || 0) * grade.statMultiplier);
  const finalTrade = Math.round((item.baseTradeValue || 0) * grade.tradeMultiplier);

  return (
    <section className="forge-phase forge-result" aria-labelledby="forge-result-heading">
      <div className="forge-result-grade forge-result-reveal" data-grade={grade.grade}>
        <h3 id="forge-result-heading" ref={headingRef} tabIndex={-1} aria-label={grade.grade + ' ' + item.name}>{grade.grade}</h3>
        <p className="forge-result-name">{item.name}</p>
        <p>{grade.description}</p>
      </div>
      <dl className="forge-stats">
        <StatBox label="Quality" value={qualityScore + '%'} color={grade.color} />
        <StatBox label="Perfect Strikes" value={stats.perfectCount} color={FORGE_COLORS.sparkYellow} />
        <StatBox label="Good Strikes" value={stats.goodCount} color="#c0c0c0" />
        <StatBox label="Missed" value={stats.missCount} color="#c62828" />
        <StatBox label="Best Streak" value={stats.bestStreak} color={FORGE_COLORS.emberCore} />
        <StatBox label="Durability" value={grade.durability} color="#a89070" />
        {finalMilitary > 0 && <StatBox label="Military" value={'+' + finalMilitary} color="#8b2020" />}
        <StatBox label="Trade Value" value={finalTrade + 'd'} color="#c4a24a" />
      </dl>
      <blockquote className="forge-coaching"><span>Godric:{" "}</span>&ldquo;{godricLine}&rdquo;</blockquote>
      <button type="button" className="forge-action" onClick={onFinish}>Collect Item</button>
    </section>
  );
}

function StatBox({ label, value, color }: {label: string; value: string | number; color: string}) {
  return (
    <div className="forge-stat" style={{borderTopColor: color}}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function materialAmount(resources: ForgeResources, id: string): number {
  const material = FORGE_RESOURCES.find(entry => entry.key === id);
  return material ? resources[material.key] : 0;
}

// ─── Item Selector (simple, expanded in Phase 3) ────────────────

function ItemSelector({ resources, denarii, onSelect, onCancel }: {resources: ForgeResources; denarii: number; onSelect: (item: ForgeRecipe) => void; onCancel: () => void}) {
  const headingRef = usePhaseFocus<HTMLHeadingElement>();
  const items = Object.values(FORGEABLE_ITEMS);

  function canAfford(item: ForgeRecipe) {
    const cost = item.cost;
    return Object.entries(cost).every(([res, amount]) => {
      if (res === "gold") return Number.isFinite(denarii) && denarii >= amount;
      return materialAmount(resources, res) >= amount;
    });
  }

  return (
    <section className="forge-selector" aria-labelledby="forge-selector-heading">
      <div className="forge-phase-heading">
        <h3 id="forge-selector-heading" ref={headingRef} tabIndex={-1}>Choose What to Forge</h3>
        <button type="button" className="forge-action" onClick={onCancel}>Back</button>
      </div>
      <div className="forge-recipes">
        {items.map(item => {
          const affordable = canAfford(item);
          const diff = FORGING_DIFFICULTY[item.difficulty];
          return (
            <button type="button" key={item.id} className="forge-recipe" disabled={!affordable}
              onClick={() => affordable && onSelect(item)}>
              <span className="forge-recipe-heading"><strong>{item.name}</strong><span>{item.category}</span></span>
              <span className="forge-recipe-description">{item.description}</span>
              <span className="forge-recipe-difficulty">{diff.label} ({diff.strikes} strikes)</span>
              <span className="forge-recipe-costs">
                {Object.entries(item.cost).map(([res, amount]) => {
                  if (amount === 0) return null;
                  const has = res === 'gold' ? denarii >= amount : materialAmount(resources, res) >= amount;
                  return <span key={res} data-affordable={has}>{res}: {amount}{!has && " (short)"}</span>;
                })}
              </span>
              {!affordable && <span className="forge-recipe-unavailable">More materials or gold are needed.</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main ForgingGame Component
// ═══════════════════════════════════════════════════════════════

export default function ForgingGame({ resources, onComplete, onCancel, commissionItem, completionUid, denarii }: ForgingGameProps) {
  // Capture the completion UID at mount. Each phase owns exactly the data it needs.
  const [view, setView] = useState<ForgePhase>(() => commissionItem
    ? {phase: 'heating', item: commissionItem, attemptUid: completionUid}
    : {phase: 'select', attemptUid: completionUid});

  const handleSelectItem = useCallback((item: ForgeRecipe) => {
    setView(previous => previous.phase === 'select'
      ? {phase: 'heating', item, attemptUid: previous.attemptUid} : previous);
  }, []);
  const handleHeatingComplete = useCallback(() => {
    setView(previous => previous.phase === 'heating' ? {...previous, phase: 'striking'} : previous);
  }, []);
  const handleAllStrikesComplete = useCallback((strikes: StrikeStats) => {
    setView(previous => previous.phase === 'striking' ? {...previous, phase: 'quenching', strikes} : previous);
  }, []);
  const handleQuenchComplete = useCallback((quenchBonus: number, quenchResult: Accuracy) => {
    setView(previous => {
      if (previous.phase !== 'quenching') return previous;
      const stats = previous.strikes;
      const qualityScore = computeQuality(stats.perfectCount, stats.goodCount,
        stats.perfectCount + stats.goodCount + stats.missCount, stats.streakBonus, quenchBonus);
      return {phase: 'result', result: {
        completionUid: previous.attemptUid, item: previous.item, qualityScore,
        grade: calculateGrade(qualityScore), stats: {...stats, quenchResult, quenchBonus},
      }};
    });
  }, []);
  const handleFinish = useCallback(() => {
    if (view.phase === 'result') onComplete(view.result);
  }, [view, onComplete]);

  return (
    <div className="forge-minigame">
      {view.phase === 'select' && <ItemSelector resources={resources} denarii={denarii}
        onSelect={handleSelectItem} onCancel={onCancel} />}
      {view.phase === 'heating' && <HeatingPhase item={view.item} onComplete={handleHeatingComplete} />}
      {view.phase === 'striking' && <StrikeTrack difficulty={view.item.difficulty} item={view.item}
        onAllStrikesComplete={handleAllStrikesComplete} />}
      {view.phase === 'quenching' && <QuenchPhase onComplete={handleQuenchComplete} />}
      {view.phase === 'result' && <ResultScreen item={view.result.item} grade={view.result.grade}
        qualityScore={view.result.qualityScore} stats={view.result.stats} onFinish={handleFinish} />}
    </div>
  );
}
