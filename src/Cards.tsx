import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Card, Tab } from "./model";
import { Icon } from "./icons";

export interface Actions {
  activate(tab: Tab): void;
  close(ids: number[]): void;
  closeAll(card: Card): void;
  groupSite(card: Card): void;
  updateGroup(id: number, change: chrome.tabGroups.UpdateProperties): void;
  ungroup(card: Card): void;
  sortGroup(card: Card): void;
}

export const favicon = (url = "") => `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;

// Fixed metrics give every card's height from its tab count alone, so masonry needs no DOM measuring.
// Keep in sync with --head / --row in styles.css.
const HEAD = 44;
const ROW = 26;
const PAD = 8;
const GAP = 14;
const MIN_COLUMN = 268;

export function cardHeight(card: Card, searching: boolean) {
  const collapsed = card.group?.collapsed && !searching;
  return HEAD + (collapsed ? 40 : PAD + card.tabs.length * ROW) + 2;
}

export const bookmarksHeight = (count: number) => HEAD + PAD + count * ROW + 2;

export interface Brick {
  key: string;
  height: number;
  node: ComponentChildren;
}

/**
 * Masonry: tallest card first, each into the currently shortest column. Balances columns well and
 * gives a giant card (x.com with 200 tabs) a column of its own instead of sitting under small ones.
 */
export function Masonry({ bricks }: { bricks: Brick[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  const count = Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP)));
  const columns: Brick[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const brick of [...bricks].sort((a, b) => b.height - a.height)) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].push(brick);
    heights[shortest] += brick.height + GAP;
  }
  return (
    <div class="masonry" ref={ref}>
      {width > 0 &&
        columns.map((column, i) => (
          <div class="masonry-col" key={i}>
            {column.map((b) => b.node)}
          </div>
        ))}
    </div>
  );
}

function age(ms: number) {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

function TabRow({ tab, stale, actions }: { tab: Tab; stale: boolean; actions: Actions }) {
  return (
    <li class={`row${stale ? " stale" : ""}${tab.discarded ? " asleep" : ""}`}>
      <button class="row-main" title={`${tab.title}\n${tab.url}`} onClick={() => actions.activate(tab)}>
        <img class="fav" src={favicon(tab.url || tab.pendingUrl)} width={16} height={16} alt="" loading="lazy" decoding="async" />
        <span class="row-title">{tab.title || tab.url}</span>
        {tab.audible && <Icon name="volume" size={13} />}
        {tab.pinned && <Icon name="pin" size={13} />}
        {stale && <span class="age">{age(tab.lastAccessed!)}</span>}
      </button>
      <button class="row-x" aria-label="Close tab" title="Close tab" onClick={() => actions.close([tab.id!])}>
        <Icon name="x" size={14} />
      </button>
    </li>
  );
}

interface CardProps {
  card: Card;
  stale: Set<number>;
  searching: boolean;
  actions: Actions;
}

function TabList({ card, stale, actions }: CardProps) {
  return (
    <ul class="rows">
      {card.tabs.map((t) => (
        <TabRow key={t.id} tab={t} stale={stale.has(t.id!)} actions={actions} />
      ))}
    </ul>
  );
}

export function SiteCard(props: CardProps) {
  const { card, searching, actions } = props;
  return (
    <section class="card" style={{ height: `${cardHeight(card, searching)}px` }}>
      <header class="card-head">
        <img class="fav" src={favicon(card.tabs[0].url)} width={16} height={16} alt="" />
        <h3 class="card-title" title={card.title}>{card.title}</h3>
        <span class="count">{card.tabs.length}</span>
        <div class="card-actions">
          {card.tabs.some((t) => !t.pinned) && (
            <button class="icon-btn" title="Put these tabs in a Chrome tab group" onClick={() => actions.groupSite(card)}>
              <Icon name="folderPlus" size={15} />
            </button>
          )}
          <button class="icon-btn danger" title={`Close all ${card.tabs.length}`} onClick={() => actions.closeAll(card)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>
      <TabList {...props} />
    </section>
  );
}

export const GROUP_COLORS: `${chrome.tabGroups.Color}`[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export function GroupCard(props: CardProps) {
  const { card, searching, actions } = props;
  const group = card.group!;
  const [editing, setEditing] = useState(false);
  const collapsed = group.collapsed && !searching;
  const anchor = `--pal${group.id}`;

  const commit = (value: string) => {
    setEditing(false);
    if (value !== group.title) actions.updateGroup(group.id, { title: value });
  };

  return (
    <section class="card group" data-color={group.color} style={{ height: `${cardHeight(card, searching)}px` }}>
      <header class="card-head">
        <button
          class="icon-btn chevron"
          aria-expanded={!group.collapsed}
          title={group.collapsed ? "Expand in tab strip" : "Collapse in tab strip"}
          onClick={() => actions.updateGroup(group.id, { collapsed: !group.collapsed })}
        >
          <Icon name="chevron" size={15} />
        </button>
        <button class="swatch" title="Group color" popovertarget={`pal${group.id}`} style={`anchor-name:${anchor}`} />
        <div class="palette" id={`pal${group.id}`} popover="auto" style={`position-anchor:${anchor}`}>
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              class="swatch"
              data-color={c}
              aria-label={c}
              aria-pressed={c === group.color}
              onClick={(e) => {
                actions.updateGroup(group.id, { color: c });
                (e.currentTarget.parentElement as HTMLElement).hidePopover();
              }}
            />
          ))}
        </div>
        {editing ? (
          <input
            class="rename"
            value={group.title}
            placeholder="Group name"
            ref={(el) => el?.focus()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget.value.trim());
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={(e) => editing && commit(e.currentTarget.value.trim())}
          />
        ) : (
          <h3 class="card-title" title="Double-click to rename" onDblClick={() => setEditing(true)}>
            {group.title || <span class="unnamed">Unnamed group</span>}
          </h3>
        )}
        <span class="count">{card.tabs.length}</span>
        <div class="card-actions">
          <button class="icon-btn" title="Rename" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={14} />
          </button>
          <button class="icon-btn" title="Sort this group by site" onClick={() => actions.sortGroup(card)}>
            <Icon name="layers" size={15} />
          </button>
          <button class="icon-btn" title="Ungroup" onClick={() => actions.ungroup(card)}>
            <Icon name="ungroup" size={15} />
          </button>
          <button class="icon-btn danger" title="Close group" onClick={() => actions.closeAll(card)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>
      {collapsed ? (
        <button class="strip" title="Expand" onClick={() => actions.updateGroup(group.id, { collapsed: false })}>
          {card.tabs.slice(0, 14).map((t) => (
            <img key={t.id} class="fav" src={favicon(t.url)} width={16} height={16} alt="" />
          ))}
          {card.tabs.length > 14 && <span class="count">+{card.tabs.length - 14}</span>}
        </button>
      ) : (
        <TabList {...props} />
      )}
    </section>
  );
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

export function BookmarksCard({ items }: { items: Bookmark[] }) {
  return (
    <section class="card bookmarks" style={{ height: `${bookmarksHeight(items.length)}px` }}>
      <header class="card-head">
        <Icon name="star" size={15} />
        <h3 class="card-title">Bookmarks</h3>
        <span class="count">{items.length}</span>
      </header>
      <ul class="rows">
        {items.map((b) => (
          <li key={b.id} class="row">
            <button class="row-main" title={b.url} onClick={() => chrome.tabs.update({ url: b.url })}>
              <img class="fav" src={favicon(b.url)} width={16} height={16} alt="" loading="lazy" />
              <span class="row-title">{b.title || b.url}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
