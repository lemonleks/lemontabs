import { useEffect, useRef, useState } from "preact/hooks";
import { prefs } from "./settings";
import "./kitty.css";

const PHRASES = [
  "256 tabs? Is that a world record?",
  "The browser is crying...",
  "RAM: 'Why me?'",
  "More tabs than I have lives!",
  "These aren't tabs, it's a collection!",
  "All those 'read later' tabs...",
  "Bookmarks? Nah, tabs are more reliable!",
  "'Read later' - legend says...",
  "That article from 2019... still relevant?",
  "Peak productivity! 📈",
  "Multitasking level: GOD",
  "Are you reading all of this?",
  "Cmd+Shift+T - your favorite combo?",
  "No room to sit here!",
  "I'm tired of jumping on tabs...",
  "Close something, will you?",
  "It's warmer here than on a laptop!",
  "This is fine. 🔥",
  "Suffering from success",
  "First time? 😏",
  "I've counted to infinity twice while you opened YouTube.",
  "Your fan just filed a formal complaint.",
  "I ordered pizza — it arrived before your page loaded.",
  "My therapist says I'm in a toxic relationship with your tabs.",
  "Is this a browser or a digital hoarding documentary?",
  "One more tab and I get squatter's rights on the taskbar.",
  "Somewhere, a developer is weirdly proud of this chaos.",
  "I'm not judging. The CPU is judging. Loudly.",
  "Bookmarks are for cowards. — You, probably.",
  "This tab has trust issues. It was never closed.",
  "Alt+F4 is looking pretty romantic right now.",
  "I've seen smaller haystacks with fewer needles.",
  "Your grandma's attic has fewer forgotten treasures.",
  "I'm just here for the cardio. Left, right, left...",
  "They promised nine lives, not nine hundred tabs.",
  "If procrastination paid rent, you'd own half the Valley.",
  "I tripped over a favicon. Send treats.",
  "The cloud called. It wants a vacation.",
  "My tail has better file organization than this bar.",
  "Still beats cleaning your desk in real life.",
];

type Mode = "sleeping" | "walking" | "returning";
const BED_X = 20;
const SPEED = 1.2;

/** CSS cat that sleeps bottom-left; wake it to highlight stale tabs and have it wander along the bottom edge. */
export function Kitty({ staleCount, onWake }: { staleCount: number; onWake: () => void }) {
  const [mode, setMode] = useState<Mode>("sleeping");
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hint, setHint] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const x = useRef(BED_X);

  useEffect(() => {
    if (mode !== "sleeping" || staleCount === 0 || prefs.kittyHintDismissed) return setHint(false);
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

  // Position is written straight to the DOM each frame; React state only changes on direction/pause flips.
  useEffect(() => {
    if (mode === "sleeping") return;
    let frame = 0;
    let pause = 0;
    let d = dir;
    const tick = () => {
      if (mode === "returning") {
        x.current -= SPEED;
        if (d !== -1) setDir((d = -1));
        if (x.current <= BED_X) {
          x.current = BED_X;
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
        const max = Math.max(60, innerWidth - 72);
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
    setPhrase("Indiana Cat is off to dig up your ancient tabs!");
    setTimeout(() => {
      setPhrase("");
      setDir(1);
      setMode("walking");
      onWake();
    }, 2500);
  };

  const bed = (
    <div class="kt-catBed" style={{ left: "15px", bottom: "18px" }}>
      <div class="kt-bed">
        <div class="kt-bedRim" />
        <div class="kt-bedCushion" />
      </div>
    </div>
  );

  if (mode === "sleeping") {
    return (
      <>
        {bed}
        <div
          class="kt-kittyInBed"
          style={{ left: `${BED_X}px`, bottom: "28px", pointerEvents: "auto", cursor: "pointer" }}
          onClick={wake}
          title={staleCount ? "Wake me up and I'll find your old tabs" : "Poke! Wake the kitty"}
        >
          {phrase && <div class="kt-speechBubble kt-oldTabsHint">{phrase}</div>}
          {!phrase && hint && (
            <div class="kt-speechBubble kt-oldTabsHint">
              <button
                class="kt-hintClose"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  setHint(false);
                  prefs.dismissKittyHint();
                }}
              >
                ✕
              </button>
              You have tabs older than a week. Wake me up and I'll show them to you!
            </div>
          )}
          {!phrase && <div class="kt-zzz">zZz</div>}
          <div class="kt-sleepingCat">
            <div class="kt-sleepingBody" />
            <div class="kt-sleepingHead">
              <div class="kt-sleepingEar" />
            </div>
            <div class="kt-sleepingTail" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {bed}
      <div
        ref={el}
        class={`kt-kitty kt-walking${dir === -1 ? " kt-flipped" : ""}${mode === "returning" || !paused ? " kt-moving" : ""}`}
        style={{ left: `${x.current}px`, bottom: "22px", pointerEvents: "auto", cursor: "pointer" }}
        title="Back to bed"
        onClick={() => setMode("returning")}
      >
        {phrase && <div class="kt-speechBubble">{phrase}</div>}
        <div class="kt-body">
          <div class="kt-head">
            <div class="kt-ear" />
            <div class="kt-eye" />
            <div class="kt-nose" />
          </div>
          <div class="kt-torso" />
          <div class="kt-legFront" />
          <div class="kt-legBack" />
          <div class="kt-tail" />
        </div>
      </div>
    </>
  );
}
