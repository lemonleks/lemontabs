# lemontabs

New tab page for Chrome that shows every open tab grouped by site and by Chrome tab group.
A rewrite of [Smart Tabs](https://chromewebstore.google.com/detail/inogfehnhcebnnojoifmabiccedlllpl), whose source isn't published.

## Install from the Chrome Web Store

[**lemontabs on the Chrome Web Store**](https://chromewebstore.google.com/detail/lemontabs/ndiojbnohjfledikfohcolgohoabmdgf): one click, updates itself. The store build can lag a release while Google reviews it.

## Install from a release

1. Download `lemontabs-vX.Y.Z.zip` from [Releases](https://github.com/lemonleks/lemontabs/releases/latest) and unzip it somewhere it can stay.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.

Chrome uses only one new-tab override, so turn off other new-tab extensions. To update, unzip the new release over the same folder and press ↻ on the extension card.

## Develop

```sh
bun install
bun run build
```

Load `dist/` with **Load unpacked** as above.
`bun run dev` rebuilds on every change; press ↻ on the extension card to pick up a new build.
`bun run check` runs the type check.
`bun run zip` builds `lemontabs.zip` for the Chrome Web Store; listing texts, assets and steps are in `store/LISTING.md`.

## Release

Bump `version` in `public/manifest.json`, commit, then tag and push: `git tag v1.2.3 && git push origin v1.2.3`.
The Release workflow builds the zip and publishes it as a GitHub release. The tag must match the manifest version.

## Layout

| File | Role |
| --- | --- |
| `src/model.ts` | Live snapshot of tabs and groups, derived view, sort-by-site plan |
| `src/App.tsx` | Header, actions, confirm dialog, settings |
| `src/Cards.tsx` | Site, group, and bookmark cards |
| `src/background.ts` | "Keep same-site tabs together" service worker |
| `src/site.ts` | Site key shared by the page and the worker |
| `src/Lemon.tsx` | The lemon mascot |
