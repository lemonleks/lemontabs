// tabs.lemonleks.me: proxies the GitHub Pages site built from /docs (DNS lives in Cloudflare).
export default {
  fetch(req) {
    const { pathname, search } = new URL(req.url);
    if (pathname === "/") return Response.redirect("https://chromewebstore.google.com/detail/lemontabs/ndiojbnohjfledikfohcolgohoabmdgf", 302);
    return fetch(`https://lemonleks.github.io/lemontabs${pathname}${search}`, { headers: { "user-agent": "tabs.lemonleks.me" } });
  },
};
