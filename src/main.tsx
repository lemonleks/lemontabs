import { render } from "preact";
import "@fontsource-variable/onest";
import "@fontsource/instrument-serif/400.css";
import "./styles.css";
import { App } from "./App";

render(<App />, document.getElementById("app")!);
