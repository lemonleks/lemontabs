// Shared by the dashboard and the service worker: both must agree on what "same site" means.

/** Grouping key: hostname without "www." for web pages, "scheme://host" for browser and extension pages. */
export function siteKey(url: string | undefined): string {
  if (!url) return "other";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "other";
  }
  if (u.protocol === "http:" || u.protocol === "https:") return u.hostname.toLowerCase().replace(/^www\./, "");
  return u.hostname ? `${u.protocol}//${u.hostname}` : u.protocol.slice(0, -1);
}

export function isWebUrl(url: string | undefined): boolean {
  return !!url && (url.startsWith("https://") || url.startsWith("http://"));
}
