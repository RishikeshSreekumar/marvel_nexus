import assert from "node:assert/strict";
import test from "node:test";
import {
  appearancesInOrder,
  characterById,
  characters,
  charactersInStory,
  debutOf,
  mantleChains,
  portraitOf,
  relations,
  relationsOf,
  teams,
  validateCharacters,
  type Character,
} from "../src/lib/characters.ts";
import portraits from "../src/lib/portraits.json";
import { nextPremiere, watchPlan } from "../src/lib/graph.ts";
import { stories } from "../src/lib/stories.ts";

const byId = new Map(stories.map((story) => [story.id, story]));
const storyIds = new Set(byId.keys());

test("character data references only known stories, teams and characters", () => {
  assert.doesNotThrow(() => validateCharacters(characters, storyIds, relations));
});

test("every team has at least one character", () => {
  for (const team of teams) {
    assert.ok(
      characters.some((character) => character.team === team.id),
      `${team.id} is an empty branch`,
    );
  }
});

test("validateCharacters rejects bad references and mantle cycles", () => {
  const base: Character = {
    id: "a", name: "A", actor: "X", team: "avengers", appearances: ["iron-man"], note: "",
  };
  assert.throws(() => validateCharacters([base, base], storyIds, []), /Duplicate/);
  assert.throws(
    () => validateCharacters([{ ...base, appearances: ["nope"] }], storyIds, []),
    /missing story/,
  );
  assert.throws(
    () => validateCharacters([{ ...base, mantles: [{ title: "T", from: "ghost" }] }], storyIds, []),
    /missing ghost/,
  );
  const loop = [
    { ...base, id: "a", mantles: [{ title: "T", from: "b" }] },
    { ...base, id: "b", mantles: [{ title: "T", from: "a" }] },
  ];
  assert.throws(() => validateCharacters(loop, storyIds, []), /cycle/);
  assert.throws(
    () => validateCharacters([base], storyIds, [{ a: "a", b: "zz", label: "x" }]),
    /missing character/,
  );
});

test("mantle chains run oldest holder first and merge a title passed twice", () => {
  const chains = mantleChains();
  const cap = chains.find((chain) => chain.title === "Captain America");
  assert.deepEqual(cap?.holders, ["steve-rogers", "sam-wilson"]);
  const falcon = chains.find((chain) => chain.title === "Falcon");
  assert.deepEqual(falcon?.holders, ["sam-wilson", "joaquin-torres"]);
  const panther = chains.find((chain) => chain.title === "Black Panther");
  assert.deepEqual(panther?.holders, ["tchaka", "tchalla", "shuri"]);
  // Each chain appears once.
  assert.equal(new Set(chains.map((chain) => chain.title)).size, chains.length);
});

test("appearances sort by story chronology and debut by release order", () => {
  const steve = characterById.get("steve-rogers")!;
  const ordered = appearancesInOrder(steve, byId).map(({ id }) => id);
  assert.equal(ordered[0], "first-avenger");
  assert.ok(ordered.indexOf("endgame") < ordered.indexOf("doomsday"));
  const carol = characterById.get("carol-danvers")!;
  // Story order puts Captain Marvel (1995) first; release order agrees here.
  assert.equal(debutOf(carol, byId)?.id, "captain-marvel");
  const logan = characterById.get("logan")!;
  assert.equal(debutOf(logan, byId)?.id, "x-men");
});

test("charactersInStory lists the Doomsday roster with Doom in it", () => {
  const cast = charactersInStory("doomsday").map(({ id }) => id);
  assert.ok(cast.includes("victor-von-doom"));
  assert.ok(cast.includes("thor"));
  // The flag and the appearance agree in both directions.
  for (const character of characters) {
    assert.equal(
      !!character.doomsday,
      character.appearances.includes("doomsday"),
      `${character.id}: doomsday flag and appearance disagree`,
    );
  }
});

test("portraits only exist for known characters and are Wikimedia images", () => {
  for (const [id, url] of Object.entries(portraits)) {
    assert.ok(characterById.has(id), `portraits.json has unknown character ${id}`);
    assert.match(url, /^https:\/\/(upload|thumb)\.wikimedia\.org\//, `${id} portrait is not on Wikimedia`);
  }
  for (const character of characters) {
    if (portraitOf(character)) assert.ok(character.wiki, `${character.id} has a portrait but no wiki source`);
  }
});

test("every story in the bible's core cast has someone in it", () => {
  for (const id of ["iron-man", "first-class", "raimi-1", "xmen97", "fantastic-four", "doomsday"]) {
    assert.ok(charactersInStory(id).length > 3, `${id} has almost no cast`);
  }
});

test("relationsOf is symmetric", () => {
  assert.ok(relationsOf("thor").some(({ id }) => id === "loki"));
  assert.ok(relationsOf("loki").some(({ id }) => id === "thor"));
});

test("nextPremiere rolls forward and disappears when nothing is announced", () => {
  const before = nextPremiere(stories, new Date("2026-10-11T12:00:00Z"));
  assert.equal(before?.story.id, "doomsday");
  assert.equal(before?.days, 68);
  const day = nextPremiere(stories, new Date("2026-12-18T23:00:00Z"));
  assert.equal(day?.story.id, "doomsday");
  assert.equal(day?.days, 0);
  const after = nextPremiere(stories, new Date("2026-12-19T00:00:00Z"));
  assert.equal(after?.story.id, "secret-wars");
  assert.equal(nextPremiere(stories, new Date("2030-01-01T00:00:00Z")), null);
});

test("watchPlan returns the destination's closure in timeline order", () => {
  const plan = watchPlan("doomsday", byId, { showOptional: false, mode: "release" });
  const ids = plan.map(({ id }) => id);
  assert.ok(!ids.includes("doomsday"));
  assert.ok(ids.includes("thunderbolts"));
  assert.ok(plan.every((story) => !story.optional));
  for (let i = 1; i < plan.length; i += 1) {
    assert.ok(plan[i - 1].releaseOrder < plan[i].releaseOrder);
  }
  assert.deepEqual(watchPlan("nope", byId, { showOptional: false, mode: "story" }), []);
});
