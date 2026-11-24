import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { applyOrder, deriveView, sortBySitePlan, useSnapshot, type Card, type Tab } from "./model";
import { BookmarksCard, GROUP_COLORS, GroupCard, SiteCard, type Actions, type Bookmark } from "./Cards";
import { Icon } from "./icons";
import { Kitty } from "./Kitty";
import { applyTheme, KEEP_SITES_TOGETHER, prefs, type Scope, type Theme } from "./settings";

interface Ask {
  title: string;
  message: string;
  confirm: string;
  skipKey: string;
  run: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isMac = navigator.platform.startsWith("Mac");

export function App() {
  const [snap, drop] = useSnapshot();
  const [scope, setScope] = useState<Scope>(prefs.scope);
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showStale, setShowStale] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState("");
  const search = useRef<HTMLInputElement>(null);

  const view = useMemo(() => snap && deriveView(snap, scope, query), [snap, scope, query]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return setBookmarks([]);
    let live = true;
    chrome.bookmarks.search(q).then((found) => {
      if (live) setBookmarks(found.filter((b) => b.url).slice(0, 8).map((b) => ({ id: b.id, title: b.title, url: b.url! })));
    });
    return () => {
      live = false;
    };
  }, [query]);

  // Typing anywhere searches; "/" focuses, Escape clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const input = search.current!;
      if (e.key === "Escape") {
        setQuery("");
        input.blur();
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "/") e.preventDefault();
      if (e.key === "/" || e.key.length === 1) input.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 2500);
    return () => clearTimeout(t);
  }, [note]);

  if (!snap || !view) return null;

  const confirm = (a: Ask) => (prefs.skipConfirm(a.skipKey) ? a.run() : setAsk(a));
  const close = (ids: number[]) => {
    drop(ids);
    void chrome.tabs.remove(ids);
  };

  const actions: Actions = {
    async activate(tab: Tab) {
      await chrome.tabs.update(tab.id!, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      window.close();
    },
    close,
    closeAll(card: Card) {
      confirm({
        title: `Close ${plural(card.tabs.length, "tab")}?`,
        message: card.group ? `Every tab in “${card.group.title || "Unnamed group"}”${query ? " matching the search" : ""}.` : `Every ${card.title} tab${query ? " matching the search" : ""}.`,
        confirm: "Close",
        skipKey: "closeAll",
        run: () => close(card.tabs.map((t) => t.id!)),
      });
    },
    async groupSite(card: Card) {
      const tabs = card.tabs.filter((t) => !t.pinned);
      // Land the group in the window that already holds most of these tabs.
      const perWindow = new Map<number, number>();
      for (const t of tabs) perWindow.set(t.windowId, (perWindow.get(t.windowId) ?? 0) + 1);
      const windowId = [...perWindow].sort((a, b) => b[1] - a[1])[0][0];
      const groupId = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id!) as [number, ...number[]], createProperties: { windowId } });
      // Same site, same color every time; skip grey (index 0), it reads as "no group".
      const hash = [...card.title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      await chrome.tabGroups.update(groupId, { title: card.title, color: GROUP_COLORS[1 + (hash % (GROUP_COLORS.length - 1))] });
    },
    updateGroup(id, change) {
      void chrome.tabGroups.update(id, change);
    },
    ungroup(card: Card) {
      const ids = snap.tabs.filter((t) => t.groupId === card.group!.id).map((t) => t.id!);
      void chrome.tabs.ungroup(ids as [number, ...number[]]);
    },
    async sortGroup(card: Card) {
      const tabs = await chrome.tabs.query({ groupId: card.group!.id });
      const order = sortBySitePlan(tabs);
      if (!order) return setNote("This group is already sorted by site");
      await applyOrder(order, tabs);
    },
  };

  const removeDuplicates = () =>
    confirm({
      title: `Close ${plural(view.duplicateIds.length, "duplicate")}?`,
      message: "Keeps one tab per address (the active one, when there is one).",
      confirm: "Close duplicates",
      skipKey: "dupes",
      run: () => close(view.duplicateIds),
    });

  const sortWindow = async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const order = sortBySitePlan(tabs);
    if (!order) return setNote("This window is already sorted by site");
    confirm({
      title: "Sort this window by site?",
      message: "Reorders tabs in this window alphabetically by site. Pinned tabs and each tab group are sorted in place, so no tab changes group.",
      confirm: "Sort",
      skipKey: "sort",
      run: () => void applyOrder(order, tabs),
    });
  };

  const changeScope = (s: Scope) => {
    prefs.scope = s;
    setScope(s);
  };

  const matchCount = query ? [...view.groupCards, ...view.siteCards].reduce((n, c) => n + c.tabs.length, 0) : 0;
  const stale = showStale ? view.staleIds : new Set<number>();
  const searching = !!query.trim();
  const nothing = !view.groupCards.length && !view.siteCards.length && !bookmarks.length;

  return (
    <>
      <header class="top">
        <div class="tally" aria-live="polite">
          <span class="tally-num">{view.total}</span>
          <span class="tally-text">
            <b>open {view.total === 1 ? "tab" : "tabs"}</b>
            <span>
              {scope === "window" && `${view.inScope} here · `}
              {plural(view.windows, "window")} · {plural(snap.groups.length, "group")}
            </span>
          </span>
        </div>

        <label class="search">
          <Icon name="search" size={17} />
          <input
            ref={search}
            type="search"
            placeholder="Search tabs and bookmarks · Enter to Google"
            autocomplete="off"
            spellcheck={false}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim())
                void chrome.tabs.update({ url: `https://www.google.com/search?q=${encodeURIComponent(query.trim())}` });
            }}
          />
          {searching ? <span class="hint">{plural(matchCount, "tab")}</span> : <kbd>/</kbd>}
        </label>

        <div class="tools">
          <button class="tool" disabled={!view.duplicateIds.length} title="Close duplicate tabs" onClick={removeDuplicates}>
            <Icon name="copy" />
            <span>Duplicates</span>
            {view.duplicateIds.length > 0 && <span class="badge">{view.duplicateIds.length}</span>}
          </button>
          <button class="tool" title="Sort this window's tabs by site" onClick={sortWindow}>
            <Icon name="layers" />
            <span>Sort</span>
          </button>
          <button
            class="tool"
            aria-pressed={showStale}
            disabled={!view.staleIds.size}
            title="Highlight tabs not opened for a week"
            onClick={() => setShowStale(!showStale)}
          >
            <Icon name="clock" />
            <span>Stale</span>
            {view.staleIds.size > 0 && <span class="badge">{view.staleIds.size}</span>}
          </button>
          <div class="seg" role="group" aria-label="Which tabs to show">
            <button aria-pressed={scope === "window"} onClick={() => changeScope("window")}>This window</button>
            <button aria-pressed={scope === "all"} onClick={() => changeScope("all")}>All</button>
          </div>
          <button class="tool icon-only" title="Settings" popovertarget="settings" style="anchor-name:--settings">
            <Icon name="sliders" />
          </button>
          <Settings />
        </div>
      </header>

      {note && <div class="note" role="status">{note}</div>}

      <main>
        {view.groupCards.length > 0 && (
          <section class="block">
            <h2 class="block-title">
              Tab groups <span>{view.groupCards.length}</span>
            </h2>
            <div class="grid">
              {view.groupCards.map((c) => (
                <GroupCard key={c.key} card={c} stale={stale} searching={searching} actions={actions} />
              ))}
            </div>
          </section>
        )}
        {(view.siteCards.length > 0 || bookmarks.length > 0) && (
          <section class="block">
            <h2 class="block-title">
              Sites <span>{view.siteCards.length}</span>
            </h2>
            <div class="grid">
              {bookmarks.length > 0 && <BookmarksCard items={bookmarks} />}
              {view.siteCards.map((c) => (
                <SiteCard key={c.key} card={c} stale={stale} searching={searching} actions={actions} />
              ))}
            </div>
          </section>
        )}
        {nothing && (
          <p class="empty">{searching ? `Nothing matches “${query.trim()}”. Press Enter to search Google.` : "No other tabs open. Clean slate."}</p>
        )}
      </main>

      {ask && <Confirm ask={ask} onDone={() => setAsk(null)} />}
      <Kitty staleCount={view.staleIds.size} onWake={() => setShowStale(true)} />
    </>
  );
}

function Confirm({ ask, onDone }: { ask: Ask; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [skip, setSkip] = useState(false);
  useEffect(() => ref.current!.showModal(), []);
  return (
    <dialog ref={ref} class="confirm" onClose={onDone}>
      <form method="dialog">
        <h2>{ask.title}</h2>
        <p>{ask.message}</p>
        <p class="muted">
          Closed something by mistake? <kbd>{isMac ? "⌘" : "Ctrl"}</kbd> <kbd>Shift</kbd> <kbd>T</kbd> brings it back.
        </p>
        <label class="check">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.currentTarget.checked)} />
          Don't ask again
        </label>
        <div class="confirm-actions">
          <button value="cancel" class="btn">Cancel</button>
          <button
            value="ok"
            class="btn primary"
            autofocus
            onClick={() => {
              if (skip) prefs.setSkipConfirm(ask.skipKey);
              ask.run();
            }}
          >
            {ask.confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Settings() {
  const [theme, setTheme] = useState<Theme>(prefs.theme);
  const [together, setTogether] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(KEEP_SITES_TOGETHER).then((s) => setTogether(!!s[KEEP_SITES_TOGETHER]));
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme(prefs.theme);
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const pickTheme = (t: Theme) => {
    prefs.theme = t;
    setTheme(t);
    applyTheme(t);
  };

  return (
    <div id="settings" class="settings" popover="auto">
      <h2>Settings</h2>
      <div class="setting">
        <span>Theme</span>
        <div class="seg" role="group" aria-label="Theme">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => pickTheme(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <label class="setting switch">
        <span>
          Keep same-site tabs together
          <small>A tab that opens a site already open in its window moves next to those tabs. Tab groups stay intact.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={together}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            setTogether(on);
            void chrome.storage.local.set({ [KEEP_SITES_TOGETHER]: on });
          }}
        />
      </label>
    </div>
  );
}
