// Favicons as data: URLs. Chrome loads data: images synchronously, so icons are there in the first
// frame of both the cached copy restore.js paints and the live render. Chrome's /_favicon/ URLs load
// asynchronously and blink in, so they are only the fallback while an icon is being cached.
//
// Stored in localStorage (restore.js reads it synchronously), deduplicated by content because many
// tabs of a site share an icon: { u: pageUrl -> index, d: index -> data URL }.

const KEY = "favicons";

interface Store {
  u: Record<string, number>;
  d: string[];
}

const store: Store = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "") as Store;
  } catch {
    return { u: {}, d: [] };
  }
})();
const pending = new Set<string>();

const chromeFavicon = (url: string) => `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;

async function cache(url: string) {
  const blob = await (await fetch(chromeFavicon(url))).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer()); // a favicon is a few KB: fine to spread
  const data = `data:${blob.type};base64,${btoa(String.fromCharCode(...bytes))}`;
  let i = store.d.indexOf(data);
  if (i < 0) i = store.d.push(data) - 1;
  store.u[url] = i;
}

export function Favicon({ url = "" }: { url?: string }) {
  const i = store.u[url];
  if (i === undefined && url && !pending.has(url)) {
    pending.add(url);
    void cache(url).catch(() => {});
  }
  return <img class="fav" data-favicon={url} src={i === undefined ? chromeFavicon(url) : store.d[i]} width={16} height={16} alt="" />;
}

/**
 * Persists the icons of the pages on screen (`app` is the rendered dashboard), dropping the rest.
 * Returns the dashboard HTML with the inline icons stripped; restore.js puts them back.
 */
export function saveFavicons(app: HTMLElement): string {
  const kept: Store = { u: {}, d: [] };
  const remap = new Map<number, number>();
  for (const img of app.querySelectorAll<HTMLImageElement>("img[data-favicon]")) {
    const url = img.dataset.favicon!;
    const i = store.u[url];
    if (i === undefined || url in kept.u) continue;
    if (!remap.has(i)) remap.set(i, kept.d.push(store.d[i]) - 1);
    kept.u[url] = remap.get(i)!;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    localStorage.removeItem(KEY); // over quota: lose the cache rather than the page
  }
  return app.innerHTML.replace(/ src="data:[^"]*"/g, "");
}
