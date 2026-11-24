import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { applyOrder, deriveView, sortBySitePlan, useSnapshot, type Card, type Snapshot, type Tab } from "./model";
import { bookmarksHeight, BookmarksCard, cardHeight, GROUP_COLORS, GroupCard, Masonry, PinnedStrip, SiteCard, type Actions, type Bookmark } from "./Cards";
import { closedTabsOf, placesOf, remember, reopen, restorePlaces, undoLast } from "./undo";
import { Icon } from "./icons";
import { Lemon } from "./Lemon";
import { Digits } from "./Digits";
import { Favicon } from "./favicons";
import { applyTheme, KEEP_SITES_TOGETHER, prefs, type Scope, type Theme } from "./settings";

interface Ask {
  title: string;
  message: string;
  confirm: string;
  skipKey: string;
  /** Tabs the action affects, listed in the dialog. */
  tabs?: Tab[];
  run: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isMac = navigator.platform.startsWith("Mac");

export function App({ initial }: { initial: Snapshot }) {
  const { snap, drop, undrop } = useSnapshot(initial);
  const [scope, setScope] = useState<Scope>(prefs.scope);
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showStale, setShowStale] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const view = useMemo(() => deriveView(snap, scope, query), [snap, scope, query]);
  // Handlers made during one render can run much later (after a confirm dialog, after an await):
  // they read tabs from here, never from the render they were created in.
  const latest = useRef({ snap, view });
  latest.current = { snap, view };

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
        if (document.querySelector("dialog[open], [popover]:popover-open")) return; // that Escape closes it
        setQuery("");
        input.blur();
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !typing && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        void undoLast().then(say);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "/") e.preventDefault();
      if (e.key === "/" || e.key.length === 1) input.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(t);
  }, [note]);

  // The menu's row was re-rendered away (tab moved, closed): its anchor is gone, so is the menu.
  useEffect(() => {
    if (menu && !menu.anchor.isConnected) setMenu(null);
  }, [snap]);

  const say = (text: string) => setNote({ text, at: Date.now() });
  /** Runs a Chrome call; on failure tells the user instead of failing silently. True on success. */
  const attempt = async (what: string, work: () => Promise<unknown>) => {
    try {
      await work();
      return true;
    } catch (error) {
      console.error(`couldn't ${what}`, error);
      say(`Couldn't ${what}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  const confirm = (a: Ask) => (prefs.skipConfirm(a.skipKey) ? a.run() : setAsk(a));
  const byIds = (ids: number[]) => latest.current.snap.tabs.filter((t) => ids.includes(t.id!));
  const close = (ids: number[]) => {
    const tabs = byIds(ids); // already-gone tabs would make tabs.remove reject the whole batch
    if (!tabs.length) return;
    const live = tabs.map((t) => t.id!);
    const closed = closedTabsOf(tabs);
    drop(live);
    void attempt(`close ${plural(live.length, "tab")}`, () => chrome.tabs.remove(live)).then((ok) =>
      ok ? remember(`close ${plural(live.length, "tab")}`, () => reopen(closed)) : undrop(live),
    );
  };

  const actions: Actions = {
    async activate(tab: Tab) {
      const ok = await attempt("switch to the tab", async () => {
        await chrome.tabs.update(tab.id!, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      });
      if (ok) window.close();
    },
    close,
    closeAll(card: Card, animateOut: () => void) {
      if (card.tabs.length === 1) return animateOut(); // same as the row's ×, nothing to confirm
      confirm({
        title: `Close ${plural(card.tabs.length, "tab")}?`,
        message: card.group ? `Every tab in “${card.group.title || "Unnamed group"}”${query ? " matching the search" : ""}.` : `Every ${card.title} tab${query ? " matching the search" : ""}.`,
        confirm: "Close",
        skipKey: "closeAll",
        run: animateOut,
      });
    },
    async groupSite(card: Card) {
      const tabs = byIds(card.tabs.map((t) => t.id!)).filter((t) => !t.pinned);
      if (!tabs.length) return;
      const places = placesOf(tabs);
      // Land the group in the window that already holds most of these tabs.
      const perWindow = new Map<number, number>();
      for (const t of tabs) perWindow.set(t.windowId, (perWindow.get(t.windowId) ?? 0) + 1);
      const windowId = [...perWindow].sort((a, b) => b[1] - a[1])[0][0];
      // Same site, same color every time; skip grey (index 0), it reads as "no group".
      const hash = [...card.title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const ok = await attempt(`group ${card.title}`, async () => {
        const groupId = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id!) as [number, ...number[]], createProperties: { windowId } });
        await chrome.tabGroups.update(groupId, { title: card.title, color: GROUP_COLORS[1 + (hash % (GROUP_COLORS.length - 1))] });
      });
      if (ok) remember(`group ${card.title}`, () => restorePlaces(places));
    },
    async updateGroup(id, change) {
      const group = latest.current.snap.groups.find((g) => g.id === id);
      if (!group) return;
      const before = Object.fromEntries(Object.keys(change).map((k) => [k, group[k as keyof typeof group]]));
      if (await attempt("change the group", () => chrome.tabGroups.update(id, change))) {
        remember("group change", () => chrome.tabGroups.update(id, before));
      }
    },
    async ungroup(card: Card) {
      const group = card.group!;
      const tabs = latest.current.snap.tabs.filter((t) => t.groupId === group.id);
      if (!tabs.length) return;
      const ids = tabs.map((t) => t.id!);
      const places = placesOf(tabs);
      if (!(await attempt(`ungroup ${group.title || "the group"}`, () => chrome.tabs.ungroup(ids as [number, ...number[]])))) return;
      remember(`ungroup ${group.title || "group"}`, async () => {
        // The old group is gone once emptied: regroup what is still open into a new one dressed the same.
        const still = (await chrome.tabs.query({})).filter((t) => ids.includes(t.id!)).map((t) => t.id!);
        if (!still.length) throw new Error("those tabs are closed");
        const id = await chrome.tabs.group({ tabIds: still as [number, ...number[]] });
        await chrome.tabGroups.update(id, { title: group.title, color: group.color, collapsed: group.collapsed });
        await restorePlaces(places.filter((p) => still.includes(p.id)).map((p) => ({ ...p, groupId: id })));
      });
    },
    async sortGroup(card: Card) {
      await attempt("sort the group", async () => {
        const tabs = await chrome.tabs.query({ groupId: card.group!.id });
        const order = sortBySitePlan(tabs);
        if (!order) return say("This group is already sorted by site");
        const places = placesOf(tabs);
        await applyOrder(order, tabs);
        remember("sort group", () => restorePlaces(places));
      });
    },
    async openCopy(tab: Tab, focus: boolean) {
      const url = tab.url || tab.pendingUrl;
      if (!url) return;
      await attempt("open a new tab", async () => {
        const here = await chrome.tabs.getCurrent(); // the dashboard: open right after it
        await chrome.tabs.create({ url, active: focus, index: here ? here.index + 1 : undefined, windowId: here?.windowId });
      });
    },
    groupMenu(tab, anchor) {
      setMenu({ tab, anchor });
    },
    async moveToGroup(ids, target) {
      const tabs = byIds(ids).filter((t) => !t.pinned && t.groupId !== target && !(target === null && t.groupId < 0));
      if (!tabs.length) return;
      const tabIds = tabs.map((t) => t.id!) as [number, ...number[]];
      const places = placesOf(tabs);
      const name =
        typeof target === "number"
          ? `move to ${latest.current.snap.groups.find((g) => g.id === target)?.title || "the group"}`
          : target
            ? "make a new group"
            : "remove from the group";
      const ok = await attempt(name, async () => {
        if (target === null) await chrome.tabs.ungroup(tabIds);
        else if (target === "new") await chrome.tabs.group({ tabIds, createProperties: { windowId: tabs[0].windowId } });
        else await chrome.tabs.group({ groupId: target, tabIds });
      });
      if (ok) remember(name, () => restorePlaces(places));
    },
  };

  const removeDuplicates = () =>
    confirm({
      title: `Close ${plural(view.duplicateIds.length, "duplicate")}?`,
      message: "Keeps one tab per address (the pinned one, else the active one). These go:",
      tabs: byIds(view.duplicateIds),
      confirm: "Close duplicates",
      skipKey: "dupes",
      run: () => close(latest.current.view.duplicateIds), // recomputed: tabs may have changed while the dialog was open
    });

  const sortWindow = async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (!sortBySitePlan(tabs)) return say("This window is already sorted by site");
    confirm({
      title: "Sort this window by site?",
      message: "Reorders tabs in this window alphabetically by site. Pinned tabs and each tab group are sorted in place, so no tab changes group.",
      confirm: "Sort",
      skipKey: "sort",
      // Plan against the window as it is now, not as it was when the dialog opened.
      run: () =>
        void attempt("sort this window", async () => {
          const now = await chrome.tabs.query({ currentWindow: true });
          const order = sortBySitePlan(now);
          if (!order) return;
          const places = placesOf(now);
          await applyOrder(order, now);
          remember("sort window", () => restorePlaces(places));
        }),
    });
  };

  const changeScope = (s: Scope) => {
    prefs.scope = s;
    setScope(s);
  };

  const matchCount = query ? view.pinned.length + [...view.groupCards, ...view.siteCards].reduce((n, c) => n + c.tabs.length, 0) : 0;
  const stale = showStale ? view.staleIds : new Set<number>();
  const searching = !!query.trim();
  const nothing = !view.pinned.length && !view.groupCards.length && !view.siteCards.length && !bookmarks.length;

  return (
    <>
      <header class="top">
        <div class="tally" aria-live="polite">
          <span class="tally-num">
            <Digits value={view.total} size={64} />
          </span>
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

      {note && (
        <div class="note" role="status" key={note.at}>
          {note.text}
        </div>
      )}

      <main>
        {view.pinned.length > 0 && <PinnedStrip tabs={view.pinned} actions={actions} />}
        {view.groupCards.length > 0 && (
          <section class="block">
            <h2 class="block-title">
              Tab groups <span>{view.groupCards.length}</span>
            </h2>
            <Masonry
              fresh={searching}
              bricks={view.groupCards.map((c) => ({
                key: c.key,
                height: cardHeight(c, searching),
                node: <GroupCard key={c.key} card={c} stale={stale} searching={searching} actions={actions} />,
              }))}
            />
          </section>
        )}
        {(view.siteCards.length > 0 || bookmarks.length > 0) && (
          <section class="block">
            <h2 class="block-title">
              Sites <span>{view.siteCards.length}</span>
            </h2>
            <Masonry
              fresh={searching}
              bricks={[
                ...(bookmarks.length
                  ? [{ key: "bookmarks", height: bookmarksHeight(bookmarks.length), node: <BookmarksCard key="bookmarks" items={bookmarks} /> }]
                  : []),
                ...view.siteCards.map((c) => ({
                  key: c.key,
                  height: cardHeight(c, searching),
                  node: <SiteCard key={c.key} card={c} stale={stale} searching={searching} actions={actions} />,
                })),
              ]}
            />
          </section>
        )}
        {nothing && (
          <p class="empty">{searching ? `Nothing matches “${query.trim()}”. Press Enter to search Google.` : "No other tabs open. Clean slate."}</p>
        )}
      </main>

      {ask && <Confirm ask={ask} onDone={() => setAsk(null)} />}
      {menu && (
        <GroupMenu
          key={menu.tab.id}
          {...menu}
          groups={snap.groups}
          tabs={snap.tabs}
          move={(target) => actions.moveToGroup([menu.tab.id!], target)}
          // Light dismiss closes the old menu asynchronously, possibly after another row opened a new one.
          onDone={() => setMenu((m) => (m?.tab.id === menu.tab.id ? null : m))}
        />
      )}
      <Lemon
        total={view.total}
        staleCount={view.staleIds.size}
        dupes={view.duplicateIds.length}
        windows={view.windows}
        onWake={() => setShowStale(true)}
      />
      <FooterTip />
    </>
  );
}

interface MenuAt {
  tab: Tab;
  anchor: HTMLElement;
}

/**
 * "Move to group" menu for one tab: existing groups (its window first), a new group, or ungroup.
 * Positioned with CSS anchor positioning against the clicked button; it flips above near the bottom.
 */
function GroupMenu({
  tab,
  anchor,
  groups,
  tabs,
  move,
  onDone,
}: MenuAt & { groups: chrome.tabGroups.TabGroup[]; tabs: Tab[]; move: (target: number | "new" | null) => void; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The row button is only shown on hover; keep it laid out while the menu is open, or the
    // menu loses its anchor (and jumps to the corner) as soon as the pointer leaves the row.
    anchor.style.setProperty("anchor-name", "--group-menu");
    anchor.dataset.open = "";
    ref.current!.showPopover();
    return () => {
      anchor.style.removeProperty("anchor-name");
      delete anchor.dataset.open;
    };
  }, []);
  const pick = (target: number | "new" | null) => {
    move(target);
    ref.current!.hidePopover(); // closing fires onToggle -> onDone
  };
  const targets = groups
    .filter((g) => g.id !== tab.groupId)
    .sort((a, b) => Number(b.windowId === tab.windowId) - Number(a.windowId === tab.windowId));

  return (
    <div
      ref={ref}
      class="group-menu"
      popover="auto"
      onToggle={(e) => (e as ToggleEvent).newState === "closed" && onDone()}
    >
      {targets.map((g) => (
        <button key={g.id} onClick={() => pick(g.id)}>
          <span class="swatch" data-color={g.color} />
          <span class="label">{g.title || "Unnamed group"}</span>
          <span class="count">{tabs.filter((t) => t.groupId === g.id).length}</span>
        </button>
      ))}
      {targets.length > 0 && <hr />}
      <button onClick={() => pick("new")}>
        <Icon name="folderPlus" size={14} />
        <span class="label">New group</span>
      </button>
      {tab.groupId >= 0 && (
        <button onClick={() => pick(null)}>
          <Icon name="ungroup" size={14} />
          <span class="label">Remove from group</span>
        </button>
      )}
    </div>
  );
}

/**
 * One-time hint pointing down at the bar Chrome draws under every extension new tab page (extension
 * name + "Customize Chrome"). Chrome renders it outside the page, so it can't be hidden or detected
 * from here; the hint explains the switch and goes away for good once dismissed.
 */
function FooterTip() {
  const [shown, setShown] = useState(!prefs.footerTipDismissed);
  if (!shown) return null;
  return (
    <div class="footer-tip" role="note">
      <p>
        Chrome adds the bar below. To hide it, open <b>Customize Chrome</b> → <b>Footer</b> and turn off <b>Show footer</b>, or
        right-click the bar.
      </p>
      <button
        class="btn"
        onClick={() => {
          prefs.dismissFooterTip();
          setShown(false);
        }}
      >
        Got it
      </button>
    </div>
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
        {ask.tabs && (
          <ul class="confirm-tabs">
            {ask.tabs.map((t) => (
              <li key={t.id} title={t.url}>
                <Favicon url={t.url} />
                <span>{t.title || t.url}</span>
              </li>
            ))}
          </ul>
        )}
        <p class="muted">
          Closed something by mistake? <kbd>{isMac ? "⌘" : "Ctrl"}</kbd> <kbd>Z</kbd> brings it back.
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
