import assert from "node:assert/strict";
import test from "node:test";
import {
  ancestorIds,
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
} from "../src/lib/graph.ts";
import {
  chronology,
  legacy,
  stories,
} from "../src/components/MarvelNexus.tsx";

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
  const parsed = parseUrlState(
    "?to=iron-man&view=timeline&order=release&kind=Movie&deep=0",
    validIds,
  );
  assert.deepEqual(parsed, {
    destinationId: "iron-man",
    view: "timeline",
    timelineMode: "release",
    kind: "Movie",
    showOptional: false,
  });
  assert.equal(serializeUrlState(parsed), "?to=iron-man&view=timeline&order=release&kind=Movie&deep=0");
  assert.equal(
    serializeUrlState({ ...parsed, view: "graph" }, "/graph"),
    "/graph?to=iron-man&order=release&kind=Movie&deep=0",
  );
  assert.equal(
    serializeUrlState({ ...parsed, destinationId: "doomsday" }, "/timeline"),
    "/timeline?order=release&kind=Movie&deep=0",
  );
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
