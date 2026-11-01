export type Kind = "Movie" | "Series" | "Special";
export type Lane = "Infinity" | "Multiverse" | "Street" | "Legacy" | "Future";
export type TimelineMode = "story" | "release";
export type ViewMode = "graph" | "timeline";
export type KindFilter = "All" | Kind;

export type Story = {
  id: string;
  title: string;
  kind: Kind;
  releaseYear: number;
  storyYearLabel: string;
  storyOrder: number;
  releaseOrder: number;
  lane: Lane;
  deps: string[];
  note: string;
  optional?: boolean;
  upcoming?: boolean;
  editorialPlacement?: boolean;
  /**
   * Announced premiere date (ISO yyyy-mm-dd) for upcoming titles. Drives the
   * countdown; once the date passes the countdown moves on to the next one.
   */
  premiere?: string;
};

export type StoryInput = Omit<
  Story,
  "releaseYear" | "storyYearLabel" | "storyOrder" | "releaseOrder"
> & {
  releaseYear: number;
  storyYearLabel: string;
};

/** The story the Inspector opens on when nothing else is selected. */
export const FEATURED_STORY_ID = "doomsday";

/**
 * Sentinel destination meaning "no destination — show the whole map".
 *
 * This is the default: opening the graph on one film's ancestry hides most of
 * the dataset behind a choice the reader has not made yet. Picking a
 * destination is the *narrowing* action, so it is the one that carries a `to`
 * param. Deliberately not a real story id — parseUrlState validates `to`
 * against the story set, so `?to=all` can never collide with it.
 */
export const ALL_STORIES_ID = "all";

/**
 * The timeline's default ordering. Referenced by parseUrlState, serializeUrlState
 * and the SSR state seed so the three can never drift apart — the round-trip test
 * `serializeUrlState(parseUrlState("")) === "/"` fails loudly if they do.
 */
export const DEFAULT_TIMELINE_MODE: TimelineMode = "release";

/**
 * Deep cuts are off by default: the map opens on the required spine, and the
 * optional texture is opt-in. Referenced by parseUrlState, serializeUrlState,
 * resetGraphState and the SSR seed, for the same anti-drift reason as above.
 */
export const DEFAULT_SHOW_OPTIONAL = false;

/**
 * `storyOrderOffset` exists because the dataset is authored as two lists that
 * are later concatenated. Numbering both from zero makes `storyOrder` — and, if
 * they are given separate release sequences, `releaseOrder` — collide across
 * the join, which silently corrupts any sort over the combined set. Callers
 * pass one shared release sequence and offset the second list's story order.
 */
export function finalizeStories(
  inputs: StoryInput[],
  releaseSequence: string[],
  storyOrderOffset = 0,
): Story[] {
  const releaseRanks = new Map(
    releaseSequence.map((id, index) => [id, index]),
  );

  return inputs.map((story, index) => ({
    ...story,
    storyOrder: storyOrderOffset + index,
    releaseOrder:
      releaseRanks.get(story.id) ??
      releaseSequence.length + story.releaseYear * 100 + storyOrderOffset + index,
  }));
}

export function sortTimeline(
  stories: Story[],
  mode: TimelineMode,
): Story[] {
  const key = mode === "story" ? "storyOrder" : "releaseOrder";
  return [...stories].sort((a, b) => a[key] - b[key]);
}

export function ancestorIds(
  target: Story,
  byId: Map<string, Story>,
): Set<string> {
  const found = new Set<string>();
  const visit = (id: string) => {
    if (found.has(id)) return;
    found.add(id);
    byId.get(id)?.deps.forEach(visit);
  };
  target.deps.forEach(visit);
  return found;
}

export type GraphEdge = { from: string; to: string };

export function dependencyEdges(stories: Story[]): GraphEdge[] {
  const ids = new Set(stories.map(({ id }) => id));
  return stories.flatMap((story) =>
    story.deps
      .filter((dependency) => ids.has(dependency))
      .map((dependency) => ({ from: dependency, to: story.id })),
  );
}

export function depthOf(
  id: string,
  byId: Map<string, Story>,
  memo = new Map<string, number>(),
): number {
  if (memo.has(id)) return memo.get(id)!;
  const item = byId.get(id);
  const depth =
    !item || item.deps.length === 0
      ? 0
      : 1 + Math.max(...item.deps.map((dep) => depthOf(dep, byId, memo)));
  memo.set(id, depth);
  return depth;
}

export type VisibleGraphOptions = {
  showOptional: boolean;
  /** Subtree roots the reader has folded shut. */
  collapsed?: ReadonlySet<string>;
  /** Nodes to treat as terminal, e.g. everything already watched. */
  hidden?: ReadonlySet<string>;
};

/**
 * Walk back from the destination, refusing to expand the dependencies of any
 * collapsed or hidden node.
 *
 * A null destination means "the whole map": every story survives, subject only
 * to the deep-cut and hidden filters. Collapse is meaningless there — nothing
 * is reachable *only* through another node when every node is a root — so it
 * is ignored rather than silently pruning shared prerequisites.
 *
 * That one rule gives the right answer for every disclosure control:
 *
 *  - Collapsing X drops the prerequisites reachable *only* through X, while
 *    shared ones survive via their other paths. Subtracting ancestorIds(X)
 *    instead would wrongly orphan shared nodes like endgame.
 *  - "Hide watched" is the same walk with hidden = watched, which prunes the
 *    ancestors you only needed because of something you have already seen.
 *
 * `hiddenCounts` reports how many ancestors each surviving node is concealing,
 * for the "+12" badge on a collapsed node.
 *
 * `deepCutCounts` reports how many of a surviving node's *direct* prerequisites
 * the deep-cut filter removed. Some required stories genuinely depend on
 * optional ones — Born Again on Daredevil S3, Deadpool & Wolverine on Logan —
 * so with deep cuts off those nodes would otherwise render as if they needed
 * less setup than they do. Counting the cut edges keeps the omission visible
 * instead of silently rewriting the prerequisite list.
 */
export function visibleGraph(
  destination: Story | null,
  byId: Map<string, Story>,
  options: VisibleGraphOptions,
): {
  ids: Set<string>;
  hiddenCounts: Map<string, number>;
  deepCutCounts: Map<string, number>;
} {
  const { showOptional, collapsed, hidden } = options;
  const ids = new Set<string>();

  if (!destination) {
    for (const story of byId.values()) {
      if (!showOptional && story.optional) continue;
      if (hidden?.has(story.id)) continue;
      ids.add(story.id);
    }
    return {
      ids,
      hiddenCounts: new Map(),
      deepCutCounts: deepCutCounts(ids, byId, options),
    };
  }

  const queue: string[] = [destination.id];

  while (queue.length) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    const story = byId.get(id);
    if (!story) continue;
    // The destination is always shown, even if it is optional or watched.
    if (id !== destination.id && !showOptional && story.optional) continue;
    ids.add(id);

    // Terminal: keep the node, but do not walk past it.
    if (id !== destination.id && (collapsed?.has(id) || hidden?.has(id))) continue;
    for (const dep of story.deps) if (!ids.has(dep)) queue.push(dep);
  }

  const hiddenCounts = new Map<string, number>();
  for (const id of ids) {
    if (id === destination.id) continue;
    if (!collapsed?.has(id) && !hidden?.has(id)) continue;
    const story = byId.get(id);
    if (!story) continue;
    let concealed = 0;
    for (const ancestor of ancestorIds(story, byId)) {
      if (!ids.has(ancestor)) concealed += 1;
    }
    if (concealed > 0) hiddenCounts.set(id, concealed);
  }

  return {
    ids,
    hiddenCounts,
    deepCutCounts: deepCutCounts(ids, byId, options),
  };
}

/**
 * Direct prerequisites that the deep-cut filter — and only the deep-cut filter —
 * removed from each visible node. Nodes the reader collapsed or hid are excluded
 * from the tally at source: their prerequisites are already reported by
 * `hiddenCounts`, and counting them twice would double-report the same edges.
 */
function deepCutCounts(
  ids: ReadonlySet<string>,
  byId: Map<string, Story>,
  { showOptional, collapsed, hidden }: VisibleGraphOptions,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (showOptional) return counts;
  for (const id of ids) {
    if (collapsed?.has(id) || hidden?.has(id)) continue;
    const story = byId.get(id);
    if (!story) continue;
    let cut = 0;
    for (const dep of story.deps) {
      if (ids.has(dep)) continue;
      if (byId.get(dep)?.optional) cut += 1;
    }
    if (cut > 0) counts.set(id, cut);
  }
  return counts;
}

export function graphStories(
  stories: Story[],
  selected: Story | null,
  byId: Map<string, Story>,
  showOptional: boolean,
  options: Omit<VisibleGraphOptions, "showOptional"> = {},
): Story[] {
  const { ids } = visibleGraph(selected, byId, { ...options, showOptional });
  return stories.filter((story) => ids.has(story.id));
}

/**
 * Shortest chain of required stories from an origin to the destination.
 *
 * NOTE: this is a visual spine, not a watchlist. The set you actually have to
 * watch is the full required closure, which is far larger. Label any UI for it
 * accordingly.
 */
export function criticalPath(
  destinationId: string,
  byId: Map<string, Story>,
): string[] {
  const start = byId.get(destinationId);
  if (!start) return [];

  const required = (story: Story) =>
    story.deps
      .map((id) => byId.get(id))
      .filter((dep): dep is Story => !!dep && !dep.optional)
      .map(({ id }) => id)
      .sort();

  // Breadth-first backwards, so the first origin reached is the shallowest.
  const previous = new Map<string, string | null>([[destinationId, null]]);
  const queue: string[] = [destinationId];
  let origin: string | null = null;

  while (queue.length) {
    const id = queue.shift()!;
    const story = byId.get(id);
    if (!story) continue;
    const deps = required(story);
    if (deps.length === 0) {
      origin = id;
      break;
    }
    for (const dep of deps) {
      if (previous.has(dep)) continue;
      previous.set(dep, id);
      queue.push(dep);
    }
  }

  if (!origin) return [destinationId];
  const chain: string[] = [];
  for (let at: string | null = origin; at !== null; at = previous.get(at) ?? null) {
    chain.push(at);
  }
  return chain;
}

export function graphMetrics(
  stories: Story[],
  destinationId: string,
  watched: Set<string>,
) {
  const prerequisites = stories.filter(({ id }) => id !== destinationId);
  return {
    total: prerequisites.length,
    unwatched: prerequisites.filter(({ id }) => !watched.has(id)).length,
  };
}

/**
 * Assign stories to columns by longest-path depth. The memo lives inside the
 * call, so callers get one DAG walk per invocation rather than one per node.
 */
export function layerStories(
  stories: Story[],
  byId: Map<string, Story>,
): Story[][] {
  if (stories.length === 0) return [];
  const memo = new Map<string, number>();
  const depths = stories.map((story) => depthOf(story.id, byId, memo));
  const maxDepth = Math.max(...depths, 0);
  const columns: Story[][] = Array.from({ length: maxDepth + 1 }, () => []);
  stories.forEach((story, index) => columns[depths[index]].push(story));
  return columns;
}

/**
 * Edge crossings between two adjacent columns.
 *
 * Two edges cross when their endpoints are ordered oppositely on the two sides,
 * so this counts inverted pairs over the edge list.
 */
export function countCrossings(
  left: string[],
  right: string[],
  edges: GraphEdge[],
): number {
  const leftIndex = new Map(left.map((id, index) => [id, index]));
  const rightIndex = new Map(right.map((id, index) => [id, index]));
  const pairs: Array<[number, number]> = [];
  for (const edge of edges) {
    const from = leftIndex.get(edge.from);
    const to = rightIndex.get(edge.to);
    if (from === undefined || to === undefined) continue;
    pairs.push([from, to]);
  }

  let crossings = 0;
  for (let a = 0; a < pairs.length; a += 1) {
    for (let b = a + 1; b < pairs.length; b += 1) {
      const [a1, a2] = pairs[a];
      const [b1, b2] = pairs[b];
      if ((a1 - b1) * (a2 - b2) < 0) crossings += 1;
    }
  }
  return crossings;
}

export function totalCrossings(columns: string[][], edges: GraphEdge[]): number {
  let total = 0;
  for (let i = 0; i + 1 < columns.length; i += 1) {
    total += countCrossings(columns[i], columns[i + 1], edges);
  }
  return total;
}

/**
 * Heading for a graph column.
 *
 * Replaces the old "N steps back", which counted backwards from a destination
 * the reader can change — so the same column was labelled differently from one
 * moment to the next. A wave number plus the span of release years says what
 * the column actually contains.
 */
export function columnLabel(
  column: Story[],
  index: number,
  lastIndex: number,
  hasDestination = true,
): { title: string; detail: string } {
  const count = column.length;
  const titles = `${count} ${count === 1 ? "title" : "titles"}`;
  // With the whole map on screen the last column is simply the deepest wave;
  // calling it the destination would name a story the reader never chose.
  if (index === lastIndex && hasDestination) {
    return { title: "Destination", detail: "" };
  }
  if (index === 0) return { title: "Origins", detail: titles };

  const years = column.map((story) => story.releaseYear);
  const from = Math.min(...years);
  const to = Math.max(...years);
  return {
    title: `Wave ${index}`,
    detail: `${titles} · ${from === to ? from : `${from}–${to}`}`,
  };
}

/**
 * Reduce edge crossings with the median heuristic (Sugiyama phase 2).
 *
 * Each sweep reorders a column by the median position of each node's neighbours
 * in the adjacent column. Two rules keep it well behaved:
 *
 *  - A node with no neighbours in the reference column keeps its current index
 *    as its sort key. Without this, isolated nodes all collapse to position 0.
 *  - A sweep is kept only if it strictly reduces the total crossing count. That
 *    makes the result monotone and idempotent, which is what makes it testable.
 *
 * Fully deterministic: ties break by current index, then by id.
 */
export function orderColumns(
  columns: Story[][],
  edges: GraphEdge[],
  sweeps = 4,
): Story[][] {
  if (columns.length < 2) return columns;

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to)!.push(edge.from);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge.to);
  }

  const median = (values: number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const reorder = (
    column: Story[],
    reference: Story[],
    neighbours: Map<string, string[]>,
  ): Story[] => {
    const position = new Map(reference.map((story, index) => [story.id, index]));
    const keyed = column.map((story, index) => {
      const linked = (neighbours.get(story.id) ?? [])
        .map((id) => position.get(id))
        .filter((value): value is number => value !== undefined);
      return { story, index, key: median(linked) ?? index };
    });
    keyed.sort(
      (a, b) =>
        a.key - b.key || a.index - b.index || a.story.id.localeCompare(b.story.id),
    );
    return keyed.map(({ story }) => story);
  };

  const ids = (cols: Story[][]) => cols.map((col) => col.map(({ id }) => id));
  let best = columns.map((column) => [...column]);
  let bestScore = totalCrossings(ids(best), edges);

  for (let sweep = 0; sweep < sweeps && bestScore > 0; sweep += 1) {
    const candidate = best.map((column) => [...column]);
    for (let i = 1; i < candidate.length; i += 1) {
      candidate[i] = reorder(candidate[i], candidate[i - 1], incoming);
    }
    for (let i = candidate.length - 2; i >= 0; i -= 1) {
      candidate[i] = reorder(candidate[i], candidate[i + 1], outgoing);
    }
    const score = totalCrossings(ids(candidate), edges);
    if (score >= bestScore) break;
    best = candidate;
    bestScore = score;
  }

  return best;
}

export type NodeTopOptions = {
  /** Minimum vertical space between two cards in the same column. */
  gap?: number;
  /** Height used for a node that has not been measured yet. */
  fallbackHeight?: number;
  sweeps?: number;
};

/**
 * Vertical placement of every node, in layout px.
 *
 * Packing each column from the top is what made the arrows unreadable: a node
 * in column 4 sat at y=0 next to a prerequisite in column 3 that also sat at
 * y=0, so dozens of long diagonals swept across the same band of empty canvas
 * and you could not tell which line left which card.
 *
 * This is Sugiyama's third phase — coordinate assignment. Each sweep pulls a
 * column's cards towards the mean position of the neighbours they are wired
 * to, then packs them back apart so they never overlap:
 *
 *  - `desired` is the weighted mean centre of every already-placed neighbour,
 *    near columns pulling harder than far ones, or the node's own current
 *    centre when it has none — isolated nodes stay put instead of collapsing
 *    back to the top.
 *  - The pack is order-preserving: the column keeps the sequence orderColumns
 *    chose to minimise crossings. Positioning must not undo that work.
 *  - After packing, the whole column is shifted by the mean error, which
 *    recovers the alignment that the downward-only packing pass gives away.
 *
 * Sweeps alternate direction and only the best-scoring configuration is kept,
 * so the result is deterministic and never worse than the naive stack.
 */
export function assignNodeTops(
  columns: readonly (readonly Story[])[],
  edges: readonly GraphEdge[],
  heights: ReadonlyMap<string, number>,
  options: NodeTopOptions = {},
): Map<string, number> {
  const gap = options.gap ?? 14;
  const fallback = options.fallbackHeight ?? 118;
  const sweeps = options.sweeps ?? 8;
  const height = (id: string) => heights.get(id) ?? fallback;

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    incoming.get(edge.to)!.push(edge.from);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge.to);
  }

  /** Stacked from the top — the layout this function exists to improve on. */
  const stack = () => {
    const centres = new Map<string, number>();
    for (const column of columns) {
      let top = 0;
      for (const story of column) {
        centres.set(story.id, top + height(story.id) / 2);
        top += height(story.id) + gap;
      }
    }
    return centres;
  };

  /** Total vertical travel of every edge. Lower is a cleaner set of arrows. */
  const score = (centres: ReadonlyMap<string, number>) => {
    let total = 0;
    for (const edge of edges) {
      const from = centres.get(edge.from);
      const to = centres.get(edge.to);
      if (from === undefined || to === undefined) continue;
      total += Math.abs(from - to);
    }
    return total;
  };

  const place = (
    column: readonly Story[],
    columnIndex: number,
    centres: Map<string, number>,
    neighbours: Map<string, string[]>,
    settled: (id: string) => boolean,
  ) => {
    const desired = column.map((story) => {
      let weight = 0;
      let total = 0;
      for (const id of neighbours.get(story.id) ?? []) {
        if (!settled(id)) continue;
        const centre = centres.get(id);
        const at = columnOf.get(id);
        if (centre === undefined || at === undefined) continue;
        // Nearer columns pull harder: a neighbour one column away shares a
        // stretch of canvas with this card, one five columns away does not.
        const pull = 1 / Math.abs(at - columnIndex);
        weight += pull;
        total += centre * pull;
      }
      if (weight === 0) return { value: centres.get(story.id)!, wired: false };
      return { value: total / weight, wired: true };
    });

    // Order-preserving pack: never move a card above the one before it.
    const tops: number[] = [];
    let limit = -Infinity;
    column.forEach((story, index) => {
      const top = Math.max(desired[index].value - height(story.id) / 2, limit);
      tops.push(top);
      limit = top + height(story.id) + gap;
    });

    // Downward-only packing drags the column away from its neighbours; shift
    // it back by the mean error so the alignment survives.
    let error = 0;
    let wired = 0;
    column.forEach((story, index) => {
      if (!desired[index].wired) return;
      wired += 1;
      error += desired[index].value - (tops[index] + height(story.id) / 2);
    });
    const shift = wired ? error / wired : 0;
    column.forEach((story, index) => {
      centres.set(story.id, tops[index] + shift + height(story.id) / 2);
    });
  };

  const columnOf = new Map<string, number>();
  columns.forEach((column, index) => {
    for (const story of column) columnOf.set(story.id, index);
  });

  let centres = stack();
  let best = new Map(centres);
  let bestScore = score(centres);

  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const forward = sweep % 2 === 0;
    const order = forward
      ? columns.map((_, index) => index).slice(1)
      : columns.map((_, index) => index).slice(0, -1).reverse();
    for (const index of order) {
      // Every already-placed neighbour counts, not only the adjacent column.
      // An edge that spans four columns is exactly the one that reads as an
      // unexplained diagonal, so it has to have a say in where its ends sit.
      place(columns[index], index, centres, forward ? incoming : outgoing, (id) => {
        const at = columnOf.get(id);
        return at !== undefined && (forward ? at < index : at > index);
      });
    }
    const current = score(centres);
    if (current < bestScore) {
      bestScore = current;
      best = new Map(centres);
    }
  }

  // Normalise against the highest card on the canvas, so the map starts at the
  // top of the stage rather than at whatever offset the sweeps drifted to.
  const tops = new Map<string, number>();
  let minTop = Infinity;
  for (const column of columns) {
    for (const story of column) {
      minTop = Math.min(minTop, best.get(story.id)! - height(story.id) / 2);
    }
  }
  if (!Number.isFinite(minTop)) minTop = 0;
  for (const column of columns) {
    for (const story of column) {
      tops.set(story.id, best.get(story.id)! - height(story.id) / 2 - minTop);
    }
  }
  return tops;
}

/*
 * Viewport maths for the graph canvas.
 *
 * Three coordinate spaces, and mixing them is the main source of bugs here:
 *
 *   Layout (L)   unzoomed px inside .graph-columns. Node offsetLeft/offsetTop,
 *                edge path `d` strings, and the content bounding box.
 *   Content (C)  L x zoom. Equals .graph-scroll's scrollable area.
 *   Viewport (V) px relative to .graph-scroll's client box. V = C - scroll.
 *
 * Zoom is applied with the CSS `zoom` property, so offsetLeft/offsetTop inside
 * the stage stay in L while getBoundingClientRect() returns C. Never mix them.
 *
 * Panning needs no zoom maths at all: drag deltas and scrollLeft are both in C,
 * so the mapping is 1:1. Do not divide a pan delta by zoom.
 */
export const ZOOM_MIN = 0.30;
export const ZOOM_MAX = 2.00;

export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

export type ZoomAtPointInput = {
  zoom: number;
  nextZoom: number;
  scrollLeft: number;
  scrollTop: number;
  /** Anchor in viewport space — the point that must not move. */
  pointerX: number;
  pointerY: number;
  /** Content bounding box in layout space. */
  contentW: number;
  contentH: number;
  clientW: number;
  clientH: number;
};

/**
 * Zoom about a fixed anchor. The layout-space point under the pointer before
 * the change is the same point under it afterwards, so the graph grows out of
 * the cursor rather than the top-left corner.
 */
export function zoomAtPoint(input: ZoomAtPointInput): {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
} {
  const zoom = clampZoom(input.nextZoom);
  const layoutX = (input.scrollLeft + input.pointerX) / input.zoom;
  const layoutY = (input.scrollTop + input.pointerY) / input.zoom;
  const maxLeft = Math.max(0, input.contentW * zoom - input.clientW);
  const maxTop = Math.max(0, input.contentH * zoom - input.clientH);
  return {
    zoom,
    scrollLeft: Math.min(maxLeft, Math.max(0, layoutX * zoom - input.pointerX)),
    scrollTop: Math.min(maxTop, Math.max(0, layoutY * zoom - input.pointerY)),
  };
}

/** Largest zoom that fits the content box inside the viewport, capped at 1. */
export function fitZoom(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 64,
): number {
  if (content.width <= 0 || content.height <= 0) return 1;
  const scale = Math.min(
    (viewport.width - padding) / content.width,
    (viewport.height - padding) / content.height,
  );
  return Math.min(1, Math.max(ZOOM_MIN, scale));
}

export type UrlState = {
  destinationId: string;
  view: ViewMode;
  timelineMode: TimelineMode;
  kind: KindFilter;
  showOptional: boolean;
};

export function parseUrlState(
  search: string,
  validIds: Set<string>,
): UrlState {
  const params = new URLSearchParams(search);
  const destination = params.get("to");
  const view = params.get("view");
  const order = params.get("order");
  const kind = params.get("kind");
  return {
    destinationId:
      destination && validIds.has(destination) ? destination : ALL_STORIES_ID,
    view: view === "timeline" ? "timeline" : "graph",
    timelineMode: order === "story" ? "story" : DEFAULT_TIMELINE_MODE,
    kind:
      kind === "Movie" || kind === "Series" || kind === "Special" ? kind : "All",
    showOptional: params.get("deep") === "1",
  };
}

export function serializeUrlState(state: UrlState, pathname = ""): string {
  const params = new URLSearchParams();
  if (state.destinationId !== ALL_STORIES_ID)
    params.set("to", state.destinationId);
  if (!pathname && state.view !== "graph") params.set("view", state.view);
  if (state.timelineMode !== DEFAULT_TIMELINE_MODE)
    params.set("order", state.timelineMode);
  if (state.kind !== "All") params.set("kind", state.kind);
  if (state.showOptional !== DEFAULT_SHOW_OPTIONAL) params.set("deep", "1");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname || "/";
}

export function resetGraphState() {
  return {
    selectedId: ALL_STORIES_ID,
    kind: "All" as const,
    showOptional: DEFAULT_SHOW_OPTIONAL,
    query: "",
  };
}

export type StoryValidationOptions = {
  total?: number;
  canonical?: number;
  legacy?: number;
};

export function validateStories(
  stories: readonly Story[],
  expected: StoryValidationOptions = {},
): void {
  const ids = new Set<string>();
  for (const story of stories) {
    if (!story.id.trim()) throw new Error("Every story needs a stable id.");
    if (ids.has(story.id)) throw new Error(`Duplicate story id: ${story.id}`);
    ids.add(story.id);
  }

  for (const story of stories) {
    for (const dependency of story.deps) {
      if (dependency === story.id) {
        throw new Error(`Story ${story.id} cannot depend on itself.`);
      }
      if (!ids.has(dependency)) {
        throw new Error(`Story ${story.id} references missing dependency ${dependency}.`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(stories.map((story) => [story.id, story]));
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Dependency cycle detected at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    byId.get(id)?.deps.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  stories.forEach(({ id }) => visit(id));

  if (expected.total !== undefined && stories.length !== expected.total) {
    throw new Error(`Expected ${expected.total} stories, received ${stories.length}.`);
  }
  const legacyCount = stories.filter(({ lane }) => lane === "Legacy").length;
  if (expected.legacy !== undefined && legacyCount !== expected.legacy) {
    throw new Error(`Expected ${expected.legacy} legacy stories, received ${legacyCount}.`);
  }
  if (
    expected.canonical !== undefined &&
    stories.length - legacyCount !== expected.canonical
  ) {
    throw new Error(
      `Expected ${expected.canonical} canonical stories, received ${stories.length - legacyCount}.`,
    );
  }
}

const WATCHED_STATE_VERSION = 1;
const RECENT_STATE_VERSION = 1;

/** Recent destinations are capped so the stored payload cannot grow forever. */
export const MAX_RECENT_DESTINATIONS = 8;

/**
 * Shared reader for the versioned `{version, ids}` payloads in localStorage.
 *
 * Order is preserved exactly as stored. That matters: watched state is written
 * sorted and read as a Set, but recents are a queue whose order *is* the data,
 * so the parser must not reorder and the serializer sorts only on request.
 */
function parseIdList(
  raw: string | null,
  validIds: ReadonlySet<string>,
  version: number,
): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids =
      Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            "version" in parsed &&
            "ids" in parsed &&
            (parsed as { version?: unknown }).version === version &&
            Array.isArray((parsed as { ids?: unknown }).ids)
          ? (parsed as { ids: unknown[] }).ids
          : [];
    return ids.filter(
      (id): id is string => typeof id === "string" && validIds.has(id),
    );
  } catch {
    return [];
  }
}

function serializeIdList(
  ids: Iterable<string>,
  version: number,
  sort: boolean,
): string {
  const list = [...ids];
  return JSON.stringify({ version, ids: sort ? list.sort() : list });
}

export function parseWatchedState(
  raw: string | null,
  validIds: ReadonlySet<string>,
): Set<string> {
  return new Set(parseIdList(raw, validIds, WATCHED_STATE_VERSION));
}

export function serializeWatchedState(ids: ReadonlySet<string>): string {
  return serializeIdList(ids, WATCHED_STATE_VERSION, true);
}

/**
 * Recently chosen destinations, newest first. Unlike the watched set this is
 * ordered and deduplicated on write, so the order survives the round trip.
 */
export function parseRecentIds(
  raw: string | null,
  validIds: ReadonlySet<string>,
): string[] {
  return dedupe(parseIdList(raw, validIds, RECENT_STATE_VERSION)).slice(
    0,
    MAX_RECENT_DESTINATIONS,
  );
}

export function serializeRecentIds(ids: readonly string[]): string {
  return serializeIdList(
    dedupe(ids).slice(0, MAX_RECENT_DESTINATIONS),
    RECENT_STATE_VERSION,
    false,
  );
}

/**
 * The single id behind the dock's "last watched" jump.
 *
 * Kept apart from the watched Set on purpose: that one is stored sorted, so it
 * cannot answer "which one did you tick most recently".
 */
export function parseStoredId(
  raw: string | null,
  validIds: ReadonlySet<string>,
): string | null {
  return raw && validIds.has(raw) ? raw : null;
}

/** Push an id to the front, dropping any earlier occurrence. */
export function pushRecentId(ids: readonly string[], id: string): string[] {
  return dedupe([id, ...ids]).slice(0, MAX_RECENT_DESTINATIONS);
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Direct prerequisites and direct dependents of a node, restricted to what is
 * currently on the map.
 *
 * Single source of truth for that derivation: the Inspector renders it as two
 * lists of buttons, and the graph nodes render it as a screen-reader
 * description. They must never disagree about what a node is connected to.
 */
export function nodeRelations(
  id: string,
  edges: readonly GraphEdge[],
  visibleIds: ReadonlySet<string>,
): { requires: string[]; unlocks: string[] } {
  const requires: string[] = [];
  const unlocks: string[] = [];
  for (const edge of edges) {
    if (edge.to === id && visibleIds.has(edge.from)) requires.push(edge.from);
    if (edge.from === id && visibleIds.has(edge.to)) unlocks.push(edge.to);
  }
  return { requires, unlocks };
}

/**
 * Sentence describing a node's place in the map, for `aria-describedby`.
 *
 * The graph itself is drawn as SVG paths and is hidden from assistive tech, so
 * without this the arrows — the entire point of the product — carry no meaning.
 */
export function nodeSummary(
  id: string,
  byId: ReadonlyMap<string, Story>,
  edges: readonly GraphEdge[],
  visibleIds: ReadonlySet<string>,
  position?: { column: number; columns: number },
): string {
  const { requires, unlocks } = nodeRelations(id, edges, visibleIds);
  const name = (entry: string) => byId.get(entry)?.title ?? entry;
  const parts: string[] = [];

  parts.push(
    requires.length
      ? `Requires ${listPhrase(requires.map(name))}.`
      : "Origin point — nothing is required first.",
  );
  if (unlocks.length) parts.push(`Sets up ${listPhrase(unlocks.map(name))}.`);
  if (position) {
    parts.push(`Column ${position.column} of ${position.columns}.`);
  }
  return parts.join(" ");
}

/**
 * A linear, readable version of the whole dependency map.
 *
 * Rendered visually hidden after the canvas so a screen-reader user can read
 * the answer end to end instead of tabbing 95 nodes to assemble it themselves.
 */
export function graphOutline(
  columns: Story[][],
  edges: readonly GraphEdge[],
  byId: ReadonlyMap<string, Story>,
  hasDestination = true,
): Array<{
  title: string;
  detail: string;
  items: Array<{
    id: string;
    title: string;
    requires: string[];
    unlocks: string[];
  }>;
}> {
  const visibleIds = new Set(columns.flat().map(({ id }) => id));
  const name = (entry: string) => byId.get(entry)?.title ?? entry;
  return columns.map((column, index) => {
    const label = columnLabel(column, index, columns.length - 1, hasDestination);
    return {
      title: label.title,
      detail: label.detail,
      items: column.map((story) => {
        const { requires, unlocks } = nodeRelations(story.id, edges, visibleIds);
        return {
          id: story.id,
          title: story.title,
          requires: requires.map(name),
          unlocks: unlocks.map(name),
        };
      }),
    };
  });
}

/**
 * Watched completion over an arbitrary set of stories.
 *
 * Deliberately takes the story list rather than reading a global: the timeline
 * counts against what the user's filters actually show, so turning deep cuts
 * off does not make the percentage drop for no visible reason. `graphMetrics`
 * answers a different question — progress along one destination's path.
 */
export function watchedProgress(
  stories: readonly Story[],
  watched: ReadonlySet<string>,
): { watched: number; total: number; percent: number } {
  const total = stories.length;
  const seen = stories.filter(({ id }) => watched.has(id)).length;
  return {
    watched: seen,
    total,
    percent: total === 0 ? 0 : Math.round((seen / total) * 100),
  };
}

/** "A", "A and B", "A, B and C" — read aloud, commas alone are ambiguous. */
function listPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The next announced premiere on or after `now`, with whole days remaining.
 *
 * Data-driven so the countdown never needs editing: when Doomsday opens it
 * quietly rolls on to Secret Wars, and with nothing announced it disappears.
 * Dates are read as UTC midnight so every reader counts the same day.
 */
export function nextPremiere(
  stories: readonly Story[],
  now: Date,
): { story: Story; days: number } | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: { story: Story; at: number } | null = null;
  for (const story of stories) {
    if (!story.premiere) continue;
    const at = Date.parse(`${story.premiere}T00:00:00Z`);
    if (Number.isNaN(at) || at < today) continue;
    if (!best || at < best.at) best = { story, at };
  }
  if (!best) return null;
  return { story: best.story, days: Math.round((best.at - today) / 86_400_000) };
}

/**
 * The closure a reader must watch before `destinationId`, in watch order.
 *
 * Ordered by the chosen timeline so the list reads as a plan rather than a
 * graph dump. Deep cuts follow the same filter the map uses.
 */
export function watchPlan(
  destinationId: string,
  byId: Map<string, Story>,
  { showOptional, mode }: { showOptional: boolean; mode: TimelineMode },
): Story[] {
  const destination = byId.get(destinationId);
  if (!destination) return [];
  const { ids } = visibleGraph(destination, byId, { showOptional });
  ids.delete(destinationId);
  return sortTimeline(
    [...ids].map((id) => byId.get(id)).filter((story): story is Story => !!story),
    mode,
  );
}
