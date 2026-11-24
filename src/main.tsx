import { render } from "preact";
import "@fontsource-variable/onest";
import "@fontsource/instrument-serif/400.css";
import "./styles.css";
import { App } from "./App";

// Wait for the fonts (local files, a few ms) so the first frame is final: no fallback-font
// flash that makes the big tab count jump. Cyrillic sample pulls that subset in too.
await Promise.all([
  document.fonts.load('400 64px "Instrument Serif"', "0123456789"),
  document.fonts.load('14px "Onest Variable"', "aА"),
]);
render(<App />, document.getElementById("app")!);
