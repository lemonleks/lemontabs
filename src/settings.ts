/** chrome.storage.local key, read by the service worker. */
export const KEEP_SITES_TOGETHER = "keepSitesTogether";

export type Theme = "system" | "light" | "dark";
export type Scope = "window" | "all";

// Dashboard-only prefs live in localStorage: synchronous, so the first paint already has them.
export const prefs = {
  get theme(): Theme {
    return (localStorage.getItem("theme") as Theme | null) ?? "system";
  },
  set theme(v: Theme) {
    localStorage.setItem("theme", v);
  },
  get scope(): Scope {
    return localStorage.getItem("scope") === "window" ? "window" : "all";
  },
  set scope(v: Scope) {
    localStorage.setItem("scope", v);
  },
  skipConfirm(key: string): boolean {
    return localStorage.getItem(`skipConfirm.${key}`) === "1";
  },
  setSkipConfirm(key: string) {
    localStorage.setItem(`skipConfirm.${key}`, "1");
  },
  get kittyHintDismissed(): boolean {
    return localStorage.getItem("kittyHintDismissed") === "1";
  },
  dismissKittyHint() {
    localStorage.setItem("kittyHintDismissed", "1");
  },
};

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
