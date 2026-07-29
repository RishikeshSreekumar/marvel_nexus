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

export function descendantIds(
  sourceId: string,
  stories: Story[],
): Set<string> {
  const found = new Set<string>();
  const visit = (id: string) => {
    for (const story of stories) {
      if (!found.has(story.id) && story.deps.includes(id)) {
        found.add(story.id);
        visit(story.id);
      }
    }
  };
  visit(sourceId);
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

export function graphStories(
  stories: Story[],
  selected: Story,
  byId: Map<string, Story>,
  showOptional: boolean,
): Story[] {
  const ids = new Set([...ancestorIds(selected, byId), selected.id]);
  return stories.filter(
    (story) => ids.has(story.id) && (showOptional || !story.optional),
  );
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
    timelineMode: order === "release" ? "release" : "story",
    kind:
      kind === "Movie" || kind === "Series" || kind === "Special" ? kind : "All",
    showOptional: params.get("deep") !== "0",
  };
}

export function serializeUrlState(state: UrlState, pathname = ""): string {
  const params = new URLSearchParams();
  if (state.destinationId !== FEATURED_STORY_ID)
    params.set("to", state.destinationId);
  if (!pathname && state.view !== "graph") params.set("view", state.view);
  if (state.timelineMode !== "story") params.set("order", state.timelineMode);
  if (state.kind !== "All") params.set("kind", state.kind);
  if (!state.showOptional) params.set("deep", "0");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname || "/";
}

export function resetGraphState() {
  return {
    selectedId: FEATURED_STORY_ID,
    kind: "All" as const,
    showOptional: true,
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
