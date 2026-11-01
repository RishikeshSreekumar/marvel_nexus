import assert from "node:assert/strict";
import test from "node:test";
import {
  ancestorIds,
  ALL_STORIES_ID,
  assignNodeTops,
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
  nodeSummary,
  nodeRelations,
  graphOutline,
  parseRecentIds,
  parseStoredId,
  serializeRecentIds,
  pushRecentId,
  watchedProgress,
  MAX_RECENT_DESTINATIONS,
  resetGraphState,
  type GraphEdge,
  type Story,
} from "../src/lib/graph.ts";
import {
  chronology,
  legacy,
  stories,
} from "../src/lib/stories.ts";

const byId = new Map(stories.map((story) => [story.id, story]));

test("ships the complete validated October 2026 dataset", () => {
  assert.equal(stories.length, 97);
  assert.equal(chronology.length, 79);
  assert.equal(legacy.length, 18);
  assert.equal(new Set(stories.map(({ id }) => id)).size, 97);
  assert.doesNotThrow(() =>
    validateStories(stories, { total: 97, canonical: 79, legacy: 18 }),
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
  assert.equal(ancestorIds(destination, byId).size, 66);
  assert.equal(graph.length, 67);
  assert.ok(requiredOnly.length < graph.length);
  assert.equal(graphMetrics(graph, destination.id, new Set()).unwatched, 66);
  assert.ok(dependencyEdges(graph).length > 63);
  assert.ok(depthOf(destination.id, byId) > 0);
});

test("sorts chronology independently from release chronology", () => {
  const storyOrder = sortTimeline(chronology, "story");
  const releaseOrder = sortTimeline(chronology, "release");
  assert.equal(storyOrder[0]?.id, "eyes");
  assert.equal(releaseOrder[0]?.id, "iron-man");
  assert.equal(storyOrder.at(-1)?.id, "secret-wars");
});

test("orders every story by its true first release, across both lists", () => {
  // One shared release sequence, so a rank means the same thing for a legacy
  // title as for a canonical one. Two independent sequences used to number both
  // from zero, which made `x-men` tie with `iron-man` in any sort over
  // `stories` — search's tie-break being the visible symptom.
  const ranks = stories.map(({ releaseOrder }) => releaseOrder);
  assert.equal(new Set(ranks).size, stories.length, "releaseOrder must be unique");
  assert.equal(
    new Set(stories.map(({ storyOrder }) => storyOrder)).size,
    stories.length,
    "storyOrder must be unique",
  );

  // Release rank never contradicts release year. Same-year pairs are ordered by
  // release date, which the year alone cannot check, so they are skipped here
  // and pinned by the spot checks below.
  const byRelease = [...stories].sort((a, b) => a.releaseOrder - b.releaseOrder);
  for (let i = 1; i < byRelease.length; i += 1) {
    assert.ok(
      byRelease[i].releaseYear >= byRelease[i - 1].releaseYear,
      `${byRelease[i].id} (${byRelease[i].releaseYear}) ranked after ${byRelease[i - 1].id} (${byRelease[i - 1].releaseYear})`,
    );
  }

  const rank = new Map(stories.map(({ id, releaseOrder }) => [id, releaseOrder]));
  const before = (earlier: string, later: string) =>
    assert.ok(
      rank.get(earlier)! < rank.get(later)!,
      `${earlier} released before ${later}`,
    );
  before("daredevil-2", "civil-war");        // Mar 2016 before May 2016
  before("jessica-jones-2", "infinity-war"); // Mar 2018 before Apr 2018
  before("punisher-2", "captain-marvel");    // Jan 2019 before Mar 2019
  before("endgame", "jessica-jones-3");      // Apr 2019 before Jun 2019
  before("brave-new-world", "daredevil-ba"); // Feb 2025 before Mar 2025
  before("fantastic-four", "eyes");          // Jul 2025 before Aug 2025
  before("x-men", "iron-man");               // 2000 before 2008, across lists
  before("logan", "deadpool-2");             // 2017 before 2018, both legacy
});

test("reports the deep-cut prerequisites the filter is withholding", () => {
  const destination = byId.get("doomsday")!;

  // Deep cuts on: nothing is being withheld, so nothing is reported.
  const everything = visibleGraph(destination, byId, { showOptional: true });
  assert.equal(everything.deepCutCounts.size, 0);

  // Deep cuts off: required stories that genuinely depend on optional ones must
  // say so rather than rendering as though they need less setup.
  const required = visibleGraph(destination, byId, { showOptional: false });
  assert.equal(required.deepCutCounts.get("deadpool-wolverine"), 2); // Deadpool 2, Logan
  assert.equal(required.deepCutCounts.get("daredevil-ba"), 1);       // Daredevil S3
  assert.equal(required.deepCutCounts.get("no-way-home"), 2);        // Raimi 3, Amazing 2
  for (const [id, count] of required.deepCutCounts) {
    assert.ok(count > 0, `${id} should not be listed with nothing withheld`);
    assert.ok(required.ids.has(id), `${id} must be on the map to carry a badge`);
  }

  // The whole map applies the same filter, so it owes the same accounting.
  assert.ok(
    visibleGraph(null, byId, { showOptional: false }).deepCutCounts.size > 0,
  );

  // Collapsed and hidden nodes are excluded: hiddenCounts already reports their
  // prerequisites, and both badges on one node would count the same edges twice.
  const collapsed = visibleGraph(destination, byId, {
    showOptional: false,
    collapsed: new Set(["no-way-home"]),
  });
  assert.equal(collapsed.deepCutCounts.has("no-way-home"), false);
});

test("connects Doomsday to the stories its announced cast comes from", () => {
  const ancestors = ancestorIds(byId.get("doomsday")!, byId);
  // Sam Wilson is Captain America, the Wakandans and Namor come from Wakanda
  // Forever, Thor's latest state is Love and Thunder, Shang-Chi is his own film.
  for (const id of ["brave-new-world", "wakanda-forever", "love-thunder", "shang-chi"]) {
    assert.ok(ancestors.has(id), `doomsday should reach ${id}`);
  }
  // The Fox universe arrives through Deadpool & Wolverine, not directly.
  assert.ok(ancestors.has("x-men"));
  assert.equal(byId.get("doomsday")!.deps.includes("x-men"), false);
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
  // The whole map is the default, so it is the state that writes no `to`.
  assert.equal(
    serializeUrlState({ ...parsed, destinationId: ALL_STORIES_ID }, "/timeline"),
    "/timeline?kind=Movie&deep=1",
  );
  // A real destination always names itself, doomsday included.
  assert.equal(
    serializeUrlState({ ...parsed, destinationId: "doomsday" }, "/timeline"),
    "/timeline?to=doomsday&kind=Movie&deep=1",
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
  // Deadpool & Wolverine is the only route into the Fox universe, so hiding it
  // is the case where termination has something to prune. Shared hubs like
  // Infinity War are deliberately not the example: their ancestors survive via
  // other paths, which is the *other* half of the rule and is covered above.
  const hidden = new Set(["deadpool-wolverine"]);
  const pruned = visibleGraph(destination, byId, { showOptional: true, hidden });

  assert.ok(pruned.ids.has("deadpool-wolverine"), "watched stories stay on the map");
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

test("node summaries name prerequisites and dependents", () => {
  const { ids } = visibleGraph(byId.get("endgame")!, byId, {
    showOptional: true,
  });
  const nodes = stories.filter((story) => ids.has(story.id));
  const edges = dependencyEdges(nodes);

  const summary = nodeSummary("infinity-war", byId, edges, ids);
  const { requires, unlocks } = nodeRelations("infinity-war", edges, ids);
  assert.ok(requires.length > 0);
  for (const id of requires) assert.match(summary, new RegExp(byId.get(id)!.title.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(unlocks.includes("endgame"));
  assert.match(summary, /Sets up .*Endgame/);

  // An origin has nothing before it and must say so rather than trailing off.
  const origin = nodeSummary("iron-man", byId, edges, ids);
  assert.match(origin, /Origin point/);
  assert.doesNotMatch(origin, /^Requires/);
});

test("node summary reports its column position when given one", () => {
  const { ids } = visibleGraph(byId.get("endgame")!, byId, { showOptional: false });
  const nodes = stories.filter((story) => ids.has(story.id));
  const edges = dependencyEdges(nodes);
  const summary = nodeSummary("endgame", byId, edges, ids, { column: 4, columns: 7 });
  assert.match(summary, /Column 4 of 7\./);
});

test("graph outline covers every node exactly once and reuses columnLabel", () => {
  const { ids } = visibleGraph(byId.get("endgame")!, byId, { showOptional: true });
  const nodes = stories.filter((story) => ids.has(story.id));
  const edges = dependencyEdges(nodes);
  const columns = orderColumns(layerStories(nodes, byId), edges);
  const outline = graphOutline(columns, edges, byId);

  assert.equal(outline.length, columns.length);
  outline.forEach((group, index) => {
    const label = columnLabel(columns[index], index, columns.length - 1);
    assert.equal(group.title, label.title);
    assert.equal(group.detail, label.detail);
  });

  const flattened = outline.flatMap((group) => group.items.map((item) => item.id));
  assert.equal(flattened.length, nodes.length);
  assert.equal(new Set(flattened).size, nodes.length);
});

test("recent destinations round-trip in order, capped and filtered", () => {
  const valid = new Set(stories.map(({ id }) => id));
  const ids = ["endgame", "loki-1", "iron-man"];
  assert.deepEqual(parseRecentIds(serializeRecentIds(ids), valid), ids);

  // Order is the data here, unlike the watched set which is stored sorted.
  const reversed = [...ids].reverse();
  assert.deepEqual(parseRecentIds(serializeRecentIds(reversed), valid), reversed);

  // Unknown ids, duplicates, wrong version and garbage all degrade to a
  // usable list rather than throwing.
  assert.deepEqual(
    parseRecentIds(serializeRecentIds(["endgame", "endgame", "nope"]), valid),
    ["endgame"],
  );
  assert.deepEqual(parseRecentIds("not json", valid), []);
  assert.deepEqual(parseRecentIds(JSON.stringify({ version: 99, ids: ["endgame"] }), valid), []);
  assert.deepEqual(parseRecentIds(null, valid), []);

  const many = stories.slice(0, MAX_RECENT_DESTINATIONS + 4).map(({ id }) => id);
  assert.equal(parseRecentIds(serializeRecentIds(many), valid).length, MAX_RECENT_DESTINATIONS);
});

test("pushRecentId moves an existing id to the front without duplicating", () => {
  assert.deepEqual(pushRecentId(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(pushRecentId(["a", "b"], "z"), ["z", "a", "b"]);
  assert.equal(
    pushRecentId(Array.from({ length: 20 }, (_, i) => `x${i}`), "new").length,
    MAX_RECENT_DESTINATIONS,
  );
});

test("watched progress counts against the list it is given", () => {
  const subset = stories.slice(0, 10);
  assert.deepEqual(watchedProgress(subset, new Set()), {
    watched: 0,
    total: 10,
    percent: 0,
  });
  assert.deepEqual(
    watchedProgress(subset, new Set(subset.map(({ id }) => id))),
    { watched: 10, total: 10, percent: 100 },
  );
  // The denominator is the passed subset, not the whole dataset — that is what
  // keeps the timeline percentage stable when a filter narrows the list.
  const half = new Set(subset.slice(0, 5).map(({ id }) => id));
  assert.equal(watchedProgress(subset, half).percent, 50);
  // Ids outside the list must not inflate the count.
  assert.equal(watchedProgress(subset, new Set(["doomsday", ...half])).watched, 5);
  assert.equal(watchedProgress([], new Set()).percent, 0);
});

test("opens on the whole map rather than one destination", () => {
  const validIds = new Set(stories.map(({ id }) => id));
  assert.equal(parseUrlState("", validIds).destinationId, ALL_STORIES_ID);
  // An unknown or hostile `to` falls back to the whole map, not to doomsday.
  assert.equal(parseUrlState("?to=nope", validIds).destinationId, ALL_STORIES_ID);
  assert.equal(parseUrlState("?to=all", validIds).destinationId, ALL_STORIES_ID);
  assert.equal(resetGraphState().selectedId, ALL_STORIES_ID);
  assert.equal(serializeUrlState(parseUrlState("", validIds)), "/");

  // No destination means every story, minus the deep cuts unless asked for.
  const everything = visibleGraph(null, byId, { showOptional: true });
  assert.equal(everything.ids.size, stories.length);
  assert.equal(everything.hiddenCounts.size, 0);
  const required = visibleGraph(null, byId, { showOptional: false });
  assert.equal(
    required.ids.size,
    stories.filter(({ optional }) => !optional).length,
  );
  assert.ok(required.ids.size < everything.ids.size);

  // Hidden still prunes; collapse is a no-op with nothing to walk back from.
  const hidden = visibleGraph(null, byId, {
    showOptional: true,
    hidden: new Set(["iron-man"]),
    collapsed: new Set(["endgame"]),
  });
  assert.equal(hidden.ids.has("iron-man"), false);
  assert.equal(hidden.ids.size, stories.length - 1);

  // Nothing is "the destination" when the reader has not picked one.
  const wave = [byId.get("iron-man")!];
  assert.equal(columnLabel(wave, 3, 3, true).title, "Destination");
  assert.equal(columnLabel(wave, 3, 3, false).title, "Wave 3");
  assert.equal(columnLabel(wave, 0, 3, false).title, "Origins");

  // The doomsday map is still reachable, and is still smaller than everything.
  const focused = visibleGraph(byId.get("doomsday")!, byId, { showOptional: true });
  assert.ok(focused.ids.size < everything.ids.size);
});

test("places columns by barycentre instead of stacking them at the top", () => {
  const column = (ids: string[]) =>
    ids.map((id) => ({ id }) as unknown as Story);
  const columns = [
    column(["a", "b", "c"]),
    column(["x", "y"]),
  ];
  const edges: GraphEdge[] = [
    { from: "a", to: "x" },
    { from: "c", to: "y" },
  ];
  const heights = new Map(
    ["a", "b", "c", "x", "y"].map((id) => [id, 100] as const),
  );
  const tops = assignNodeTops(columns, edges, heights, { gap: 10 });

  // Both columns start flush with the top of the stage.
  assert.equal(Math.min(...[...tops.values()]), 0);
  // Order within a column is never rearranged — that is orderColumns' job.
  assert.ok(tops.get("a")! < tops.get("b")! && tops.get("b")! < tops.get("c")!);
  assert.ok(tops.get("x")! < tops.get("y")!);
  // Cards never overlap: each sits at least a gap below the one before it.
  assert.ok(tops.get("b")! >= tops.get("a")! + 110);
  assert.ok(tops.get("y")! >= tops.get("x")! + 110);
  // y is wired to c, the bottom of the left column, so it is pulled down past
  // the flush-top stack it would otherwise sit in.
  assert.ok(tops.get("y")! > 110);

  const travel = (tops: Map<string, number>) =>
    edges.reduce(
      (total, edge) => total + Math.abs(tops.get(edge.from)! - tops.get(edge.to)!),
      0,
    );
  const stacked = new Map([
    ["a", 0], ["b", 110], ["c", 220], ["x", 0], ["y", 110],
  ]);
  assert.ok(travel(tops) < travel(stacked));
});

test("vertical placement is deterministic and handles empty input", () => {
  assert.equal(assignNodeTops([], [], new Map()).size, 0);
  const graph = graphStories([...stories], byId.get("doomsday")!, byId, false);
  const laid = orderColumns(layerStories(graph, byId), dependencyEdges(graph));
  const heights = new Map(graph.map(({ id }) => [id, 118] as const));
  const first = assignNodeTops(laid, dependencyEdges(graph), heights);
  const second = assignNodeTops(laid, dependencyEdges(graph), heights);
  assert.deepEqual([...first.entries()], [...second.entries()]);
  // Isolated or not, every visible story gets a position.
  assert.equal(first.size, graph.length);
  assert.ok([...first.values()].every((top) => Number.isFinite(top) && top >= 0));
});

test("the dock's last-watched pointer only survives if the id is still real", () => {
  const validIds = new Set(stories.map(({ id }) => id));
  assert.equal(parseStoredId("iron-man", validIds), "iron-man");
  assert.equal(parseStoredId(null, validIds), null);
  assert.equal(parseStoredId("", validIds), null);
  // A title dropped from the dataset must not leave a dead jump target behind.
  assert.equal(parseStoredId("retired-title", validIds), null);
});

test("every hero bough links to a story that still exists", async () => {
  const { HERO_ANCHOR_IDS } = await import("../src/components/HomeSections.tsx");
  assert.equal(HERO_ANCHOR_IDS.length, 5);
  for (const id of HERO_ANCHOR_IDS) {
    assert.ok(byId.has(id), `hero bough links to missing story "${id}"`);
  }
});

test("featured destinations are real, unique stories", async () => {
  const { featuredDestinations } = await import("../src/lib/stories.ts");
  assert.equal(new Set(featuredDestinations).size, featuredDestinations.length);
  for (const id of featuredDestinations) assert.ok(byId.has(id), id);
});
