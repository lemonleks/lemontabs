import { render } from "preact";
import "./styles.css";
import { App } from "./App";
import { load, type Snapshot } from "./model";
import { saveFavicons } from "./favicons";

const app = document.getElementById("app")!;

let initial: Snapshot;
try {
  initial = await load();
} catch (error) {
  // Without this the saved copy restore.js painted would stay up, looking alive with dead buttons.
  console.error("couldn't read tabs", error);
  localStorage.removeItem("shell");
  app.innerHTML = `<p class="empty">Couldn't read your tabs. Reload the extension on chrome://extensions.</p>`;
  throw error;
}

// Until now the page showed the static copy restore.js painted; replace it in the same task.
app.textContent = "";
render(<App initial={initial} />, app);

// Keep that copy fresh: save the dashboard whenever the page goes away, unless it is mid-search
// or mid-dialog (the next page opens without either).
const saveShell = () => {
  if (document.querySelector("dialog[open], .search input:not(:placeholder-shown)")) return;
  try {
    localStorage.setItem("shell", saveFavicons(app));
  } catch {
    // Over quota: an outdated copy is worse than none, and its icons were just pruned anyway.
    localStorage.removeItem("shell");
  }
};
document.addEventListener("visibilitychange", () => document.hidden && saveShell());
addEventListener("pagehide", saveShell);
