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

type Face = "idle" | "happy" | "surprised" | "asleep";

/**
 * Kawaii proportions on purpose: solid dark eyes set low and wide, a tiny mouth, blush, and stubby
 * nubs for arms and feet. Whites-of-the-eyes with tracking pupils read as creepy at this size.
 */
function LemonSvg({ face }: { face: Face }) {
  const asleep = face === "asleep";
  return (
    <svg class="lm-svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
      <defs>
        <radialGradient id="lm-skin" cx="0.38" cy="0.3" r="0.78">
          <stop offset="0" stop-color="#fff6b8" />
          <stop offset="0.5" stop-color="#fbd93a" />
          <stop offset="1" stop-color="#ecb40c" />
        </radialGradient>
      </defs>

      {!asleep && (
        <>
          <ellipse class="lm-nub lm-foot lm-foot-a" cx="25.5" cy="51.2" rx="4.2" ry="2.6" />
          <ellipse class="lm-nub lm-foot lm-foot-b" cx="38.5" cy="51.2" rx="4.2" ry="2.6" />
        </>
      )}

      <g class="lm-body">
        {!asleep && (
          <>
            {/* Wrapped: the CSS swing/wave transform would override the ellipse's own rotate(). */}
            <g class="lm-arm lm-arm-l">
              <ellipse class="lm-nub" cx="8.5" cy="39" rx="2.4" ry="3.6" transform="rotate(25 8.5 39)" />
            </g>
            <g class="lm-arm lm-arm-r">
              <ellipse class="lm-nub" cx="55.5" cy="39" rx="2.4" ry="3.6" transform="rotate(-25 55.5 39)" />
            </g>
          </>
        )}
        <path class="lm-stem" d="M32 15 Q32 10.5 33.6 8.5" />
        <g class="lm-leaf">
          <path d="M33.6 9.5 Q38 2.3 47.5 4.3 Q43.5 11.9 33.6 9.5Z" />
          <path class="lm-vein" d="M34.8 9 Q40.5 6.3 46 5.1" />
        </g>
        <path
          class="lm-peel"
          d="M5 33 Q7 29.5 11 28.5 Q15 15 32 15 Q49 15 53 28.5 Q57 29.5 59 33 Q57 36.5 53 37.5 Q49 51 32 51 Q15 51 11 37.5 Q7 36.5 5 33Z"
        />
        <path class="lm-shine" d="M16 24 Q20.5 18.5 27.5 17.4" />

        {/* The whole face shifts a little toward the pointer, like turning to look. */}
        <g class="lm-face">
          <ellipse class="lm-cheek" cx="20" cy="37.6" rx="3.3" ry="2" />
          <ellipse class="lm-cheek" cx="44" cy="37.6" rx="3.3" ry="2" />
          {face === "idle" && (
            <g class="lm-eyes">
              <ellipse class="lm-eye" cx="25.5" cy="32" rx="2.5" ry="3.1" />
              <ellipse class="lm-eye" cx="38.5" cy="32" rx="2.5" ry="3.1" />
              <circle class="lm-glint" cx="26.4" cy="30.8" r="1" />
              <circle class="lm-glint" cx="39.4" cy="30.8" r="1" />
              <circle class="lm-glint" cx="24.9" cy="33.3" r="0.45" />
              <circle class="lm-glint" cx="37.9" cy="33.3" r="0.45" />
            </g>
          )}
          {face === "happy" && <path class="lm-line" d="M23 32.8 Q25.5 29.6 28 32.8 M36 32.8 Q38.5 29.6 41 32.8" />}
          {face === "surprised" && (
            <g>
              <ellipse class="lm-eye" cx="25.5" cy="31.6" rx="2.7" ry="3.7" />
              <ellipse class="lm-eye" cx="38.5" cy="31.6" rx="2.7" ry="3.7" />
              <circle class="lm-glint" cx="26.5" cy="30.2" r="1.1" />
              <circle class="lm-glint" cx="39.5" cy="30.2" r="1.1" />
            </g>
          )}
          {asleep && (
            <g>
              <path class="lm-line" d="M23 31.6 Q25.5 34 28 31.6" />
              <path class="lm-line lm-sleep-eye" d="M36 31.6 Q38.5 34 41 31.6" />
              {/* Hover a napping lemon: it cracks one eye open. */}
              <g class="lm-peek">
                <ellipse class="lm-eye" cx="38.5" cy="32.3" rx="2.4" ry="2" />
                <circle class="lm-glint" cx="39.3" cy="31.6" r="0.8" />
              </g>
            </g>
          )}

          {asleep ? (
            <ellipse class="lm-tongue" cx="32" cy="37.2" rx="0.9" ry="0.8" />
          ) : face === "surprised" ? (
            <ellipse class="lm-tongue" cx="32" cy="37.6" rx="1.3" ry="1.5" />
          ) : (
            <>
              <path class="lm-line lm-smile" d="M30 36.8 Q32 38.8 34 36.8" />
              <ellipse class="lm-tongue lm-talk" cx="32" cy="37.5" rx="1.9" ry="1.5" />
            </>
          )}
        </g>
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
        node.style.setProperty("--px", ((dx / len) * 1.2 * (dir === -1 ? -1 : 1)).toFixed(2));
        node.style.setProperty("--py", ((dy / len) * 1).toFixed(2));
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
          <LemonSvg face={!awake && mood !== "surprised" ? "asleep" : mood} />
        </div>
      </div>
    </>
  );
}
