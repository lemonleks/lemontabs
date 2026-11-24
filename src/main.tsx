import { render } from "preact";
import "@fontsource-variable/onest";
import "@fontsource/instrument-serif/400.css";
import "./styles.css";
import { App } from "./App";
import { load } from "./model";

// Tabs are queried in parallel with the (local, few-ms) font load, so the live render never shows
// a fallback font that makes the big tab count jump. The Cyrillic sample pulls that Onest subset in.
const [initial] = await Promise.all([
  load(),
  document.fonts.load('400 64px "Instrument Serif"', "0123456789"),
  document.fonts.load('14px "Onest Variable"', "aА"),
]);

// Until now the page showed the static copy restore.js painted; replace it in the same task.
const app = document.getElementById("app")!;
app.textContent = "";
render(<App initial={initial} />, app);

// Keep that copy fresh: save the dashboard whenever the page goes away, unless it is mid-search
// or mid-dialog (the next page opens without either).
const saveShell = () => {
  if (!document.querySelector("dialog[open], .search input:not(:placeholder-shown)")) {
    localStorage.setItem("shell", app.innerHTML);
  }
};
document.addEventListener("visibilitychange", () => document.hidden && saveShell());
addEventListener("pagehide", saveShell);
