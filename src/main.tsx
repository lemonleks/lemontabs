import { render } from "preact";
import "./styles.css";
import { App } from "./App";
import { load } from "./model";

const initial = await load();

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
