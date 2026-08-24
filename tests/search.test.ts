import assert from "node:assert/strict";
import test from "node:test";
import {
  acronymCandidates,
  acronymOf,
  defaultDestinations,
  editDistance,
  fuzzyMatch,
  normalize,
  searchStories,
} from "../src/lib/search.ts";
import { stories } from "../src/lib/stories.ts";

const all = [...stories];
const ids = (query: string, limit?: number) =>
  searchStories(all, query, { limit }).map((hit) => hit.story.id);
const first = (query: string) => ids(query)[0];

test("normalize folds case, diacritics, punctuation and apostrophes", () => {
  assert.equal(normalize("Pokémon"), "pokemon");
  assert.equal(normalize("Guardians of the Galaxy Vol. 2"), "guardians of the galaxy vol 2");
  assert.equal(normalize("Spider-Man"), "spider man");
  // Both apostrophe forms elide, so "hells" and "Hell's" compare equal.
  assert.equal(normalize("Hell’s Kitchen"), "hells kitchen");
  assert.equal(normalize("Hell's Kitchen"), "hells kitchen");
  assert.equal(normalize("T’Challa"), "tchalla");
  assert.equal(normalize("   "), "");
});

test("acronyms keep stop words, because the abbreviations people type do", () => {
  assert.equal(acronymOf("Guardians of the Galaxy"), "gotg");
  assert.equal(acronymOf("Spider-Man: No Way Home"), "smnwh");
  // Both the full form and the stop-word-free form are offered.
  const candidates = acronymCandidates("Guardians of the Galaxy Vol. 2");
  assert.ok(candidates.includes("gotgv2"));
  assert.ok(candidates.includes("ggv2"));
  // Colon segments too, which is how a subtitle acronym is reachable.
  assert.ok(acronymCandidates("Spider-Man: No Way Home").includes("nwh"));
});

test("acronym queries land on the right title", () => {
  assert.equal(first("gotg"), "guardians");
  assert.equal(first("nwh"), "no-way-home");
  assert.equal(first("gotgv2"), "guardians-2");
});

test("apostrophes in notes are reachable from an ASCII keyboard", () => {
  // The dataset writes these with U+2019, which no keyboard produces.
  assert.ok(ids("tchalla").includes("black-panther"));
  assert.ok(ids("hells kitchen").includes("daredevil-1"));
});

test("typo tolerance is bounded by query length", () => {
  assert.equal(first("avengrs"), "avengers");
  assert.ok(ids("guardins").includes("guardians"));
  // Three characters must stay exact, or short queries match everything.
  assert.equal(fuzzyMatch("Avengers", "avn"), false);
  assert.deepEqual(ids("avn"), []);
  assert.equal(editDistance("kitten", "sitting", 3), 3);
  assert.equal(editDistance("kitten", "sitting", 1), 2); // bailed out early
});

test("fields beyond the title are searchable", () => {
  // An exact branch name outranks the same word appearing in a blurb.
  const multiverse = searchStories(all, "multiverse");
  assert.equal(multiverse[0].story.lane, "Multiverse");
  assert.ok(ids("special").every((id) => id.length > 0));
  assert.ok(searchStories(all, "special").some((hit) => hit.story.kind === "Special"));
  // A four-digit query matches release years.
  assert.ok(ids("2019").includes("endgame"));
});

test("the kind filter composes with the query", () => {
  const hits = searchStories(all, "man", { kind: "Series" });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.story.kind === "Series"));
});

test("ranking is deterministic and respects the limit", () => {
  assert.deepEqual(ids("the"), ids("the"));
  assert.equal(ids("a", 5).length, 5);
  assert.equal(searchStories(all, "", { limit: 5 }).length, 5);
});

test("match ranges index the original title, not the normalized one", () => {
  const hit = searchStories(all, "way")[0];
  assert.equal(hit.story.id, "no-way-home");
  const [range] = hit.ranges;
  assert.equal(hit.story.title.slice(range.start, range.end), "Way");

  // A curly apostrophe before the match shifts the normalized index but must
  // not shift the reported one — this is the off-by-one that mapping guards.
  const holiday = searchStories(all, "holiday")[0];
  const [holidayRange] = holiday.ranges;
  assert.equal(
    holiday.story.title.slice(holidayRange.start, holidayRange.end),
    "Holiday",
  );
});

test("the empty-query list opens on hubs, not on dataset order", () => {
  const opening = defaultDestinations(all, [], 6).map(({ id }) => id);
  assert.ok(opening.includes("endgame"));
  assert.ok(opening.includes("avengers"));
  // The old behaviour was the first N of the dataset.
  assert.ok(!opening.includes("eyes"));
  assert.equal(new Set(opening).size, opening.length);
});

test("recent destinations lead the empty-query list", () => {
  const opening = defaultDestinations(all, ["loki-1"], 4).map(({ id }) => id);
  assert.equal(opening[0], "loki-1");
  assert.equal(new Set(opening).size, opening.length);
  // Unknown recents are skipped rather than producing a hole.
  assert.equal(defaultDestinations(all, ["not-a-story"], 3).length, 3);
});
