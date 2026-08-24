import type { KindFilter, Story } from "./graph";

/**
 * Title matching for the destination palette.
 *
 * Pure on purpose: the old implementation was `title.includes(query)` inline in
 * the component, which meant "gotg" found nothing, an ASCII apostrophe never
 * matched the dataset's U+2019, and none of it could be tested.
 */

export type MatchRange = { start: number; end: number };

export type SearchHit = {
  story: Story;
  score: number;
  /** Indices into the ORIGINAL title, so callers can wrap <mark>. */
  ranges: MatchRange[];
};

export type SearchOptions = {
  kind?: KindFilter;
  limit?: number;
};

/** Words too common to carry an acronym on their own. */
const STOP_WORDS = new Set(["of", "the", "and", "a", "an", "in", "to"]);

/**
 * Fold text to a comparable form: lowercase, diacritics stripped, apostrophes
 * removed outright, every other separator collapsed to a single space.
 *
 * Apostrophes are dropped rather than normalised so that "hells kitchen" finds
 * "Hell's Kitchen" and "tchalla" finds "T'Challa" — the dataset writes both
 * with U+2019, which no keyboard produces by default.
 */
export function normalize(text: string): string {
  return normalizeWithMap(text).text;
}

type Normalized = {
  text: string;
  /** For each char of `text`, its index in the source string. */
  map: number[];
};

function normalizeWithMap(text: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const source = text[index];
    // Decompose so accents become separate combining marks, then drop them.
    const folded = source
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    for (const char of folded) {
      if (/[a-z0-9]/.test(char)) {
        out.push(char);
        map.push(index);
      } else if (char === "'" || char === "’" || char === "‘" || char === "ʼ") {
        // Elided, not spaced: "hell's" and "hells" must compare equal.
        continue;
      } else if (out.length > 0 && out[out.length - 1] !== " ") {
        out.push(" ");
        map.push(index);
      }
    }
  }
  while (out.length && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

/**
 * Initials of a title, e.g. "Guardians of the Galaxy" -> "gotg".
 *
 * Stop words are kept: the abbreviations people actually type ("gotg") include
 * them. `acronymCandidates` also emits a stripped variant for the cases where
 * they do not.
 */
export function acronymOf(title: string): string {
  return normalize(title)
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
}

/**
 * Every abbreviation a title could reasonably be typed as: the whole title,
 * the whole title without stop words, and the same two for each colon-separated
 * segment — which is how "nwh" reaches "Spider-Man: No Way Home".
 */
export function acronymCandidates(title: string): string[] {
  const segments = [title, ...title.split(":")];
  const candidates = new Set<string>();
  for (const segment of segments) {
    const words = normalize(segment).split(" ").filter(Boolean);
    if (words.length < 2) continue;
    candidates.add(words.map((word) => word[0]).join(""));
    const significant = words.filter((word) => !STOP_WORDS.has(word));
    if (significant.length >= 2) {
      candidates.add(significant.map((word) => word[0]).join(""));
    }
  }
  return [...candidates];
}

/**
 * Levenshtein distance with an early bail once `max` is exceeded. Hand-rolled
 * because a bounded edit distance over 95 short titles costs microseconds and
 * a dependency costs more than that.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/** Query budget: short queries stay exact, or everything matches everything. */
function fuzzyBudget(query: string): number {
  if (query.length >= 7) return 2;
  if (query.length >= 4) return 1;
  return 0;
}

/**
 * Closest edit distance between `query` and `text` or any single word in it,
 * or null when nothing lands inside the budget.
 */
export function fuzzyDistance(
  text: string,
  query: string,
  max?: number,
): number | null {
  const budget = max ?? fuzzyBudget(query);
  if (budget === 0) return null;
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!needle) return null;
  let best = editDistance(haystack, needle, budget);
  for (const word of haystack.split(" ")) {
    best = Math.min(best, editDistance(word, needle, budget));
  }
  return best <= budget ? best : null;
}

/** Whether `query` is within the edit budget of `text` or any word in it. */
export function fuzzyMatch(text: string, query: string, max?: number): boolean {
  return fuzzyDistance(text, query, max) !== null;
}

const SCORE = {
  exactTitle: 1000,
  titlePrefix: 800,
  wordPrefix: 600,
  acronym: 550,
  titleSubstring: 400,
  // An exact branch or type name outranks the same word merely appearing in
  // some other story's blurb.
  facet: 300,
  note: 180,
  year: 140,
  fuzzy: 90,
} as const;

/**
 * Rank stories against a query.
 *
 * An empty query returns everything (filtered by `kind`) in dataset order —
 * callers that want a curated opening list use `defaultDestinations`.
 */
export function searchStories(
  stories: readonly Story[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const { kind = "All", limit } = options;
  const pool = stories.filter((story) => kind === "All" || story.kind === kind);
  const needle = normalize(query);

  if (!needle) {
    const all = pool.map((story) => ({ story, score: 0, ranges: [] }));
    return limit === undefined ? all : all.slice(0, limit);
  }

  const hits: SearchHit[] = [];
  for (const story of pool) {
    const hit = scoreStory(story, needle);
    if (hit) hits.push(hit);
  }

  // Deterministic: score, then release order, then id. Ties must not depend on
  // array order or the same query renders differently between runs.
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.story.releaseOrder - b.story.releaseOrder ||
      a.story.id.localeCompare(b.story.id),
  );
  return limit === undefined ? hits : hits.slice(0, limit);
}

/** Score one story against an already-normalized query. Null means no match. */
function scoreStory(story: Story, needle: string): SearchHit | null {
  const title = normalizeWithMap(story.title);
  const ranges = rangesFor(title, needle);
  let score = 0;

  if (title.text === needle) score = SCORE.exactTitle;
  else if (title.text.startsWith(needle)) score = SCORE.titlePrefix;
  else if (new RegExp(`(^| )${escapeRegExp(needle)}`).test(title.text)) {
    score = SCORE.wordPrefix;
  } else if (title.text.includes(needle)) score = SCORE.titleSubstring;
  else if (acronymCandidates(story.title).includes(needle)) score = SCORE.acronym;
  else if (
    normalize(story.lane) === needle ||
    normalize(story.kind) === needle
  ) {
    score = SCORE.facet;
  } else if (normalize(story.note).includes(needle)) score = SCORE.note;
  else if (
    /^\d{4}$/.test(needle) &&
    (String(story.releaseYear) === needle ||
      normalize(story.storyYearLabel).includes(needle))
  ) {
    score = SCORE.year;
  } else {
    // Graded, not binary: "avengrs" is one edit from "Avengers" and two from
    // "Avenger", and the closer title should win.
    const distance = fuzzyDistance(story.title, needle);
    if (distance === null) return null;
    score = SCORE.fuzzy + (2 - distance) * 10;
  }

  // Nudge the titles a person is more likely to be heading for above the
  // deep cuts and the branch universes when the textual score is equal.
  if (!story.optional) score += 25;
  if (story.lane !== "Legacy") score += 15;

  return { story, score, ranges };
}

/** Map a normalized-space match back onto indices in the original title. */
function rangesFor(title: Normalized, needle: string): MatchRange[] {
  const at = title.text.indexOf(needle);
  if (at < 0 || needle.length === 0) return [];
  const start = title.map[at];
  // +1 because map holds the source index of the last matched character, and
  // ranges are half-open.
  const end = title.map[at + needle.length - 1] + 1;
  return [{ start, end }];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The list shown before anything is typed.
 *
 * Previously this was just the first N of the dataset, which opened on Eyes of
 * Wakanda and Agent Carter — titles nobody picks as a destination. Recents come
 * first, then the stories the most other stories depend on, which is exactly
 * the set worth heading for.
 */
export function defaultDestinations(
  stories: readonly Story[],
  recentIds: readonly string[],
  limit: number,
): Story[] {
  const byId = new Map(stories.map((story) => [story.id, story]));
  const picked: Story[] = [];
  const seen = new Set<string>();

  const push = (story: Story | undefined) => {
    if (!story || seen.has(story.id) || picked.length >= limit) return;
    seen.add(story.id);
    picked.push(story);
  };

  for (const id of recentIds) push(byId.get(id));

  // In-degree over the full dataset: how many stories list this one as a
  // prerequisite. Endgame and Infinity War rise; one-off specials do not.
  const inDegree = new Map<string, number>();
  for (const story of stories) {
    for (const dependency of story.deps) {
      if (!byId.has(dependency)) continue;
      inDegree.set(dependency, (inDegree.get(dependency) ?? 0) + 1);
    }
  }
  const hubs = [...stories].sort(
    (a, b) =>
      (inDegree.get(b.id) ?? 0) - (inDegree.get(a.id) ?? 0) ||
      b.releaseOrder - a.releaseOrder ||
      a.id.localeCompare(b.id),
  );
  for (const story of hubs) push(story);

  return picked;
}
