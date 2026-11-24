# lemontabs

New tab page for Chrome that shows every open tab grouped by site and by Chrome tab group.
A rewrite of [Smart Tabs](https://chromewebstore.google.com/detail/inogfehnhcebnnojoifmabiccedlllpl), whose source isn't published.

## Install

```sh
bun install
bun run build
```

Open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick `dist/`.
Chrome uses only one new-tab override, so disable Smart Tabs first.

`bun run dev` rebuilds on every change. Reload the extension on `chrome://extensions` to pick up a new build.
`bun run check` runs the type check.
`bun run zip` builds `lemontabs.zip` for the Chrome Web Store; listing texts, assets and steps are in `store/LISTING.md`.

## Layout

| File | Role |
| --- | --- |
| `src/model.ts` | Live snapshot of tabs and groups, derived view, sort-by-site plan |
| `src/App.tsx` | Header, actions, confirm dialog, settings |
| `src/Cards.tsx` | Site, group, and bookmark cards |
| `src/background.ts` | "Keep same-site tabs together" service worker |
| `src/site.ts` | Site key shared by the page and the worker |
| `src/Lemon.tsx` | The lemon mascot |
