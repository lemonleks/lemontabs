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

/** Undoes the latest action; returns its label, or null when there is nothing to undo. */
export async function undoLast(): Promise<string | null> {
  const step = steps.pop();
  if (!step) return null;
  await step.undo().catch(() => {}); // tabs may have changed since; undo what still applies
  return step.label;
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

/** Reopens closed tabs through Chrome's recently-closed list (same as Cmd+Shift+T, but only these). */
export async function reopen(urls: string[]) {
  const want = [...urls];
  for (const session of await chrome.sessions.getRecentlyClosed({ maxResults: chrome.sessions.MAX_SESSION_RESULTS })) {
    const tab = session.tab;
    const i = tab?.url ? want.indexOf(tab.url) : -1;
    if (i < 0 || !tab?.sessionId) continue;
    want.splice(i, 1);
    await chrome.sessions.restore(tab.sessionId);
  }
}
