# Публикация в Chrome Web Store

Тексты для полей формы на английском (интерфейс расширения английский). Копируй как есть.

## 0. Перед загрузкой

1. `bun run zip` собирает `lemontabs.zip` в корне репозитория.
2. Выложи `store/PRIVACY.md` по публичному адресу (gist, GitHub Pages, страница на lemonleks.me). Без URL раздел Privacy не сохранится.

## 1. Загрузка

[Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Add new item** → `lemontabs.zip`.

## 2. Store listing

**Description**

```
lemontabs replaces the new tab page with a calm overview of everything you have open.

• Every open tab on one screen, grouped by site
• Chrome tab groups as their own cards: collapse, rename, recolor, sort or ungroup them without leaving the page
• Turn all of a site's tabs into a tab group in one click
• Total tab count across all windows, or just the current one
• Search tabs and bookmarks as you type; press Enter to search Google
• Close duplicate tabs, sort a window or a single group by site
• Highlight tabs you haven't opened in a week
• Optional: keep tabs from the same site next to each other automatically
• Light and dark themes
• A small lemon that naps in the corner until you poke it

Privacy: lemontabs has no servers. Your tabs, bookmarks and settings never leave your browser.
```

| Поле | Значение |
| --- | --- |
| Category | Productivity → Tools |
| Language | English |
| Store icon | `public/icons/128.png` |
| Screenshots | `store/screenshot-1-light.png`, `-2-dark`, `-3-search`, `-4-groups` (1280×800) |
| Small promo tile | `store/promo-small-440x280.png` |
| Marquee | пропустить |
| Homepage / Support URL | пусто или адрес, где лежит privacy policy |

## 3. Privacy

**Single purpose**

```
Replaces the new tab page with a dashboard of the user's open tabs, grouped by site and by Chrome tab group, with tools to find, switch to, close, sort and group them.
```

**Permission justification**

| Permission | Justification |
| --- | --- |
| `tabs` | Reads the titles and URLs of open tabs to list them on the new tab page grouped by site, and switches to, closes, moves and sorts tabs when the user asks. |
| `tabGroups` | Shows the user's Chrome tab groups and lets them collapse, rename, recolor and ungroup them from the dashboard. |
| `bookmarks` | Read-only: shows bookmarks matching the text typed in the search box. |
| `favicon` | Shows site icons from Chrome's local favicon cache, so no requests go to third-party icon services. |
| `storage` | Saves the "Keep same-site tabs together" setting so the background service worker can read it. |

| Поле | Значение |
| --- | --- |
| Host permissions | нет, поле не появится |
| Are you using remote code? | **No, I am not using remote code** |
| Data usage: что собираете | ничего не отмечать: данные не покидают устройство |
| Три сертификации внизу | отметить все три |
| Privacy policy URL | публичный адрес `store/PRIVACY.md` |

## 4. Distribution

| Поле | Значение |
| --- | --- |
| Payments | Free |
| Visibility | **Unlisted** |
| Regions | All regions |

## 5. Отправка

**Submit for review**. Ревью обычно занимает от нескольких дней до пары недель. Расширения с `tabs` и подменой новой вкладки часто попадают на ручную проверку.
После одобрения ссылка вида `chromewebstore.google.com/detail/<id>` откроется в Store listing. Unlisted-расширение ставится только по этой ссылке.

## Обновления

Подними `version` в `public/manifest.json`, выполни `bun run zip`, затем Package → **Upload new package** → Submit.
