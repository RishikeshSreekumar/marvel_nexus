export type Kind = "Movie" | "Series" | "Special";
export type Lane = "Infinity" | "Multiverse" | "Street" | "Legacy" | "Future";
export type TimelineMode = "story" | "release";
export type StoryType = Kind;
export type StoryBranch = Lane;
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
};

export type StoryInput = Omit<
  Story,
  "releaseYear" | "storyYearLabel" | "storyOrder" | "releaseOrder"
> & {
  releaseYear: number;
  storyYearLabel: string;
};

export const FEATURED_STORY_ID = "doomsday";

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

export function finalizeStories(
  inputs: StoryInput[],
  releaseSequence: string[],
): Story[] {
  const releaseRanks = new Map(
    releaseSequence.map((id, index) => [id, index]),
  );

  return inputs.map((story, storyOrder) => ({
    ...story,
    storyOrder,
    releaseOrder:
      releaseRanks.get(story.id) ??
      releaseSequence.length + story.releaseYear * 100 + storyOrder,
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
 */
export function visibleGraph(
  destination: Story,
  byId: Map<string, Story>,
  options: VisibleGraphOptions,
): { ids: Set<string>; hiddenCounts: Map<string, number> } {
  const { showOptional, collapsed, hidden } = options;
  const ids = new Set<string>();
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

  return { ids, hiddenCounts };
}

export function graphStories(
  stories: Story[],
  selected: Story,
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
): { title: string; detail: string } {
  const count = column.length;
  const titles = `${count} ${count === 1 ? "title" : "titles"}`;
  if (index === lastIndex) return { title: "Destination", detail: "" };
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
      destination && validIds.has(destination) ? destination : FEATURED_STORY_ID,
    view: view === "timeline" ? "timeline" : "graph",
    timelineMode: order === "story" ? "story" : DEFAULT_TIMELINE_MODE,
    kind:
      kind === "Movie" || kind === "Series" || kind === "Special" ? kind : "All",
    showOptional: params.get("deep") === "1",
  };
}

export function serializeUrlState(state: UrlState, pathname = ""): string {
  const params = new URLSearchParams();
  if (state.destinationId !== FEATURED_STORY_ID)
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
    selectedId: FEATURED_STORY_ID,
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

export function parseWatchedState(
  raw: string | null,
  validIds: ReadonlySet<string>,
): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids =
      Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            "version" in parsed &&
            "ids" in parsed &&
            (parsed as { version?: unknown }).version === WATCHED_STATE_VERSION &&
            Array.isArray((parsed as { ids?: unknown }).ids)
          ? (parsed as { ids: unknown[] }).ids
          : [];
    return new Set(
      ids.filter((id): id is string => typeof id === "string" && validIds.has(id)),
    );
  } catch {
    return new Set();
  }
}

export function serializeWatchedState(ids: ReadonlySet<string>): string {
  return JSON.stringify({
    version: WATCHED_STATE_VERSION,
    ids: [...ids].sort(),
  });
}
