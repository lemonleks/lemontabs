// Cmd/Ctrl+Z for dashboard actions. Each action records how to put things back; undo replays the
// latest one. Lives as long as the page does.
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
    return `Couldn't undo: ${step.label}`;
  }
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
  for (const p of places) {
    await chrome.tabs.move(p.id, { windowId: p.windowId, index: p.index });
    const now = await chrome.tabs.get(p.id);
    if (now.groupId === p.groupId) continue;
    if (p.groupId >= 0 && alive.has(p.groupId)) await chrome.tabs.group({ groupId: p.groupId, tabIds: [p.id] });
    else if (now.groupId >= 0) await chrome.tabs.ungroup([p.id]);
  }
}

export interface ClosedTab {
  url: string;
  windowId: number;
  index: number;
  groupId: number;
  pinned: boolean;
}

export const closedTabsOf = (tabs: Tab[]): ClosedTab[] =>
  tabs.map((t) => ({ url: t.url!, windowId: t.windowId, index: t.index, groupId: t.groupId, pinned: t.pinned }));

/**
 * Brings closed tabs back. Preferably through Chrome's recently-closed list, which keeps their
 * history; that needs the `sessions` permission and only holds the last 25 closes. Whatever it can't
 * restore (no permission yet: Chrome doesn't grant permissions added to an already-installed
 * unpacked extension; or past 25) is opened anew at the same place.
 */
export async function reopen(closed: ClosedTab[]) {
  const rest = [...closed];
  if (chrome.sessions) {
    for (const session of await chrome.sessions.getRecentlyClosed({ maxResults: chrome.sessions.MAX_SESSION_RESULTS })) {
      const tab = session.tab;
      const i = rest.findIndex((c) => c.url === tab?.url);
      if (i < 0 || !tab?.sessionId) continue;
      rest.splice(i, 1);
      await chrome.sessions.restore(tab.sessionId);
    }
  }
  const alive = new Set((await chrome.tabGroups.query({})).map((g) => g.id));
  for (const c of rest.sort((a, b) => a.index - b.index)) {
    const tab = await chrome.tabs
      .create({ url: c.url, windowId: c.windowId, index: c.index, pinned: c.pinned, active: false })
      .catch(() => chrome.tabs.create({ url: c.url, pinned: c.pinned, active: false })); // its window is gone
    if (c.groupId >= 0 && alive.has(c.groupId)) await chrome.tabs.group({ groupId: c.groupId, tabIds: [tab.id!] });
  }
}
