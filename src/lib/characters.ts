import type { Story } from "./graph";
import antagonists from "./cast/antagonists";
import asgard from "./cast/asgard";
import avengers from "./cast/avengers";
import brotherhood from "./cast/brotherhood";
import cosmic from "./cast/cosmic";
import deadpool from "./cast/deadpool";
import fantasticFour from "./cast/fantastic-four";
import guardians from "./cast/guardians";
import multiverse from "./cast/multiverse";
import mystic from "./cast/mystic";
import newAvengers from "./cast/new-avengers";
import castRelations from "./cast/relations";
import shield from "./cast/shield";
import spiderRogues from "./cast/spider-rogues";
import spiderVerse from "./cast/spider-verse";
import street from "./cast/street";
import underworld from "./cast/underworld";
import wakanda from "./cast/wakanda";
import xMen from "./cast/x-men";
import xMen97 from "./cast/x-men-97";
import youngAvengers from "./cast/young-avengers";
import portraits from "./portraits.json";

/**
 * The character bible: who appears where, which team they belong to, and which
 * mantles have passed between them.
 *
 * The roster lives in src/lib/cast/, one file per team, so a team can be
 * edited without scrolling past four hundred other people. Appearances
 * reference story ids from stories.ts and are validated in
 * tests/characters.test.ts, so a renamed story fails the build rather than
 * leaving a dead chip on the page. Only on-screen appearances are listed;
 * What If…? and Marvel Zombies count only for characters who exist nowhere
 * else.
 */

export type TeamId =
  | "avengers"
  | "new-avengers"
  | "young-avengers"
  | "fantastic-four"
  | "wakanda"
  | "asgard"
  | "guardians"
  | "cosmic"
  | "mystic"
  | "street"
  | "spider-verse"
  | "x-men"
  | "x-men-97"
  | "deadpool"
  | "multiverse"
  | "shield"
  | "antagonists"
  | "underworld"
  | "spider-rogues"
  | "brotherhood";

export type Team = {
  id: TeamId;
  name: string;
  /** One line for the branch head. */
  blurb: string;
  /** CSS colour token suffix, reusing the saga lane palette. */
  tone: "infinity" | "multiverse" | "street" | "legacy" | "future";
};

/** A character as written in a cast file; the team comes from the file. */
export type CastEntry = {
  id: string;
  name: string;
  /** Codename or title, when they carry one. */
  alias?: string;
  /** The primary screen portrayal; recasts are mentioned in the note. */
  actor: string;
  /** Story ids, in any order — helpers sort them by story chronology. */
  appearances: string[];
  note: string;
  /** Officially confirmed in the cast of the featured event (Avengers: Doomsday). */
  doomsday?: boolean;
  /** Titles inherited from another character, e.g. Captain America from Steve. */
  mantles?: { title: string; from: string }[];
  /**
   * English Wikipedia article the portrait comes from: the character's screen
   * article where one exists, otherwise the actor's. `npm run portraits`
   * resolves these into portraits.json.
   */
  wiki?: string;
};

export type Character = CastEntry & { team: TeamId };

export type Relation = { a: string; b: string; label: string };

export const teams: readonly Team[] = [
  { id: "avengers", name: "Avengers", blurb: "Earth’s Mightiest Heroes, their families and recruits", tone: "infinity" },
  { id: "new-avengers", name: "New Avengers", blurb: "Thunderbolts*, Red Room operatives and allies", tone: "street" },
  { id: "young-avengers", name: "Young Avengers", blurb: "The next generation and their families", tone: "future" },
  { id: "fantastic-four", name: "Fantastic Four", blurb: "Marvel’s First Family and the Earth-828 cosmos", tone: "future" },
  { id: "wakanda", name: "Wakanda & Talokan", blurb: "The Black Panther legacy and the kingdom beneath", tone: "legacy" },
  { id: "asgard", name: "Asgard & the Nine Realms", blurb: "Thor’s kin, allies and the realms’ foes", tone: "infinity" },
  { id: "guardians", name: "Guardians of the Galaxy", blurb: "Saviours of the galaxy, plus the Ravagers", tone: "infinity" },
  { id: "cosmic", name: "Cosmic", blurb: "Captain Marvel, the Kree, the Skrulls and the Eternals", tone: "future" },
  { id: "mystic", name: "Mystic Arts & Midnight", blurb: "Sorcerers, witches, the Ten Rings and things that bite", tone: "multiverse" },
  { id: "street", name: "Defenders & Street Level", blurb: "Hell’s Kitchen, Harlem and the heroes of the block", tone: "street" },
  { id: "spider-verse", name: "Spider-Verse", blurb: "Every Spider-Man and the people who keep them human", tone: "multiverse" },
  { id: "x-men", name: "X-Men", blurb: "Fox’s mutants, from Xavier’s school to Logan", tone: "legacy" },
  { id: "x-men-97", name: "X-Men ’97", blurb: "The animated X-Men, their legacy and their foes", tone: "future" },
  { id: "deadpool", name: "Deadpool & X-Force", blurb: "The Merc with a Mouth, his found family and the Void", tone: "multiverse" },
  { id: "multiverse", name: "TVA & the Multiverse", blurb: "Time-keepers, variants and watchers of what-if", tone: "multiverse" },
  { id: "shield", name: "S.H.I.E.L.D. & Government", blurb: "Spies, the SSR, Damage Control and Washington", tone: "legacy" },
  { id: "antagonists", name: "Antagonists", blurb: "Conquerors, Hydra and the threats the Avengers face", tone: "infinity" },
  { id: "underworld", name: "Kingpin’s Underworld", blurb: "Kingpin, the Hand and New York’s criminal empires", tone: "street" },
  { id: "spider-rogues", name: "Spider Rogues", blurb: "Goblins, symbiotes and Spider-Man’s sinister foes", tone: "street" },
  { id: "brotherhood", name: "Brotherhood & Weapon X", blurb: "Fox-era mutant foes, the Hellfire Club and Weapon X", tone: "legacy" },
];

const rosters: Record<TeamId, readonly CastEntry[]> = {
  avengers,
  "new-avengers": newAvengers,
  "young-avengers": youngAvengers,
  "fantastic-four": fantasticFour,
  wakanda,
  asgard,
  guardians,
  cosmic,
  mystic,
  street,
  "spider-verse": spiderVerse,
  "x-men": xMen,
  "x-men-97": xMen97,
  deadpool,
  multiverse,
  shield,
  antagonists,
  underworld,
  "spider-rogues": spiderRogues,
  brotherhood,
};

/** Every character, in tree order: team by team, most important first. */
export const characters: readonly Character[] = teams.flatMap(({ id }) =>
  rosters[id].map((entry) => ({ ...entry, team: id })),
);

export const relations: readonly Relation[] = castRelations;

const portraitUrls: Record<string, string | undefined> = portraits;

/** The resolved portrait image for a character, or null to show initials. */
export function portraitOf(character: Character): string | null {
  return portraitUrls[character.id] ?? null;
}

export const characterById = new Map(characters.map((character) => [character.id, character]));

/** Appearances sorted by story chronology; unknown ids are dropped. */
export function appearancesInOrder(
  character: Character,
  byId: Map<string, Story>,
): Story[] {
  return character.appearances
    .map((id) => byId.get(id))
    .filter((story): story is Story => !!story)
    .sort((a, b) => a.storyOrder - b.storyOrder);
}

/** First on-screen appearance by release order — the "debut". */
export function debutOf(character: Character, byId: Map<string, Story>): Story | null {
  let best: Story | null = null;
  for (const id of character.appearances) {
    const story = byId.get(id);
    if (story && (!best || story.releaseOrder < best.releaseOrder)) best = story;
  }
  return best;
}

/**
 * Characters who appear in a story, most prominent first: by how many titles
 * they appear in across the bible, then in tree order. A rough measure, but it
 * reliably puts the leads ahead of the one-scene roles.
 */
export function charactersInStory(storyId: string): Character[] {
  const rank = new Map(characters.map((character, index) => [character.id, index]));
  return characters
    .filter((character) => character.appearances.includes(storyId))
    .sort(
      (a, b) =>
        b.appearances.length - a.appearances.length ||
        (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
    );
}

export type MantleChain = { title: string; holders: string[] };

/**
 * Every mantle as an ordered chain of holders, oldest first.
 *
 * Built by walking `from` links backwards from each heir and then grouping by
 * title, so a title passed twice (Captain America: Steve → Sam) comes out as
 * one chain, and a character who passes one title and inherits another (Sam)
 * appears in both.
 */
export function mantleChains(list: readonly Character[] = characters): MantleChain[] {
  const byTitle = new Map<string, Map<string, string>>();
  for (const character of list) {
    for (const mantle of character.mantles ?? []) {
      if (!byTitle.has(mantle.title)) byTitle.set(mantle.title, new Map());
      byTitle.get(mantle.title)!.set(character.id, mantle.from);
    }
  }
  const chains: MantleChain[] = [];
  for (const [title, heirs] of byTitle) {
    const predecessors = new Set(heirs.values());
    // The newest holder of each line is an heir nobody inherited from.
    for (const leaf of heirs.keys()) {
      if (predecessors.has(leaf)) continue;
      const holders = [leaf];
      let at = heirs.get(leaf);
      while (at && !holders.includes(at)) {
        holders.unshift(at);
        at = heirs.get(at);
      }
      chains.push({ title, holders });
    }
  }
  return chains.sort((a, b) => b.holders.length - a.holders.length || a.title.localeCompare(b.title));
}

export function relationsOf(id: string): { id: string; label: string }[] {
  return relations
    .filter((relation) => relation.a === id || relation.b === id)
    .map((relation) => ({
      id: relation.a === id ? relation.b : relation.a,
      label: relation.label,
    }));
}

/**
 * Data invariants: unique ids, known teams, known story and character
 * references, and no mantle that loops back on itself.
 */
export function validateCharacters(
  list: readonly Character[],
  storyIds: ReadonlySet<string>,
  relationList: readonly Relation[] = relations,
): void {
  const ids = new Set<string>();
  const teamIds = new Set(teams.map(({ id }) => id));
  for (const character of list) {
    if (ids.has(character.id)) throw new Error(`Duplicate character id: ${character.id}`);
    ids.add(character.id);
    if (!teamIds.has(character.team)) {
      throw new Error(`Character ${character.id} has unknown team ${character.team}.`);
    }
    if (character.appearances.length === 0) {
      throw new Error(`Character ${character.id} needs at least one appearance.`);
    }
    if (new Set(character.appearances).size !== character.appearances.length) {
      throw new Error(`Character ${character.id} lists an appearance twice.`);
    }
    for (const story of character.appearances) {
      if (!storyIds.has(story)) {
        throw new Error(`Character ${character.id} references missing story ${story}.`);
      }
    }
  }
  const byId = new Map(list.map((character) => [character.id, character]));
  for (const character of list) {
    for (const mantle of character.mantles ?? []) {
      if (mantle.from === character.id) {
        throw new Error(`Character ${character.id} cannot inherit from themselves.`);
      }
      if (!ids.has(mantle.from)) {
        throw new Error(`Character ${character.id} inherits from missing ${mantle.from}.`);
      }
      // Walk the same title back; revisiting the start is a cycle.
      const seen = new Set([character.id]);
      let at: string | undefined = mantle.from;
      while (at) {
        if (seen.has(at)) throw new Error(`Mantle cycle for ${mantle.title} at ${at}.`);
        seen.add(at);
        at = byId.get(at)?.mantles?.find((m) => m.title === mantle.title)?.from;
      }
    }
  }
  for (const relation of relationList) {
    if (!ids.has(relation.a) || !ids.has(relation.b)) {
      throw new Error(`Relation ${relation.a} ↔ ${relation.b} references a missing character.`);
    }
    if (relation.a === relation.b) {
      throw new Error(`Relation on ${relation.a} links a character to themselves.`);
    }
  }
}
