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
  "Every tab is “just for a second”, huh?",
  "Citrus tip: Cmd/Ctrl+W is very refreshing.",
  "Somewhere, a bookmark feels very lonely.",
  "Your laptop fan sounds like a juicer.",
  "Vitamin C won't cure tab overload.",
  "Grouping tabs is self-care.",
  "I've seen fruit bowls better organized.",
  "Lemonade break? Close three tabs first.",
  "One of these is the tab you were looking for. Probably.",
  "I'm not sour, I'm just concerned.",
  "Drag a tab onto a group. I dare you.",
  "Cmd+Z works here too. I checked.",
];

const CHEERS = ["One less! 🍋", "Ahh, lighter already.", "Zesty work!", "Fresh!", "Keep squeezing!", "That's the spirit."];

interface Stats {
  total: number;
  staleCount: number;
  dupes: number;
  windows: number;
}

/** Lines about what's actually open right now, mixed in with the generic ones. */
function aboutYourTabs({ total, staleCount, dupes, windows }: Stats): string[] {
  const lines = [total === 1 ? "Just one tab? Who are you?!" : `${total} tabs. I counted. Twice.`];
  if (total > 100) lines.push(`${total} tabs! My leaf is spinning.`);
  if (staleCount) lines.push(`${staleCount} of them haven't seen you in a week.`);
  if (dupes) lines.push(dupes === 1 ? "There's a duplicate in here. Just saying." : `${dupes} duplicates. Twins are cute, tabs less so.`);
  if (windows > 1) lines.push(`${windows} windows? Someone's busy.`);
  return lines;
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

type Mode = "sleeping" | "walking" | "returning";
type Mood = "idle" | "happy" | "surprised";
const HOME_X = 18;
const SPEED = 1.1;
const NAP_AFTER_MS = 60_000;

/** setTimeout by name: setting a name again replaces its timer, and all of them stop on unmount. */
function useTimers() {
  const timers = useRef(new Map<string, number>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (name: string, fn: () => void, ms: number) => {
    clearTimeout(timers.current.get(name));
    timers.current.set(name, setTimeout(fn, ms));
  };
}

function LemonSvg({ asleep }: { asleep: boolean }) {
  return (
    <svg class="lm-svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <defs>
        <radialGradient id="lm-skin" cx="0.38" cy="0.3" r="0.75">
          <stop offset="0" stop-color="#fff6b0" />
          <stop offset="0.45" stop-color="#fad62a" />
          <stop offset="1" stop-color="#e3a800" />
        </radialGradient>
      </defs>

      <g class="lm-legs">
        <g class="lm-leg lm-leg-a">
          <path d="M26 45 L24.5 55" />
          <ellipse cx="23.5" cy="56.6" rx="3.6" ry="2" />
        </g>
        <g class="lm-leg lm-leg-b">
          <path d="M38 45 L39.5 55" />
          <ellipse cx="40.5" cy="56.6" rx="3.6" ry="2" />
        </g>
      </g>

      <g class="lm-body">
        <g class="lm-arm lm-arm-l">
          <path d="M11 32 Q6 37 7.5 42" />
          <circle cx="7.6" cy="42.6" r="2.2" />
        </g>
        <g class="lm-arm lm-arm-r">
          <path d="M53 32 Q58 37 56.5 42" />
          <circle cx="56.4" cy="42.6" r="2.2" />
        </g>

        <path class="lm-stem" d="M32 13 Q32 9 33.6 7" />
        <g class="lm-leaf">
          <path d="M33.6 8 Q38 0.8 47.5 2.8 Q43.5 10.4 33.6 8Z" />
          <path class="lm-vein" d="M34.8 7.5 Q40.5 4.8 46 3.6" />
        </g>
        <path
          class="lm-peel"
          d="M6 30 Q8 26 12 24.5 Q17 13 32 13 Q47 13 52 24.5 Q56 26 58 30 Q56 34 52 35.5 Q47 47 32 47 Q17 47 12 35.5 Q8 34 6 30Z"
        />
        <path class="lm-shine" d="M16.5 21.5 Q21.5 16 29 15.6" />
        <g class="lm-pores">
          <circle cx="45" cy="21" r="0.7" />
          <circle cx="48.5" cy="27" r="0.7" />
          <circle cx="44" cy="41" r="0.7" />
          <circle cx="19" cy="39" r="0.7" />
          <circle cx="14.5" cy="30.5" r="0.7" />
          <circle cx="36" cy="44" r="0.7" />
        </g>
        <ellipse class="lm-cheek" cx="19" cy="34.5" rx="2.8" ry="1.6" />
        <ellipse class="lm-cheek" cx="45" cy="34.5" rx="2.8" ry="1.6" />

        {asleep ? (
          <g class="lm-face">
            <path d="M21.5 28.5 Q25 31.4 28.5 28.5" />
            <g class="lm-sleep-eye">
              <path d="M35.5 28.5 Q39 31.4 42.5 28.5" />
            </g>
            {/* Hover: it cracks one eye open. */}
            <g class="lm-peek">
              <ellipse class="lm-white" cx="39" cy="28.4" rx="4" ry="3" />
              <circle class="lm-pupil" cx="39.4" cy="28.8" r="1.8" />
            </g>
            <ellipse class="lm-snore" cx="32" cy="36" rx="1.4" ry="1.2" />
          </g>
        ) : (
          <g class="lm-face">
            <g class="lm-brows">
              <path d="M21 21.2 Q25 19.2 28.5 20.8" />
              <path d="M35.5 20.8 Q39 19.2 43 21.2" />
            </g>
            <g class="lm-eyes">
              <ellipse class="lm-white" cx="25" cy="28" rx="4.3" ry="4.8" />
              <ellipse class="lm-white" cx="39" cy="28" rx="4.3" ry="4.8" />
              <g class="lm-pupils">
                <circle class="lm-pupil" cx="25.4" cy="28.6" r="2.3" />
                <circle class="lm-pupil" cx="39.4" cy="28.6" r="2.3" />
                <circle class="lm-glint" cx="26.3" cy="27.5" r="0.8" />
                <circle class="lm-glint" cx="40.3" cy="27.5" r="0.8" />
              </g>
            </g>
            <path class="lm-mouth lm-smile" d="M28 35 Q32 38.8 36 35" />
            <ellipse class="lm-mouth lm-open" cx="32" cy="36.2" rx="2.6" ry="2.1" />
          </g>
        )}
      </g>
    </svg>
  );
}

/**
 * Lemon, the mascot. Naps on a leaf bottom-left; poke it and it wakes (pointing out stale tabs if
 * there are any), strolls along the bottom edge, follows the pointer with its eyes, comments on
 * your tabs, cheers when you close one, and goes back to its leaf after a minute or when you click
 * the leaf. Clicking it while awake makes it hop and talk.
 */
export function Lemon({ onWake, ...stats }: Stats & { onWake: () => void }) {
  const [mode, setMode] = useState<Mode>("sleeping");
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hint, setHint] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [hop, setHop] = useState(0);
  const el = useRef<HTMLDivElement>(null);
  const x = useRef(HOME_X);
  const later = useTimers();
  const latest = useRef(stats);
  latest.current = stats;
  const awake = mode !== "sleeping";

  const say = (text: string, ms = 4000) => {
    setPhrase(text);
    later("say", () => setPhrase(""), ms);
  };
  const jump = (next: Mood = "happy") => {
    setHop((h) => h + 1);
    setMood(next);
    later("mood", () => setMood("idle"), 900);
  };
  const goHome = () => {
    say("Back to my leaf…", 2500);
    setMode("returning");
  };

  useEffect(() => {
    if (mode !== "sleeping" || stats.staleCount === 0 || prefs.staleHintDismissed) return setHint(false);
    setHint(true);
    later("hint", () => setHint(false), 10_000);
  }, [mode, stats.staleCount > 0]);

  // Chatter while walking, then a nap after a while.
  useEffect(() => {
    if (mode !== "walking") return;
    const talk = () => say(Math.random() < 0.5 ? pick(aboutYourTabs(latest.current)) : pick(PHRASES));
    later("first-words", talk, 1800);
    const every = setInterval(talk, 8500);
    later("nap", () => {
      say("Yawn… nap time.", 2500);
      later("go-home", () => setMode("returning"), 1200);
    }, NAP_AFTER_MS);
    return () => clearInterval(every);
  }, [mode]);

  // A tab closed while it's awake: little celebration, at most every few seconds.
  const prevTotal = useRef(stats.total);
  const lastCheer = useRef(0);
  useEffect(() => {
    const dropped = stats.total < prevTotal.current;
    prevTotal.current = stats.total;
    if (!dropped || mode !== "walking" || Date.now() - lastCheer.current < 3000) return;
    lastCheer.current = Date.now();
    jump("happy");
    say(pick(CHEERS), 2000);
  }, [stats.total]);

  // Eyes follow the pointer. Written to CSS variables, so moving the mouse never re-renders.
  useEffect(() => {
    if (!awake) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = el.current;
        if (!node) return;
        const r = node.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.45);
        const len = Math.hypot(dx, dy) || 1;
        // The drawing is mirrored when walking left, so mirror the gaze too.
        node.style.setProperty("--px", ((dx / len) * 1.7 * (dir === -1 ? -1 : 1)).toFixed(2));
        node.style.setProperty("--py", ((dy / len) * 1.5).toFixed(2));
      });
    };
    addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove);
    };
  }, [awake, dir]);

  // Position is written straight to the DOM each frame; state only changes on direction/pause flips.
  useEffect(() => {
    if (!awake) return;
    let frame = 0;
    let pause = 0;
    let d = dir;
    const tick = () => {
      if (mode === "returning") {
        x.current -= SPEED * 1.6;
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
          pause = 30 + Math.floor(Math.random() * 70);
          setPaused(true);
        }
        const max = Math.max(80, innerWidth - 90);
        x.current += SPEED * d;
        if (x.current >= max) setDir((d = -1));
        else if (x.current <= 80) setDir((d = 1));
        x.current = Math.min(max, Math.max(80, x.current));
      }
      if (el.current) el.current.style.left = `${x.current}px`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const wake = () => {
    if (mood === "surprised") return; // already waking up
    setHint(false);
    setMood("surprised");
    if (stats.staleCount === 0) {
      say(pick(["Huh? Oh, hi!", "I'm up, I'm up!", "Five more minu— fine."]), 2200);
      later("wake", () => {
        setMood("idle");
        setDir(1);
        setMode("walking");
        jump();
      }, 600);
      return;
    }
    say("On it! Sniffing out the stale ones…", 2200);
    later("wake", () => {
      setMood("idle");
      setDir(1);
      setMode("walking");
      onWake();
    }, 1800);
  };

  const classes = [
    "lm",
    awake ? "lm-awake" : "lm-sleeping",
    dir === -1 && awake && "lm-flip",
    awake && (mode === "returning" || !paused) && "lm-moving",
    awake && phrase && "lm-talking",
    `lm-mood-${mood}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div
        class={`lm-bed${awake ? " lm-bed-empty" : ""}`}
        title={mode === "walking" ? "Put Lemon to bed" : undefined}
        onClick={mode === "walking" ? goHome : undefined}
      />
      <div
        ref={el}
        class={classes}
        style={{ left: `${awake ? x.current : HOME_X}px` }}
        title={awake ? "Poke Lemon" : stats.staleCount ? "Wake Lemon: it'll find your stale tabs" : "Wake Lemon"}
        onClick={() => {
          if (!awake) return wake();
          jump();
          say(Math.random() < 0.6 ? pick(aboutYourTabs(latest.current)) : pick(PHRASES));
        }}
      >
        {phrase && <div class={`lm-bubble${awake ? "" : " lm-anchored"}`}>{phrase}</div>}
        {!phrase && hint && !awake && (
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
        {!awake && !phrase && (
          <div class="lm-zzz">
            z<span>z</span>
            <span>z</span>
          </div>
        )}
        {/* Re-keyed on every hop so the bounce animation restarts. */}
        <div class={hop ? "lm-hop" : undefined} key={hop}>
          <LemonSvg asleep={!awake && mood !== "surprised"} />
        </div>
      </div>
    </>
  );
}
