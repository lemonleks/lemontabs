// "Keep same-site tabs together": when a tab lands on a site that already has tabs in this window,
// move it next to them. Never crosses a pinned or Chrome tab-group boundary.
import { isWebUrl, siteKey } from "./site";
import { KEEP_SITES_TOGETHER } from "./settings";

const timers = new Map<number, number>();

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url === undefined || !isWebUrl(tab.url)) return;
  clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      void arrange(tabId).catch(() => {}); // tab closed or dragged meanwhile; nothing to do
    }, 150),
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
});

async function arrange(tabId: number) {
  const stored = await chrome.storage.local.get(KEEP_SITES_TOGETHER);
  if (!stored[KEEP_SITES_TOGETHER]) return;
  const tab = await chrome.tabs.get(tabId);
  if (!isWebUrl(tab.url)) return;
  const site = siteKey(tab.url);
  const strip = await chrome.tabs.query({ windowId: tab.windowId });
  const peers = strip.filter(
    (t) => t.id !== tab.id && t.pinned === tab.pinned && t.groupId === tab.groupId && isWebUrl(t.url) && siteKey(t.url) === site,
  );
  if (!peers.length) return;

  const cluster = [...peers, tab].map((t) => t.index).sort((a, b) => a - b);
  if (cluster.every((idx, i) => i === 0 || idx === cluster[i - 1] + 1)) return;

  const left = peers.filter((p) => p.index < tab.index);
  // chrome.tabs.move takes the index after the tab is lifted out of the strip.
  const target = left.length
    ? Math.max(...left.map((p) => p.index)) + 1
    : Math.min(...peers.map((p) => p.index)) - 1;
  if (target >= 0 && target !== tab.index) await chrome.tabs.move(tabId, { index: target });
}
