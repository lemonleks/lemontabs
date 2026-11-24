// Cmd/Ctrl+Z for dashboard actions. Each action records how to put things back; undo replays the
// latest one. Lives as long as the page does.
//
// Undo works tab by tab: one tab that can't be restored (closed meanwhile, window gone) must not
// take the rest of the batch down with it, and the note says when only part of it came back.
import type { Tab } from "./model";

interface Step {
  label: string;
  undo: () => Promise<unknown>;
}

const steps: Step[] = [];

export function remember(label: string, undo: () => Promise<unknown>) {
  steps.push({ label, undo });
  if (steps.length > 50) steps.shift();
}

/** Undoes the latest action and says what happened, for the status note. */
export async function undoLast(): Promise<string> {
  const step = steps.pop();
  if (!step) return "Nothing to undo";
  try {
    await step.undo();
    return `Undone: ${step.label}`;
  } catch (error) {
    console.error("undo failed", error);
    return error instanceof PartialUndo ? `Partly undone: ${step.label} (${error.message})` : `Couldn't undo: ${step.label}`;
  }
}

class PartialUndo extends Error {}

/** Runs `restore` for every item; fails only after trying them all, saying how many didn't make it. */
async function eachItem<T>(items: T[], restore: (item: T) => Promise<unknown>) {
  let failed = 0;
  for (const item of items) {
    try {
      await restore(item);
    } catch (error) {
      failed++;
      console.warn("undo item failed", item, error);
    }
  }
  if (failed === items.length && failed > 0) throw new Error("nothing restored");
  if (failed) throw new PartialUndo(`${failed} of ${items.length} failed`);
}

/** Where a tab sits: window, position, group. */
export interface Place {
  id: number;
  windowId: number;
  index: number;
  groupId: number;
}

export const placesOf = (tabs: Tab[]): Place[] =>
  tabs
    .map((t) => ({ id: t.id!, windowId: t.windowId, index: t.index, groupId: t.groupId }))
    .sort((a, b) => a.index - b.index);

/**
 * Puts tabs back where placesOf saw them. Moving in ascending index order lands every tab on its
 * old index. Membership is only touched when it differs; a group that no longer exists (it emptied
 * out) leaves its tabs ungrouped.
 */
export async function restorePlaces(places: Place[]) {
  const alive = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  await eachItem(places, async (p) => {
    await chrome.tabs.move(p.id, { windowId: p.windowId, index: p.index });
    const now = await chrome.tabs.get(p.id);
    if (now.groupId === p.groupId) return;
    if (p.groupId >= 0 && alive.has(p.groupId)) await chrome.tabs.group({ groupId: p.groupId, tabIds: [p.id] });
    else if (now.groupId >= 0) await chrome.tabs.ungroup([p.id]);
  });
}

export interface ClosedTab {
  url: string;
  windowId: number;
  index: number;
  groupId: number;
  pinned: boolean;
  /** Seconds since epoch, comparable with chrome.sessions' lastModified. */
  closedAt: number;
}

/** Snapshot of tabs about to close. Loading tabs only have a pendingUrl; tabs with no address are skipped. */
export function closedTabsOf(tabs: Tab[]): ClosedTab[] {
  const closedAt = Math.floor(Date.now() / 1000);
  return tabs
    .map((t) => ({ url: t.url || t.pendingUrl || "", windowId: t.windowId, index: t.index, groupId: t.groupId, pinned: t.pinned, closedAt }))
    .filter((c) => c.url);
}

/**
 * Brings closed tabs back, each one through Chrome's recently-closed list when possible (keeps its
 * history and group). That needs the `sessions` permission, which Chrome doesn't grant to an
 * already-installed unpacked extension that gained it in an update, and only covers the last 25
 * closes. Otherwise the tab is opened anew at its old place.
 */
export async function reopen(closed: ClosedTab[]) {
  const alive = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  await eachItem([...closed].sort((a, b) => a.index - b.index), async (c) => {
    if (await restoreSession(c)) return;
    const tab = await chrome.tabs
      .create({ url: c.url, windowId: c.windowId, index: c.index, pinned: c.pinned, active: false })
      .catch(() => chrome.tabs.create({ url: c.url, pinned: c.pinned, active: false })); // its window is gone
    if (c.groupId >= 0 && alive.has(c.groupId)) await chrome.tabs.group({ groupId: c.groupId, tabIds: [tab.id!] });
  });
}

/**
 * Restores the recently-closed entry for this tab: same address and closed no earlier than our close,
 * so an older, unrelated close of the same page is left alone. The list is re-read for every tab
 * because restoring changes it. Returns false when there is no such entry or no permission.
 */
async function restoreSession(c: ClosedTab): Promise<boolean> {
  if (!chrome.sessions) return false;
  try {
    const recent = await chrome.sessions.getRecentlyClosed({ maxResults: chrome.sessions.MAX_SESSION_RESULTS });
    const hit = recent.find((s) => s.tab?.sessionId && s.tab.url === c.url && s.lastModified >= c.closedAt - 2);
    if (!hit) return false;
    await chrome.sessions.restore(hit.tab!.sessionId);
    return true;
  } catch (error) {
    console.warn("session restore failed, reopening instead", error);
    return false;
  }
}
