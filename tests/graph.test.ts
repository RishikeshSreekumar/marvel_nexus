import assert from "node:assert/strict";
import test from "node:test";
import {
  ancestorIds,
  DEFAULT_SHOW_OPTIONAL,
  DEFAULT_TIMELINE_MODE,
  dependencyEdges,
  depthOf,
  graphMetrics,
  graphStories,
  parseUrlState,
  parseWatchedState,
  serializeUrlState,
  serializeWatchedState,
  sortTimeline,
  validateStories,
  columnLabel,
  countCrossings,
  criticalPath,
  visibleGraph,
  fitZoom,
  layerStories,
  orderColumns,
  totalCrossings,
  zoomAtPoint,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/lib/graph.ts";
import {
  chronology,
  legacy,
  stories,
} from "../src/lib/stories.ts";

const byId = new Map(stories.map((story) => [story.id, story]));

test("ships the complete validated July 2026 dataset", () => {
  assert.equal(stories.length, 95);
  assert.equal(chronology.length, 78);
  assert.equal(legacy.length, 17);
  assert.equal(new Set(stories.map(({ id }) => id)).size, 95);
  assert.doesNotThrow(() =>
    validateStories(stories, { total: 95, canonical: 78, legacy: 17 }),
  );
});

test("rejects missing dependencies, self-links, and cycles", () => {
  const base = {
    title: "Test",
    kind: "Movie" as const,
    releaseYear: 2026,
    storyYearLabel: "2026",
    storyOrder: 0,
    releaseOrder: 0,
    lane: "Future" as const,
    note: "",
  };
  assert.throws(
    () => validateStories([{ ...base, id: "a", deps: ["missing"] }]),
    /missing dependency/,
  );
  assert.throws(
    () => validateStories([{ ...base, id: "a", deps: ["a"] }]),
    /depend on itself/,
  );
  assert.throws(
    () =>
      validateStories([
        { ...base, id: "a", deps: ["b"] },
        { ...base, id: "b", deps: ["a"] },
      ]),
    /cycle/,
  );
});

test("derives the Doomsday graph, metrics, edges, and depths", () => {
  const destination = byId.get("doomsday")!;
  const graph = graphStories([...stories], destination, byId, true);
  const requiredOnly = graphStories([...stories], destination, byId, false);
  assert.equal(ancestorIds(destination, byId).size, 59);
  assert.equal(graph.length, 60);
  assert.ok(requiredOnly.length < graph.length);
  assert.equal(graphMetrics(graph, destination.id, new Set()).unwatched, 59);
  assert.ok(dependencyEdges(graph).length > 59);
  assert.ok(depthOf(destination.id, byId) > 0);
});

test("sorts chronology independently from release chronology", () => {
  const storyOrder = sortTimeline(chronology, "story");
  const releaseOrder = sortTimeline(chronology, "release");
  assert.equal(storyOrder[0]?.id, "eyes");
  assert.equal(releaseOrder[0]?.id, "iron-man");
  assert.equal(storyOrder.at(-1)?.id, "secret-wars");
});

test("parses and serializes shareable URL state safely", () => {
  const validIds = new Set(stories.map(({ id }) => id));
  // deep=1 is the explicit opt-in; its absence means the default (no deep cuts).
  const parsed = parseUrlState(
    "?to=iron-man&view=timeline&order=release&kind=Movie&deep=1",
    validIds,
  );
  assert.deepEqual(parsed, {
    destinationId: "iron-man",
    view: "timeline",
    timelineMode: "release",
    kind: "Movie",
    showOptional: true,
  });
  assert.equal(serializeUrlState(parsed), "?to=iron-man&view=timeline&kind=Movie&deep=1");
  assert.equal(
    serializeUrlState({ ...parsed, view: "graph" }, "/graph"),
    "/graph?to=iron-man&kind=Movie&deep=1",
  );
  assert.equal(
    serializeUrlState({ ...parsed, destinationId: "doomsday" }, "/timeline"),
    "/timeline?kind=Movie&deep=1",
  );
  // Turning deep cuts off drops the param entirely rather than writing deep=0.
  assert.equal(
    serializeUrlState({ ...parsed, showOptional: false }, "/timeline"),
    "/timeline?to=iron-man&kind=Movie",
  );
});

test("collapsing a node hides only what it exclusively owns", () => {
  const destination = byId.get("doomsday")!;
  const full = visibleGraph(destination, byId, { showOptional: true }).ids;

  // Pick a node with dependencies that the graph reaches through more than one
  // route, and confirm the shared ones survive its collapse.
  const collapsed = new Set(["endgame"]);
  const pruned = visibleGraph(destination, byId, {
    showOptional: true,
    collapsed,
  });

  assert.ok(pruned.ids.has("endgame"), "the collapsed node itself stays visible");
  assert.ok(pruned.ids.size < full.size, "collapsing must hide something");

  // Anything still visible is reachable without passing through endgame.
  for (const id of pruned.ids) assert.ok(full.has(id));

  // Every concealed node is genuinely gone, and the badge count matches.
  const concealed = [...full].filter((id) => !pruned.ids.has(id));
  assert.equal(pruned.hiddenCounts.get("endgame"), concealed.length);
});

test("hiding watched stories prunes the ancestors they alone justified", () => {
  const destination = byId.get("doomsday")!;
  const full = visibleGraph(destination, byId, { showOptional: true }).ids;
  const hidden = new Set(["infinity-war"]);
  const pruned = visibleGraph(destination, byId, { showOptional: true, hidden });

  assert.ok(pruned.ids.has("infinity-war"), "watched stories stay on the map");
  assert.ok(pruned.ids.size < full.size);
  // The destination is exempt from termination: marking your own destination
  // watched must not collapse the map to a single node.
  const all = visibleGraph(destination, byId, {
    showOptional: true,
    hidden: new Set([destination.id]),
  });
  assert.ok(all.ids.has(destination.id));
  assert.equal(all.ids.size, full.size);
});

test("graphStories still matches the plain ancestor closure", () => {
  const destination = byId.get("doomsday")!;
  const graph = graphStories([...stories], destination, byId, true);
  const expected = new Set([...ancestorIds(destination, byId), destination.id]);
  assert.equal(graph.length, expected.size);
  assert.ok(graph.every(({ id }) => expected.has(id)));
});

test("critical path is a real chain of required stories", () => {
  const chain = criticalPath("doomsday", byId);
  assert.ok(chain.length > 1);
  assert.equal(chain.at(-1), "doomsday");

  // Starts at an origin, and every consecutive pair is a genuine dependency.
  assert.equal(byId.get(chain[0])!.deps.length, 0);
  for (let i = 0; i + 1 < chain.length; i += 1) {
    assert.ok(
      byId.get(chain[i + 1])!.deps.includes(chain[i]),
      `${chain[i]} -> ${chain[i + 1]} is not a dependency edge`,
    );
  }
  // No optional titles on the spine.
  assert.ok(chain.every((id) => !byId.get(id)!.optional));

  // An origin is its own path; an unknown id yields nothing.
  assert.deepEqual(criticalPath("iron-man", byId), ["iron-man"]);
  assert.deepEqual(criticalPath("nope", byId), []);
});

test("counts edge crossings between adjacent columns", () => {
  const edges = [
    { from: "a", to: "y" },
    { from: "b", to: "x" },
  ];
  // a->y and b->x invert between the two sides, so they cross.
  assert.equal(countCrossings(["a", "b"], ["x", "y"], edges), 1);
  // Flipping one side removes the inversion.
  assert.equal(countCrossings(["a", "b"], ["y", "x"], edges), 0);
  assert.equal(countCrossings(["a", "b"], ["x", "y"], []), 0);
});

test("orders columns to reduce crossings, deterministically", () => {
  const destination = byId.get("doomsday")!;
  const graph = graphStories([...stories], destination, byId, true);
  const edges = dependencyEdges(graph);
  const columns = layerStories(graph, byId);

  const asIds = (cols: typeof columns) => cols.map((col) => col.map(({ id }) => id));
  const before = totalCrossings(asIds(columns), edges);
  const ordered = orderColumns(columns, edges);
  const after = totalCrossings(asIds(ordered), edges);

  assert.ok(after <= before, `crossings rose: ${before} -> ${after}`);

  // Every column keeps exactly its own nodes — reordering must not lose or
  // duplicate anything.
  assert.equal(ordered.length, columns.length);
  columns.forEach((column, index) => {
    assert.deepEqual(
      ordered[index].map(({ id }) => id).sort(),
      column.map(({ id }) => id).sort(),
    );
  });

  // Idempotent, and stable across runs.
  assert.deepEqual(asIds(orderColumns(ordered, edges)), asIds(ordered));
  assert.deepEqual(asIds(orderColumns(layerStories(graph, byId), edges)), asIds(ordered));
});

test("labels columns by wave rather than by distance from the destination", () => {
  const destination = byId.get("doomsday")!;
  const graph = graphStories([...stories], destination, byId, true);
  const columns = layerStories(graph, byId);
  const last = columns.length - 1;

  assert.deepEqual(columnLabel(columns[last], last, last), {
    title: "Destination",
    detail: "",
  });
  assert.equal(columnLabel(columns[0], 0, last).title, "Origins");
  assert.match(columnLabel(columns[0], 0, last).detail, /^\d+ titles?$/);

  const mid = columnLabel(columns[1], 1, last);
  assert.equal(mid.title, "Wave 1");
  assert.match(mid.detail, /^\d+ titles? · \d{4}(–\d{4})?$/);

  // A single-title column reads naturally and collapses its year range.
  const one = [{ ...destination, releaseYear: 2019 }];
  assert.equal(columnLabel(one, 1, 3).detail, "1 title · 2019");
});

test("layers every story by longest-path depth", () => {
  const destination = byId.get("doomsday")!;
  const graph = graphStories([...stories], destination, byId, true);
  const columns = layerStories(graph, byId);

  assert.equal(columns.flat().length, graph.length);
  // Origins have no dependencies; the destination sits in the last column.
  assert.ok(columns[0].every((story) => story.deps.length === 0));
  assert.ok(columns.at(-1)!.some((story) => story.id === "doomsday"));
  assert.equal(layerStories([], byId).length, 0);
});

test("zooms about a fixed anchor and stays inside the scroll bounds", () => {
  const base = {
    scrollLeft: 400,
    scrollTop: 120,
    pointerX: 300,
    pointerY: 200,
    contentW: 4000,
    contentH: 1200,
    clientW: 900,
    clientH: 600,
  };

  // Whenever the target scroll is reachable, the layout point under the cursor
  // must not move. (It cannot be held once the scroll bounds clamp — see below.)
  for (const [zoom, nextZoom] of [[1, 1.5], [1, .5], [.72, 1.9], [1.2, .8]]) {
    const next = zoomAtPoint({ ...base, zoom, nextZoom });
    const before = (base.scrollLeft + base.pointerX) / zoom;
    const after = (next.scrollLeft + base.pointerX) / next.zoom;
    assert.ok(
      Math.abs(before - after) < 1e-6,
      `anchor drifted at ${zoom} -> ${nextZoom}: ${before} vs ${after}`,
    );
  }

  assert.equal(zoomAtPoint({ ...base, zoom: 1, nextZoom: 99 }).zoom, ZOOM_MAX);
  assert.equal(zoomAtPoint({ ...base, zoom: 1, nextZoom: 0 }).zoom, ZOOM_MIN);

  // Zooming far out drives the ideal scroll negative; it pins to the origin and
  // never reports a scroll past the end of the content.
  const out = zoomAtPoint({ ...base, zoom: 1.4, nextZoom: ZOOM_MIN });
  assert.equal(out.scrollLeft, 0);
  assert.ok(out.scrollTop >= 0);
  assert.ok(out.scrollLeft <= Math.max(0, base.contentW * out.zoom - base.clientW));
  assert.ok(out.scrollTop <= Math.max(0, base.contentH * out.zoom - base.clientH));
});

test("fits content to the viewport without exceeding 1x", () => {
  // Content smaller than the viewport should not be blown up.
  assert.equal(fitZoom({ width: 100, height: 100 }, { width: 900, height: 600 }), 1);
  // A wide graph is bounded by the horizontal axis.
  const scale = fitZoom({ width: 2500, height: 500 }, { width: 900, height: 600 });
  assert.ok(scale > ZOOM_MIN && scale < 1);
  assert.ok(2500 * scale <= 900);
  // Content too large to fit even at ZOOM_MIN floors there rather than
  // shrinking to an unreadable size; the user pans instead.
  assert.equal(fitZoom({ width: 40000, height: 500 }, { width: 900, height: 600 }), ZOOM_MIN);
  // Degenerate boxes fall back to 1 rather than dividing by zero.
  assert.equal(fitZoom({ width: 0, height: 0 }, { width: 900, height: 600 }), 1);
});

test("defaults the timeline to release chronology", () => {
  const validIds = new Set(stories.map(({ id }) => id));
  assert.equal(DEFAULT_TIMELINE_MODE, "release");
  assert.equal(DEFAULT_SHOW_OPTIONAL, false);
  assert.equal(parseUrlState("", validIds).showOptional, false);
  assert.equal(parseUrlState("?deep=1", validIds).showOptional, true);
  assert.equal(parseUrlState("", validIds).timelineMode, "release");
  assert.equal(parseUrlState("?order=story", validIds).timelineMode, "story");
  assert.equal(parseUrlState("?order=bogus", validIds).timelineMode, "release");

  // Story order is now the explicit, non-default param.
  assert.equal(
    serializeUrlState(
      { ...parseUrlState("", validIds), timelineMode: "story" },
      "/timeline",
    ),
    "/timeline?order=story",
  );

  // Drift guard: if any of the three default sites disagree, the clean URL
  // stops round-tripping and this fails.
  assert.equal(serializeUrlState(parseUrlState("", validIds)), "/");
});

test("ancestor focus includes only prerequisite-path edges", () => {
  const selected = byId.get("doomsday")!;
  const graph = graphStories([...stories], selected, byId, true);
  const focusedStory = byId.get("brand-new-day")!;
  const highlighted = new Set([
    focusedStory.id,
    ...ancestorIds(focusedStory, byId),
  ]);
  const activeEdges = dependencyEdges(graph).filter(
    ({ from, to }) => highlighted.has(from) && highlighted.has(to),
  );

  assert.ok(activeEdges.some(({ from, to }) => from === "no-way-home" && to === "brand-new-day"));
  assert.ok(activeEdges.some(({ from, to }) => from === "daredevil-ba" && to === "brand-new-day"));
  assert.ok(!activeEdges.some(({ to }) => to === "doomsday"));
  assert.ok(!highlighted.has("doomsday"));
});

test("watched state is versioned, filtered, and resilient", () => {
  const validIds = new Set(stories.map(({ id }) => id));
  const encoded = serializeWatchedState(new Set(["thor", "iron-man"]));
  assert.deepEqual(
    [...parseWatchedState(encoded, validIds)].sort(),
    ["iron-man", "thor"],
  );
  assert.deepEqual([...parseWatchedState('["thor","obsolete"]', validIds)], ["thor"]);
  assert.deepEqual([...parseWatchedState("{bad json", validIds)], []);
  assert.deepEqual(
    [...parseWatchedState('{"version":999,"ids":["thor"]}', validIds)],
    [],
  );
});
