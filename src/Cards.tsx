import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Card, Tab } from "./model";
import { Icon } from "./icons";
import { Favicon } from "./favicons";

export interface Actions {
  activate(tab: Tab): void;
  close(ids: number[]): void;
  /** Asks for confirmation, then calls `close` (the card animates out and closes its tabs). */
  closeAll(card: Card, close: () => void): void;
  groupSite(card: Card): void;
  updateGroup(id: number, change: chrome.tabGroups.UpdateProperties): void;
  ungroup(card: Card): void;
  sortGroup(card: Card): void;
  /** Opens the "move to group" menu for a tab, anchored to the clicked button. */
  groupMenu(tab: Tab, anchor: HTMLElement): void;
  /** Moves tabs into a group, into a new group, or (null) out of their group. Undoable. */
  moveToGroup(tabIds: number[], target: number | "new" | null): void;
}

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

interface Placement {
  count: number;
  column: Map<string, number>;
  order: Map<string, number>;
  next: number;
}

/**
 * Masonry: tallest card first, each into the currently shortest column. Balances columns well and
 * gives a giant card (x.com with 200 tabs) a column of its own instead of sitting under small ones.
 *
 * Placement is sticky: a card keeps its column and position while the page is open, so closing a
 * tab only shrinks its card instead of reshuffling the layout under the cursor. Only new cards are
 * placed, and everything is re-laid out when the column count changes. `fresh` lays out from
 * scratch without touching the sticky placement (search results).
 */
export function Masonry({ bricks, fresh = false }: { bricks: Brick[]; fresh?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const sticky = useRef<Placement>({ count: 0, column: new Map(), order: new Map(), next: 0 });
  // State is the column count, not the width, so most resizes don't re-render. The update waits a
  // frame: re-rendering inside the observer callback changes our own height in the same frame,
  // which Chrome reports as "ResizeObserver loop completed with undelivered notifications".
  const [count, setCount] = useState(0);
  useLayoutEffect(() => {
    const columnsFor = (width: number) => Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP)));
    setCount(columnsFor(ref.current!.clientWidth));
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCount(columnsFor(entry.contentRect.width)));
    });
    observer.observe(ref.current!);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!count) return <div class="masonry" ref={ref} />;

  const place: Placement = fresh ? { count, column: new Map(), order: new Map(), next: 0 } : sticky.current;
  if (place.count !== count) {
    place.count = count;
    place.column.clear();
    place.order.clear();
  }
  const live = new Set(bricks.map((b) => b.key));
  for (const key of place.column.keys()) {
    if (!live.has(key)) {
      place.column.delete(key);
      place.order.delete(key);
    }
  }

  const heights = new Array<number>(count).fill(0);
  for (const b of bricks) {
    const c = place.column.get(b.key);
    if (c !== undefined) heights[c] += b.height + GAP;
  }
  for (const b of bricks.filter((b) => !place.column.has(b.key)).sort((a, b) => b.height - a.height)) {
    const shortest = heights.indexOf(Math.min(...heights));
    place.column.set(b.key, shortest);
    place.order.set(b.key, place.next++);
    heights[shortest] += b.height + GAP;
  }

  const columns: Brick[][] = Array.from({ length: count }, () => []);
  for (const b of bricks) columns[place.column.get(b.key)!].push(b);
  for (const column of columns) column.sort((a, b) => place.order.get(a.key)! - place.order.get(b.key)!);
  return (
    <div class="masonry" ref={ref}>
      {columns.map((column, i) => (
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

interface RowProps {
  tab: Tab;
  stale: boolean;
  actions: Actions;
  /** Closing this row empties the card: the card animates out instead. */
  onLast?: () => void;
}

function TabRow({ tab, stale, actions, onLast }: RowProps) {
  const [leaving, setLeaving] = useState(false);
  return (
    <li
      class={`row${stale ? " stale" : ""}${tab.discarded ? " asleep" : ""}${leaving ? " leaving" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer!.setData(DRAG_TYPE, String(tab.id));
        e.dataTransfer!.effectAllowed = "move";
      }}
    >
      <button class="row-main" title={`${tab.title}\n${tab.url}`} onClick={() => actions.activate(tab)}>
        <Favicon url={tab.url || tab.pendingUrl} />
        <span class="row-title">{tab.title || tab.url}</span>
        {tab.audible && <Icon name="volume" size={13} />}
        {stale && <span class="age">{age(tab.lastAccessed!)}</span>}
      </button>
      <button
        class="row-x row-group"
        aria-label="Move to group"
        title="Move to group"
        onClick={(e) => actions.groupMenu(tab, e.currentTarget)}
      >
        <Icon name="folderPlus" size={14} />
      </button>
      <button
        class="row-x"
        aria-label="Close tab"
        title="Close tab"
        onClick={() => {
          if (onLast) return onLast();
          // The animation is cosmetic: the close runs on a timer even if this row unmounts first.
          setLeaving(true);
          setTimeout(() => actions.close([tab.id!]), ROW_EXIT_MS);
        }}
      >
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

function TabList({ card, stale, actions, onLast }: CardProps & { onLast: () => void }) {
  return (
    <ul class="rows">
      {card.tabs.map((t) => (
        <TabRow key={t.id} tab={t} stale={stale.has(t.id!)} actions={actions} onLast={card.tabs.length === 1 ? onLast : undefined} />
      ))}
    </ul>
  );
}

/**
 * Rows can be dragged onto a group card (move into that group) or a site card (take out of its group).
 * The drop handler decides; dragover only knows a tab is being dragged, not which one.
 */
const DRAG_TYPE = "application/x-lemontabs-tab";

function useDrop(target: number | null, actions: Actions) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => e.dataTransfer?.types.includes(DRAG_TYPE);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer!.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = Number(e.dataTransfer?.getData(DRAG_TYPE));
        if (!id) return;
        e.preventDefault();
        actions.moveToGroup([id], target);
      },
    },
  };
}

/** Pinned tabs: a compact strip of icons. They rarely change and are usually busy, so no rows. */
export function PinnedStrip({ tabs, actions }: { tabs: Tab[]; actions: Actions }) {
  return (
    <div class="pinned">
      {tabs.map((t) => (
        <button key={t.id} class="pin" title={`${t.title}\n${t.url}`} onClick={() => actions.activate(t)}>
          <Favicon url={t.url || t.pendingUrl} />
          <span class="pin-title">{t.title || t.url}</span>
          {t.audible && <Icon name="volume" size={12} />}
        </button>
      ))}
    </div>
  );
}

/** Match the row-out / card-out animation durations in styles.css. */
const ROW_EXIT_MS = 180;
const CARD_EXIT_MS = 240;

/**
 * Cards size themselves from their rows, so a closing row collapses and everything below glides up.
 * A card that is going away gets its height pinned and animates to zero; its tabs close on a timer,
 * not on animationend, so a re-render that drops the card mid-animation can't cancel the close.
 */
function useCardExit({ card, searching, actions }: CardProps) {
  const [leaving, setLeaving] = useState(false);
  const height = cardHeight(card, searching);
  return {
    leaving,
    leave: () => {
      if (leaving) return;
      setLeaving(true);
      const ids = card.tabs.map((t) => t.id!);
      setTimeout(() => actions.close(ids), CARD_EXIT_MS);
    },
    style: leaving ? { height: `${height}px` } : { containIntrinsicSize: `auto ${height}px` },
  };
}

export function SiteCard(props: CardProps) {
  const { card, actions } = props;
  const exit = useCardExit(props);
  const drop = useDrop(null, actions);
  return (
    <section
      class={`card${exit.leaving ? " leaving" : ""}${drop.over ? " drop" : ""}`}
      style={exit.style}
      {...drop.props}
    >
      <header class="card-head">
        <Favicon url={card.tabs[0].url} />
        <h3 class="card-title" title={card.title}>{card.title}</h3>
        <span class="count">{card.tabs.length}</span>
        <div class="card-actions">
          <button class="icon-btn" title="Put these tabs in a Chrome tab group" onClick={() => actions.groupSite(card)}>
            <Icon name="folderPlus" size={15} />
          </button>
          <button class="icon-btn danger" title={`Close all ${card.tabs.length}`} onClick={() => actions.closeAll(card, exit.leave)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>
      <TabList {...props} onLast={exit.leave} />
    </section>
  );
}

export const GROUP_COLORS: `${chrome.tabGroups.Color}`[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export function GroupCard(props: CardProps) {
  const { card, searching, actions } = props;
  const exit = useCardExit(props);
  const group = card.group!;
  const [editing, setEditing] = useState(false);
  const collapsed = group.collapsed && !searching;
  const anchor = `--pal${group.id}`;
  const drop = useDrop(group.id, actions);

  // One rename session ends exactly once: Enter, Escape (discard) and blur can all fire for it, and
  // a blur after Escape must not save what was typed.
  const ended = useRef(false);
  const startEditing = () => {
    ended.current = false;
    setEditing(true);
  };
  const finish = (value: string | null) => {
    if (ended.current) return;
    ended.current = true;
    setEditing(false);
    if (value !== null && value !== group.title) actions.updateGroup(group.id, { title: value });
  };

  return (
    <section
      class={`card group${exit.leaving ? " leaving" : ""}${drop.over ? " drop" : ""}`}
      data-color={group.color}
      style={exit.style}
      {...drop.props}
    >
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
              if (e.key === "Enter") finish(e.currentTarget.value.trim());
              if (e.key === "Escape") finish(null);
            }}
            onBlur={(e) => finish(e.currentTarget.value.trim())}
          />
        ) : (
          <h3 class="card-title" title="Double-click to rename" onDblClick={startEditing}>
            {group.title || <span class="unnamed">Unnamed group</span>}
          </h3>
        )}
        <span class="count">{card.tabs.length}</span>
        <div class="card-actions">
          <button class="icon-btn" title="Rename" onClick={startEditing}>
            <Icon name="pencil" size={14} />
          </button>
          <button class="icon-btn" title="Sort this group by site" onClick={() => actions.sortGroup(card)}>
            <Icon name="layers" size={15} />
          </button>
          <button class="icon-btn" title="Ungroup" onClick={() => actions.ungroup(card)}>
            <Icon name="ungroup" size={15} />
          </button>
          <button class="icon-btn danger" title="Close group" onClick={() => actions.closeAll(card, exit.leave)}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>
      {collapsed ? (
        <button class="strip" title="Expand" onClick={() => actions.updateGroup(group.id, { collapsed: false })}>
          {card.tabs.slice(0, 14).map((t) => (
            <Favicon key={t.id} url={t.url} />
          ))}
          {card.tabs.length > 14 && <span class="count">+{card.tabs.length - 14}</span>}
        </button>
      ) : (
        <TabList {...props} onLast={exit.leave} />
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
    <section class="card bookmarks" style={{ containIntrinsicSize: `auto ${bookmarksHeight(items.length)}px` }}>
      <header class="card-head">
        <Icon name="star" size={15} />
        <h3 class="card-title">Bookmarks</h3>
        <span class="count">{items.length}</span>
      </header>
      <ul class="rows">
        {items.map((b) => (
          <li key={b.id} class="row">
            <button class="row-main" title={b.url} onClick={() => chrome.tabs.update({ url: b.url })}>
              <Favicon url={b.url} />
              <span class="row-title">{b.title || b.url}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
