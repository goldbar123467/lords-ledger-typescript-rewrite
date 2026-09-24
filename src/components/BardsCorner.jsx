import { useState, useCallback, useEffect, useRef } from "react";
import { BARD_TALES, BARD_STATE_COMMENTS, BARD_RIDDLES } from "../data/tavern";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpeechBubble({ children, animKey }) {
  return (
    <div
      key={animKey}
      className="quill-appear rounded-lg border-2 p-4 mt-3"
      style={{
        backgroundColor: "#2a2010",
        borderColor: "#c4a24a",
        boxShadow: "inset 0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      {children}
    </div>
  );
}

function BardPortrait() {
  return (
    <div
      className="flex items-center justify-center rounded-lg border-2 mx-auto"
      style={{
        width: 80,
        height: 80,
        borderColor: "#c4a24a",
        backgroundColor: "#1a1610",
        boxShadow: "0 0 12px rgba(196, 162, 74, 0.2)",
      }}
    >
      <span
        style={{
          fontSize: 36,
          color: "#c4a24a",
          fontFamily: "serif",
          lineHeight: 1,
        }}
      >
        {"\u266A"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BardsCorner({ state, onNext, onAnswer, onBack }) {
  const content = state.tavern?.bardCurrentContent ?? null;
  const [entryContent] = useState(() => content);
  const [advanceOnEntry] = useState(() =>
    content === null || content.type !== "riddle" || content.answer !== null
  );
  const visibleContent = advanceOnEntry && content === entryContent ? null : content;
  const seededRef = useRef(false);
  const responseRef = useRef(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (advanceOnEntry && !seededRef.current) {
      seededRef.current = true;
      onNext();
    }
  }, [advanceOnEntry, onNext]);

  const reroll = useCallback(() => {
    onNext();
    setAnimKey((k) => k + 1);
  }, [onNext]);

  const handleRiddleAnswer = useCallback((option) => onAnswer(option), [onAnswer]);
  const riddle = visibleContent?.type === "riddle"
    ? BARD_RIDDLES.find(item => item.id === visibleContent.id)
    : null;
  const selectedOption = visibleContent?.type === "riddle" ? visibleContent.answer : null;
  const riddleResult = selectedOption === null ? null
    : selectedOption === riddle?.answer ? "correct" : "wrong";

  useEffect(() => {
    if (selectedOption !== null) responseRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedOption]);

  // --- Render content body ---------------------------------------------------

  let body = null;

  if (visibleContent === null) {
    body = null;
  } else if (visibleContent.type === "tale") {
    body = (
      <SpeechBubble animKey={animKey}>
        {visibleContent.repeat && (
          <p
            className="text-xs mb-2 italic"
            style={{ color: "#8a7a5a", fontFamily: "Crimson Text, serif" }}
          >
            Have I told you this one? No matter. It bears repeating.
          </p>
        )}
        <p
          className="text-sm sm:text-base leading-relaxed"
          style={{ color: "#c8b090", fontFamily: "Crimson Text, serif" }}
        >
          <span style={{ color: "#e8c44a", fontSize: "1.3em", lineHeight: 1 }}>
            {"\u201C"}
          </span>
          {BARD_TALES[visibleContent.index]}
          <span style={{ color: "#e8c44a", fontSize: "1.3em", lineHeight: 1 }}>
            {"\u201D"}
          </span>
        </p>
      </SpeechBubble>
    );
  } else if (visibleContent.type === "comment") {
    body = (
      <SpeechBubble animKey={animKey}>
        <p
          className="text-sm sm:text-base leading-relaxed italic"
          style={{ color: "#c8b090", fontFamily: "Crimson Text, serif" }}
        >
          <span style={{ color: "#e8c44a", fontSize: "1.3em", lineHeight: 1 }}>
            {"\u201C"}
          </span>
          {BARD_STATE_COMMENTS[visibleContent.index]?.text ?? "Your manor endures, my lord."}
          <span style={{ color: "#e8c44a", fontSize: "1.3em", lineHeight: 1 }}>
            {"\u201D"}
          </span>
        </p>
      </SpeechBubble>
    );
  } else if (visibleContent.type === "riddle" && riddle) {
    body = (
      <div key={animKey} className="quill-appear">
        <SpeechBubble>
          <p
            className="text-sm sm:text-base leading-relaxed font-semibold"
            style={{ color: "#e8c44a", fontFamily: "Crimson Text, serif" }}
          >
            {riddle.question}
          </p>
        </SpeechBubble>

        <div className="flex flex-col gap-2 mt-3">
          {visibleContent.optionOrder.map((index) => riddle.options[index]).map((option) => {
            let bg = "#1a1610";
            let border = "#6a5a42";
            let textColor = "#c8b090";

            if (riddleResult !== null && option === riddle.answer) {
              bg = "rgba(74, 138, 58, 0.25)";
              border = "#4a8a3a";
              textColor = "#6dc858";
            } else if (
              riddleResult === "wrong" &&
              option === selectedOption
            ) {
              bg = "rgba(198, 40, 40, 0.2)";
              border = "#c62828";
              textColor = "#e57373";
            }

            return (
              <button
                key={option}
                onClick={() => handleRiddleAnswer(option)}
                disabled={selectedOption !== null}
                className="w-full text-left px-4 py-3 rounded-md border-2 cursor-pointer min-h-[44px]"
                style={{
                  backgroundColor: bg,
                  borderColor: border,
                  color: textColor,
                  fontFamily: "Crimson Text, serif",
                  transition: "all 200ms ease",
                  opacity:
                    riddleResult !== null &&
                    option !== riddle.answer &&
                    option !== selectedOption
                      ? 0.5
                      : 1,
                }}
                onMouseEnter={(e) => {
                  if (riddleResult === null) {
                    e.currentTarget.style.backgroundColor = "#2a2318";
                    e.currentTarget.style.borderColor = "#c4a24a";
                  }
                }}
                onMouseLeave={(e) => {
                  if (riddleResult === null) {
                    e.currentTarget.style.backgroundColor = "#1a1610";
                    e.currentTarget.style.borderColor = "#6a5a42";
                  }
                }}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div ref={responseRef}>
        {riddleResult === "correct" && (
          <SpeechBubble>
            <p
              className="text-base italic"
              style={{ color: "#a9df95", fontFamily: "Crimson Text, serif" }}
            >
                  {riddle.correct}
                  <span
                    className="block mt-1 font-semibold not-italic"
                    style={{ color: "#e8c44a" }}
                  >
                    {visibleContent.awarded ? "+10 denarii" : "You know this one already. No new reward."}
              </span>
            </p>
          </SpeechBubble>
        )}
        {riddleResult === "wrong" && (
          <SpeechBubble>
            <p
              className="text-base italic"
              style={{ color: "#f28b82", fontFamily: "Crimson Text, serif" }}
            >
              {riddle.wrong}
            </p>
          </SpeechBubble>
        )}
        </div>
      </div>
    );
  }

  // --- Layout ----------------------------------------------------------------

  return (
    <div
      className="rounded-lg border-2 p-4 sm:p-5 max-w-xl mx-auto"
      style={{
        backgroundColor: "#1a1610",
        borderColor: "#8a7a3a",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Header */}
      <h3
        className="text-center text-lg sm:text-xl font-bold mb-3"
        style={{ fontFamily: "Cinzel, serif", color: "#e8c44a" }}
      >
        The Bard{"'"}s Corner
      </h3>

      {/* Portrait */}
      <BardPortrait />

      {/* Intro line */}
      <p
        className="text-center italic text-sm mt-3 mb-1"
        style={{ color: "#a89070", fontFamily: "Crimson Text, serif" }}
      >
        Sit, sit! The fire is warm, and my tongue is warmer.
      </p>

      {/* Decorative rule */}
      <div className="decorative-rule" style={{ color: "#8a7a3a" }}>
        {"\u25C6"}
      </div>

      {/* Content */}
      {body}

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={reroll}
          className="flex-1 px-4 py-3 rounded-md border-2 cursor-pointer font-semibold text-sm min-h-[44px]"
          style={{
            backgroundColor: "#231e16",
            borderColor: "#c4a24a",
            color: "#c4a24a",
            fontFamily: "Cinzel, serif",
            transition: "all 200ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#2d2619";
            e.currentTarget.style.borderColor = "#e8c44a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#231e16";
            e.currentTarget.style.borderColor = "#c4a24a";
          }}
        >
          Tell me more...
        </button>
        <button
          onClick={onBack}
          className="flex-1 px-4 py-3 rounded-md border-2 cursor-pointer font-semibold text-sm min-h-[44px]"
          style={{
            backgroundColor: "#1a1610",
            borderColor: "#6a5a42",
            color: "#a89070",
            fontFamily: "Cinzel, serif",
            transition: "all 200ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#2a2318";
            e.currentTarget.style.borderColor = "#a89070";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#1a1610";
            e.currentTarget.style.borderColor = "#6a5a42";
          }}
        >
          Leave
        </button>
      </div>
    </div>
  );
}
