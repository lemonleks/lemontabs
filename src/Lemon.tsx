import { useEffect, useRef, useState } from "preact/hooks";
import { prefs } from "./settings";
import "./lemon.css";

const PHRASES = [
  "When life gives you tabs, make… more tabs?",
  "Squeeze a few of these shut, will you?",
  "Sour news: your RAM called.",
  "Plenty of zest for opening tabs. None for closing them.",
  "That tab from last month is starting to go moldy.",
  "Pucker up, it's cleanup time.",
  "I counted. Twice. Still too many.",
  "Every tab is “just for a second”, huh?",
  "Citrus tip: Cmd/Ctrl+W is very refreshing.",
  "I'd juggle these, but I have no arms.",
  "Somewhere, a bookmark feels very lonely.",
  "Your laptop fan sounds like a juicer.",
  "Vitamin C won't cure tab overload.",
  "Grouping tabs is self-care.",
  "I've seen fruit bowls better organized.",
  "Lemonade break? Close three tabs first.",
  "Fresh tabs only, please.",
  "One of these is the tab you were looking for. Probably.",
  "I'm not sour, I'm just concerned.",
  "Tabs are like lemons: better squeezed than hoarded.",
];

type Mode = "sleeping" | "walking" | "returning";
const HOME_X = 22;
const SPEED = 1.1;

function LemonSvg({ asleep }: { asleep?: boolean }) {
  return (
    <svg class="lm-svg" viewBox="0 0 40 36" width="40" height="36" aria-hidden="true">
      <g class="lm-legs">
        <path class="lm-leg lm-leg-a" d="M15 26 L13.5 33" />
        <path class="lm-leg lm-leg-b" d="M25 26 L26.5 33" />
      </g>
      <g class="lm-body">
        <path class="lm-peel" d="M3 17 Q5 13.5 8 12.5 Q12 5.5 20 5.5 Q28 5.5 32 12.5 Q35 13.5 37 17 Q35 20.5 32 21.5 Q28 28.5 20 28.5 Q12 28.5 8 21.5 Q5 20.5 3 17Z" />
        <path class="lm-shine" d="M12 11 Q15 8.5 19 8.3" />
        <path class="lm-leaf" d="M20 5.8 Q21 0.5 27.5 0.8 Q26 6 20 5.8Z" />
        {asleep ? (
          <g class="lm-face">
            <path d="M21.5 15.5 q1.6 1.4 3.2 0 M27 15.5 q1.6 1.4 3.2 0" />
          </g>
        ) : (
          <g class="lm-face">
            <g class="lm-eyes">
              <circle cx="23.5" cy="15" r="1.5" />
              <circle cx="29" cy="15" r="1.5" />
            </g>
            <path d="M24.5 19.5 q1.8 1.6 3.6 0" />
          </g>
        )}
        <ellipse class="lm-blush" cx="31.5" cy="19" rx="1.8" ry="1.1" />
      </g>
    </svg>
  );
}

/** A lemon that naps bottom-left; poke it to highlight stale tabs and watch it stroll along the bottom edge. */
export function Lemon({ staleCount, onWake }: { staleCount: number; onWake: () => void }) {
  const [mode, setMode] = useState<Mode>("sleeping");
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hint, setHint] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const x = useRef(HOME_X);

  useEffect(() => {
    if (mode !== "sleeping" || staleCount === 0 || prefs.staleHintDismissed) return setHint(false);
    setHint(true);
    const t = setTimeout(() => setHint(false), 10_000);
    return () => clearTimeout(t);
  }, [mode, staleCount > 0]);

  useEffect(() => {
    if (mode !== "walking") return;
    let hide = 0;
    const speak = () => {
      setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      clearTimeout(hide);
      hide = setTimeout(() => setPhrase(""), 4000);
    };
    const first = setTimeout(speak, 2000);
    const every = setInterval(speak, 8500);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      clearTimeout(hide);
      setPhrase("");
    };
  }, [mode]);

  // Position is written straight to the DOM each frame; state only changes on direction/pause flips.
  useEffect(() => {
    if (mode === "sleeping") return;
    let frame = 0;
    let pause = 0;
    let d = dir;
    const tick = () => {
      if (mode === "returning") {
        x.current -= SPEED;
        if (d !== -1) setDir((d = -1));
        if (x.current <= HOME_X) {
          x.current = HOME_X;
          setMode("sleeping");
          return;
        }
      } else if (pause > 0) {
        if (--pause === 0) setPaused(false);
      } else {
        if (Math.random() < 0.01) {
          pause = 20 + Math.floor(Math.random() * 60);
          setPaused(true);
        }
        const max = Math.max(60, innerWidth - 80);
        x.current += SPEED * d;
        if (x.current >= max) setDir((d = -1));
        else if (x.current <= 40) setDir((d = 1));
        x.current = Math.min(max, Math.max(40, x.current));
      }
      if (el.current) el.current.style.left = `${x.current}px`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const wake = () => {
    setHint(false);
    if (staleCount === 0) {
      setMode("walking");
      return;
    }
    setPhrase("On it! Sniffing out the stale ones…");
    setTimeout(() => {
      setPhrase("");
      setDir(1);
      setMode("walking");
      onWake();
    }, 2200);
  };

  const bed = <div class="lm-bed" />;

  if (mode === "sleeping") {
    return (
      <>
        {bed}
        <div
          class="lm lm-sleeping"
          style={{ left: `${HOME_X}px` }}
          onClick={wake}
          title={staleCount ? "Poke me and I'll find your stale tabs" : "Poke the lemon"}
        >
          {phrase && <div class="lm-bubble lm-anchored">{phrase}</div>}
          {!phrase && hint && (
            <div class="lm-bubble lm-anchored">
              <button
                class="lm-close"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  setHint(false);
                  prefs.dismissStaleHint();
                }}
              >
                ✕
              </button>
              Some tabs here haven't been opened in a week. Poke me and I'll point them out.
            </div>
          )}
          {!phrase && <div class="lm-zzz">z<span>z</span><span>z</span></div>}
          <LemonSvg asleep />
        </div>
      </>
    );
  }

  return (
    <>
      {bed}
      <div
        ref={el}
        class={`lm${dir === -1 ? " lm-flip" : ""}${mode === "returning" || !paused ? " lm-moving" : ""}`}
        style={{ left: `${x.current}px` }}
        title="Back to the leaf"
        onClick={() => setMode("returning")}
      >
        {phrase && <div class="lm-bubble">{phrase}</div>}
        <LemonSvg />
      </div>
    </>
  );
}
