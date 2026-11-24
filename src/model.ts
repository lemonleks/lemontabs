import { useEffect, useState } from "preact/hooks";
import { siteKey } from "./site";
import type { Scope } from "./settings";

export type Tab = chrome.tabs.Tab;
export type Group = chrome.tabGroups.TabGroup;

export interface Snapshot {
  tabs: Tab[];
  groups: Group[];
  windowId: number;
}

const OWN_ORIGIN = location.origin;

export async function load(): Promise<Snapshot> {
  const [tabs, groups, win] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    chrome.windows.getCurrent(),
  ]);
  // Hide the dashboard itself: it is not a tab the user is keeping.
  const own = (t: Tab) => (t.pendingUrl || t.url || "").startsWith(OWN_ORIGIN) || (t.url ?? "").startsWith("chrome://newtab");
  return { tabs: tabs.filter((t) => !own(t)), groups, windowId: win.id! };
}

/**
 * Live browser state, starting from a snapshot fetched before the first render. Event bursts
 * (a page load fires a dozen onUpdated) collapse into one re-query.
 */
export function useSnapshot(initial: Snapshot): [Snapshot, (ids: number[]) => void] {
  const [snap, setSnap] = useState(initial);

  useEffect(() => {
    let timer = 0;
    let stale = false;
    const refresh = () => void load().then(setSnap);
    const schedule = () => {
      if (document.hidden) {
        stale = true;
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(refresh, 60);
    };
    const onVisible = () => {
      if (!document.hidden && stale) {
        stale = false;
        refresh();
      }
    };
    const events = [
      chrome.tabs.onCreated,
      chrome.tabs.onRemoved,
      chrome.tabs.onUpdated,
      chrome.tabs.onMoved,
      chrome.tabs.onAttached,
      chrome.tabs.onDetached,
      chrome.tabs.onActivated,
      chrome.tabs.onReplaced,
      chrome.tabGroups.onCreated,
      chrome.tabGroups.onUpdated,
      chrome.tabGroups.onRemoved,
      chrome.tabGroups.onMoved,
    ] as chrome.events.Event<() => void>[];
    refresh(); // catch changes between the prefetch and subscribing; same data re-renders as a no-op diff
    for (const e of events) e.addListener(schedule);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      for (const e of events) e.removeListener(schedule);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const drop = (ids: number[]) =>
    setSnap((s) => ({ ...s, tabs: s.tabs.filter((t) => !ids.includes(t.id!)) }));
  return [snap, drop];
}

export interface Card {
  key: string;
  title: string;
  tabs: Tab[];
  group?: Group;
}

export interface View {
  total: number;
  windows: number;
  inScope: number;
  /** Pinned tabs: shown as a strip above everything, not in site cards (pinned tabs can't be grouped). */
  pinned: Tab[];
  groupCards: Card[];
  siteCards: Card[];
  duplicateIds: number[];
  staleIds: Set<number>;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function deriveView(snap: Snapshot, scope: Scope, query: string): View {
  const now = Date.now();
  const cur = snap.windowId;
  // Current window first, then the rest in Chrome's order (query() returns window by window, index-ordered).
  const scoped =
    scope === "window"
      ? snap.tabs.filter((t) => t.windowId === cur)
      : [...snap.tabs.filter((t) => t.windowId === cur), ...snap.tabs.filter((t) => t.windowId !== cur)];

  const q = query.trim().toLowerCase();
  const matches = (t: Tab) => !q || (t.title ?? "").toLowerCase().includes(q) || (t.url ?? "").toLowerCase().includes(q);

  const pinned: Tab[] = [];
  const byGroup = new Map<number, Tab[]>();
  const bySite = new Map<string, Tab[]>();
  for (const t of scoped) {
    if (t.pinned) {
      if (matches(t)) pinned.push(t);
    } else if (t.groupId >= 0) {
      const list = byGroup.get(t.groupId);
      if (list) list.push(t);
      else byGroup.set(t.groupId, [t]);
    } else {
      const key = siteKey(t.url || t.pendingUrl);
      const list = bySite.get(key);
      if (list) list.push(t);
      else bySite.set(key, [t]);
    }
  }

  const groupsById = new Map(snap.groups.map((g) => [g.id, g]));
  const groupCards: Card[] = [];
  for (const [id, tabs] of byGroup) {
    const group = groupsById.get(id);
    if (!group) continue; // group event not delivered yet; next refresh fixes it
    const shown = q && group.title?.toLowerCase().includes(q) ? tabs : tabs.filter(matches);
    if (shown.length) groupCards.push({ key: `g${id}`, title: group.title || "", tabs: shown, group });
  }

  const siteCards: Card[] = [];
  for (const [key, tabs] of bySite) {
    const shown = q && key.includes(q) ? tabs : tabs.filter(matches);
    if (shown.length) siteCards.push({ key, title: key, tabs: shown });
  }

  const byUrl = new Map<string, Tab[]>();
  for (const t of scoped) {
    if (!t.url) continue;
    const list = byUrl.get(t.url);
    if (list) list.push(t);
    else byUrl.set(t.url, [t]);
  }
  const duplicateIds: number[] = [];
  for (const list of byUrl.values()) {
    if (list.length < 2) continue;
    const keep = list.find((t) => t.active && t.windowId === cur) ?? list.find((t) => t.active) ?? list[0];
    for (const t of list) if (t !== keep) duplicateIds.push(t.id!);
  }

  const staleIds = new Set<number>();
  for (const t of scoped) if (!t.active && t.lastAccessed && now - t.lastAccessed > WEEK) staleIds.add(t.id!);

  return {
    total: snap.tabs.length,
    windows: new Set(snap.tabs.map((t) => t.windowId)).size,
    inScope: scoped.length,
    pinned,
    groupCards,
    siteCards,
    duplicateIds,
    staleIds,
  };
}

/**
 * Target order for "sort by site" in one window: pinned tabs sorted among themselves, and every
 * contiguous run of same-group tabs sorted in place, so no tab changes group. Null if already sorted.
 */
export function sortBySitePlan(tabs: Tab[]): number[] | null {
  const strip = [...tabs].sort((a, b) => a.index - b.index);
  const runs: Tab[][] = [];
  for (const t of strip) {
    const last = runs.at(-1);
    const sameRun = last && last[0].pinned === t.pinned && last[0].groupId === t.groupId;
    if (sameRun) last.push(t);
    else runs.push([t]);
  }
  const order = runs.flatMap((run) =>
    run
      .map((t) => ({ t, key: siteKey(t.url || t.pendingUrl) }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.t.index - b.t.index)
      .map(({ t }) => t.id!),
  );
  return order.every((id, i) => id === strip[i].id) ? null : order;
}

/**
 * Applies a sortBySitePlan to `tabs` (a whole window, or one group's contiguous range) with the fewest
 * chrome.tabs.move calls a left-to-right pass allows. Moves stay inside the range, so group membership holds.
 */
export async function applyOrder(order: number[], tabs: Tab[]) {
  const sorted = [...tabs].sort((a, b) => a.index - b.index);
  const start = sorted[0].index;
  const strip = sorted.map((t) => t.id!);
  for (let i = 0; i < order.length; i++) {
    if (strip[i] === order[i]) continue;
    await chrome.tabs.move(order[i], { index: start + i });
    strip.splice(strip.indexOf(order[i]), 1);
    strip.splice(i, 0, order[i]);
  }
}
