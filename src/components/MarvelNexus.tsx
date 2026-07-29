import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ancestorIds,
  dependencyEdges,
  depthOf,
  FEATURED_STORY_ID,
  finalizeStories,
  graphStories,
  graphMetrics,
  parseUrlState,
  resetGraphState,
  serializeUrlState,
  sortTimeline,
  type Kind,
  type Story,
  type StoryInput,
  type TimelineMode,
  validateStories,
  parseWatchedState,
  serializeWatchedState,
} from "../lib/graph";

const s = (
  id: string,
  title: string,
  kind: Kind,
  year: string,
  era: string,
  lane: Story["lane"],
  deps: string[],
  note: string,
  optional = false,
  upcoming = false,
): StoryInput => ({
  id,
  title,
  kind,
  releaseYear: Number(year),
  storyYearLabel: era,
  lane,
  deps,
  note,
  optional,
  upcoming,
});

const artworkCache = new Map<string, string | null>();
const wikipediaTitleOverrides: Record<string, string> = {
  "hulk": "The Incredible Hulk (film)",
  "avengers": "The Avengers (2012 film)",
  "eyes": "Eyes of Wakanda",
  "defenders": "The Defenders (miniseries)",
  "homecoming": "Spider-Man: Homecoming",
  "werewolf": "Werewolf by Night (TV special)",
  "thunderbolts": "Thunderbolts*",
  "fantastic-four": "The Fantastic Four: First Steps",
  "doomsday": "Avengers: Doomsday",
  "secret-wars": "Avengers: Secret Wars",
};

function artworkTitle(story: Story) {
  return wikipediaTitleOverrides[story.id]
    ?? story.title.replace(/\s+[—-]\s+Season \d+$/i, "");
}

function StoryArtwork({
  story,
  variant = "poster",
}: {
  story: Story;
  variant?: "poster" | "backdrop" | "thumb";
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const lookupTitle = artworkTitle(story);
  const [src, setSrc] = useState<string | null | undefined>(
    artworkCache.get(lookupTitle),
  );

  useEffect(() => {
    if (src !== undefined) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lookupTitle)}`,
        );
        const data = response.ok ? await response.json() : null;
        const image = data?.thumbnail?.source ?? data?.originalimage?.source ?? null;
        artworkCache.set(lookupTitle, image);
        if (!cancelled) setSrc(image);
      } catch {
        artworkCache.set(lookupTitle, null);
        if (!cancelled) setSrc(null);
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [lookupTitle, src]);

  return (
    <span
      ref={hostRef}
      className={`story-artwork story-artwork-${variant} artwork-${story.lane.toLowerCase()}`}
      aria-hidden="true"
    >
      {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="artwork-monogram">{story.title.replace(/^The /, "").charAt(0)}</span>
    </span>
  );
}

function NexusSearchIcon() {
  return (
    <svg className="nexus-search-icon" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="13.5" cy="13.5" r="7.5" />
      <circle className="reactor-ring" cx="13.5" cy="13.5" r="3.2" />
      <path d="M19 19l8 8M13.5 6V3M6 13.5H3M19.1 7.9l2.1-2.1" />
    </svg>
  );
}

// Main chronology follows the official Disney+ style order. Branch timelines and
// legacy universes are kept in the graph, but intentionally excluded from the list.
const chronologyInput: StoryInput[] = [
  s("eyes", "Eyes of Wakanda", "Series", "2025", "1260 BCE–1896", "Infinity", [], "Wakanda’s hidden history across four eras."),
  s("first-avenger", "Captain America: The First Avenger", "Movie", "2011", "1943–1945", "Infinity", [], "The super-soldier, the Tesseract, and the first Avenger."),
  s("agent-carter-1", "Agent Carter — Season 1", "Series", "2015", "1946", "Infinity", ["first-avenger"], "Peggy Carter helps build the intelligence world that becomes S.H.I.E.L.D.", true),
  s("agent-carter-2", "Agent Carter — Season 2", "Series", "2016", "1947", "Infinity", ["agent-carter-1"], "Peggy takes the early intelligence network to Los Angeles.", true),
  s("captain-marvel", "Captain Marvel", "Movie", "2019", "1995", "Infinity", ["first-avenger"], "Carol Danvers, the Kree–Skrull conflict, and Fury’s Avengers idea."),
  s("iron-man", "Iron Man", "Movie", "2008", "2010", "Infinity", [], "Tony Stark builds the armor and starts the modern MCU."),
  s("iron-man-2", "Iron Man 2", "Movie", "2010", "2011", "Infinity", ["iron-man"], "War Machine, Black Widow, and the Avengers Initiative."),
  s("hulk", "The Incredible Hulk", "Movie", "2008", "2011", "Infinity", [], "Bruce Banner, the Abomination, and General Ross."),
  s("thor", "Thor", "Movie", "2011", "2011", "Infinity", [], "Asgard, Loki, and the wider cosmos arrive on Earth."),
  s("avengers", "The Avengers", "Movie", "2012", "2012", "Infinity", ["iron-man-2", "hulk", "thor", "first-avenger"], "The core heroes assemble for the Battle of New York."),
  s("iron-man-3", "Iron Man 3", "Movie", "2013", "Late 2012", "Infinity", ["avengers"], "Tony faces the trauma and fallout of New York."),
  s("dark-world", "Thor: The Dark World", "Movie", "2013", "2013", "Infinity", ["thor", "avengers"], "The Reality Stone enters the Infinity Stone story."),
  s("winter-soldier", "Captain America: The Winter Soldier", "Movie", "2014", "2014", "Infinity", ["first-avenger", "avengers"], "Hydra breaks S.H.I.E.L.D. and Bucky returns."),
  s("guardians", "Guardians of the Galaxy", "Movie", "2014", "2014", "Infinity", [], "The cosmic team forms around the Power Stone."),
  s("guardians-2", "Guardians of the Galaxy Vol. 2", "Movie", "2017", "2014", "Infinity", ["guardians"], "The Guardians become a family."),
  s("daredevil-1", "Daredevil — Season 1", "Series", "2015", "2014", "Street", ["avengers"], "Matt Murdock and Wilson Fisk define Hell’s Kitchen.", true),
  s("daredevil-2", "Daredevil — Season 2", "Series", "2016", "2015", "Street", ["daredevil-1"], "Punisher and Elektra widen Matt Murdock’s war.", true),
  s("jessica-jones", "Jessica Jones — Season 1", "Series", "2015", "2015", "Street", ["avengers"], "Jessica Jones and Luke Cage enter the Defenders corner.", true),
  s("age-ultron", "Avengers: Age of Ultron", "Movie", "2015", "2015", "Infinity", ["avengers", "winter-soldier"], "Ultron, Wanda, Vision, and the Sokovia disaster."),
  s("ant-man", "Ant-Man", "Movie", "2015", "2015", "Infinity", ["avengers"], "Scott Lang and the Quantum Realm join the board."),
  s("luke-cage", "Luke Cage — Season 1", "Series", "2016", "2015", "Street", ["jessica-jones"], "Harlem gets its bulletproof hero.", true),
  s("iron-fist-1", "Iron Fist — Season 1", "Series", "2017", "2016", "Street", ["daredevil-2"], "Danny Rand completes the four Defenders leads.", true),
  s("defenders", "The Defenders", "Series", "2017", "2016", "Street", ["daredevil-2", "jessica-jones", "luke-cage", "iron-fist-1"], "The four New York heroes collide.", true),
  s("civil-war", "Captain America: Civil War", "Movie", "2016", "2016", "Infinity", ["age-ultron", "winter-soldier", "ant-man"], "The Avengers split; Black Panther and Spider-Man debut."),
  s("black-widow", "Black Widow", "Movie", "2021", "2016", "Infinity", ["civil-war"], "Natasha’s family and Yelena’s origin."),
  s("black-panther", "Black Panther", "Movie", "2018", "2016", "Infinity", ["civil-war"], "T’Challa’s succession opens Wakanda to the world."),
  s("homecoming", "Spider-Man: Homecoming", "Movie", "2017", "2016", "Infinity", ["civil-war", "iron-man"], "Peter learns what being a friendly neighborhood hero means."),
  s("doctor-strange", "Doctor Strange", "Movie", "2016", "2016–2017", "Infinity", [], "The mystic arts and the Time Stone enter play."),
  s("punisher-1", "The Punisher — Season 1", "Series", "2017", "2016–2017", "Street", ["daredevil-2"], "Frank Castle uncovers the conspiracy behind his family’s death.", true),
  s("jessica-jones-2", "Jessica Jones — Season 2", "Series", "2018", "2017", "Street", ["defenders"], "Jessica investigates the source of her abilities.", true),
  s("luke-cage-2", "Luke Cage — Season 2", "Series", "2018", "2017", "Street", ["defenders"], "Harlem tests Luke’s power and public role.", true),
  s("iron-fist-2", "Iron Fist — Season 2", "Series", "2018", "2017", "Street", ["defenders"], "Danny Rand confronts the cost of the Iron Fist.", true),
  s("daredevil-3", "Daredevil — Season 3", "Series", "2018", "2017–2018", "Street", ["defenders"], "Fisk returns as Matt rebuilds himself.", true),
  s("punisher-2", "The Punisher — Season 2", "Series", "2019", "2018", "Street", ["punisher-1"], "Frank protects a young target while Billy Russo resurfaces.", true),
  s("jessica-jones-3", "Jessica Jones — Season 3", "Series", "2019", "2018", "Street", ["jessica-jones-2"], "Jessica confronts a calculating final adversary.", true),
  s("ragnarok", "Thor: Ragnarok", "Movie", "2017", "2017", "Infinity", ["dark-world", "age-ultron"], "Asgard falls and Thor’s path runs into Thanos."),
  s("ant-wasp", "Ant-Man and the Wasp", "Movie", "2018", "2018", "Infinity", ["ant-man", "civil-war"], "The Quantum Realm becomes the key to what follows."),
  s("infinity-war", "Avengers: Infinity War", "Movie", "2018", "2018", "Infinity", ["age-ultron", "civil-war", "doctor-strange", "ragnarok", "guardians-2", "black-panther"], "Every major branch converges on Thanos."),
  s("endgame", "Avengers: Endgame", "Movie", "2019", "2018 & 2023", "Infinity", ["infinity-war", "ant-wasp", "captain-marvel"], "The Infinity Saga closes and the timeline fractures."),
  s("loki-1", "Loki — Season 1", "Series", "2021", "Outside time", "Multiverse", ["endgame"], "A 2012 branch exposes the TVA and the multiverse."),
  s("what-if-1", "What If…? — Season 1", "Series", "2021", "Across realities", "Multiverse", ["loki-1", "endgame"], "The Watcher tours alternate versions of familiar events.", true),
  s("marvel-zombies", "Marvel Zombies", "Series", "2025", "Alternate reality", "Multiverse", ["what-if-1"], "The zombie reality from What If…? continues.", true),
  s("wandavision", "WandaVision", "Series", "2021", "Late 2023", "Multiverse", ["endgame", "age-ultron"], "Wanda’s grief creates the Hex and awakens the Scarlet Witch."),
  s("shang-chi", "Shang-Chi and the Legend of the Ten Rings", "Movie", "2021", "2024", "Multiverse", ["endgame"], "Shang-Chi inherits the Ten Rings and meets the wider MCU."),
  s("falcon", "The Falcon and the Winter Soldier", "Series", "2021", "2024", "Multiverse", ["endgame", "winter-soldier"], "Sam Wilson earns the Captain America mantle."),
  s("far-from-home", "Spider-Man: Far From Home", "Movie", "2019", "Summer 2024", "Multiverse", ["endgame", "homecoming"], "Peter faces Tony’s legacy and loses his secret identity."),
  s("eternals", "Eternals", "Movie", "2021", "Late 2024", "Multiverse", ["endgame"], "Ancient immortals confront the Celestial plan."),
  s("no-way-home", "Spider-Man: No Way Home", "Movie", "2021", "Late 2024", "Multiverse", ["far-from-home", "doctor-strange", "raimi-3", "amazing-2"], "Three Spider-Man histories collide."),
  s("doctor-strange-2", "Doctor Strange in the Multiverse of Madness", "Movie", "2022", "Late 2024", "Multiverse", ["doctor-strange", "wandavision", "no-way-home", "loki-1"], "Strange, America Chavez, and the Scarlet Witch collide across realities."),
  s("hawkeye", "Hawkeye", "Series", "2021", "Christmas 2024", "Street", ["endgame", "black-widow"], "Clint passes the bow while Yelena hunts him."),
  s("moon-knight", "Moon Knight", "Series", "2022", "2025", "Multiverse", [], "A self-contained supernatural doorway into the MCU."),
  s("wakanda-forever", "Black Panther: Wakanda Forever", "Movie", "2022", "2025", "Multiverse", ["black-panther", "endgame"], "Wakanda grieves T’Challa and meets Talokan."),
  s("echo", "Echo", "Series", "2024", "2025", "Street", ["hawkeye", "daredevil-3"], "Maya Lopez confronts Fisk and her own legacy."),
  s("she-hulk", "She-Hulk: Attorney at Law", "Series", "2022", "2025", "Street", ["hulk", "endgame"], "Jennifer Walters opens the superhuman legal world."),
  s("ms-marvel", "Ms. Marvel", "Series", "2022", "2025", "Multiverse", ["captain-marvel", "endgame"], "Kamala Khan’s origin connects family history to the cosmic MCU."),
  s("love-thunder", "Thor: Love and Thunder", "Movie", "2022", "2025", "Multiverse", ["ragnarok", "endgame", "guardians-2"], "Thor faces Gorr and Jane becomes the Mighty Thor."),
  s("werewolf", "Werewolf by Night", "Special", "2022", "2025", "Multiverse", [], "A compact introduction to Marvel’s monster world.", true),
  s("ironheart", "Ironheart", "Series", "2025", "2025", "Multiverse", ["wakanda-forever", "iron-man"], "Riri Williams brings armor into conflict with magic."),
  s("guardians-holiday", "The Guardians of the Galaxy Holiday Special", "Special", "2022", "Christmas 2025", "Multiverse", ["guardians-2", "endgame"], "The new Knowhere status quo before Vol. 3."),
  s("quantumania", "Ant-Man and the Wasp: Quantumania", "Movie", "2023", "2026", "Multiverse", ["ant-wasp", "endgame", "loki-1"], "The Ant-family enters the Quantum Realm and meets Kang."),
  s("guardians-3", "Guardians of the Galaxy Vol. 3", "Movie", "2023", "2026", "Multiverse", ["guardians-holiday", "endgame"], "Rocket’s origin closes the original Guardians team."),
  s("secret-invasion", "Secret Invasion", "Series", "2023", "2026", "Multiverse", ["captain-marvel", "endgame"], "Fury returns for a paranoid Skrull conflict."),
  s("marvels", "The Marvels", "Movie", "2023", "2026", "Multiverse", ["captain-marvel", "wandavision", "ms-marvel", "secret-invasion"], "Carol, Monica, and Kamala become entangled."),
  s("loki-2", "Loki — Season 2", "Series", "2023", "Outside time", "Multiverse", ["loki-1"], "Loki fights to hold the branching timelines together."),
  s("what-if-2", "What If…? — Season 2", "Series", "2023", "Across realities", "Multiverse", ["what-if-1", "loki-2"], "The Watcher’s multiverse anthology expands.", true),
  s("what-if-3", "What If…? — Season 3", "Series", "2024", "Across realities", "Multiverse", ["what-if-2"], "The Watcher’s final anthology chapter explores new realities.", true),
  s("agatha", "Agatha All Along", "Series", "2024", "2026", "Multiverse", ["wandavision"], "Agatha walks the Witches’ Road after Westview."),
  s("deadpool-wolverine", "Deadpool & Wolverine", "Movie", "2024", "2024–2026 / TVA", "Multiverse", ["deadpool-2", "logan", "loki-1"], "Fox’s mutant history crashes into the TVA."),
  s("daredevil-ba", "Daredevil: Born Again — Season 1", "Series", "2025", "2026–2027", "Street", ["echo", "daredevil-3"], "Matt Murdock and Mayor Fisk resume their collision course."),
  s("brave-new-world", "Captain America: Brave New World", "Movie", "2025", "2027", "Future", ["falcon", "hulk", "eternals"], "Sam faces President Ross and the world’s new power struggle."),
  { ...s("thunderbolts", "Thunderbolts*", "Movie", "2025", "2027 (editorial)", "Future", ["black-widow", "falcon", "ant-wasp", "hawkeye"], "Yelena, Bucky, Ghost, Walker, and Red Guardian become the New Avengers."), editorialPlacement: true },
  s("daredevil-ba-2", "Daredevil: Born Again — Season 2", "Series", "2026", "2027", "Street", ["daredevil-ba"], "The resistance to Fisk’s anti-vigilante rule escalates."),
  s("punisher-special", "The Punisher: One Last Kill", "Special", "2026", "2027", "Street", ["punisher-2", "daredevil-ba"], "Frank Castle returns for one last mission."),
  s("wonder-man", "Wonder Man", "Series", "2026", "2027", "Future", ["shang-chi"], "Hollywood satire meets superhuman identity."),
  s("fantastic-four", "The Fantastic Four: First Steps", "Movie", "2025", "Earth-828 / 1960s", "Multiverse", ["loki-2"], "A retro-futurist Fantastic Four enters the multiverse story."),
  s("brand-new-day", "Spider-Man: Brand New Day", "Movie", "2026", "2027", "Future", ["no-way-home", "daredevil-ba", "shang-chi"], "Peter’s anonymous new chapter collides with New York’s street-level world."),
  s("doomsday", "Avengers: Doomsday", "Movie", "2026", "Upcoming", "Future", ["thunderbolts", "fantastic-four", "loki-2", "deadpool-wolverine", "brand-new-day", "doctor-strange-2", "quantumania"], "The Avengers, Wakandans, Fantastic Four, and X-Men face Doctor Doom.", false, true),
  s("secret-wars", "Avengers: Secret Wars", "Movie", "2027", "Upcoming", "Future", ["doomsday"], "The Multiverse Saga’s announced culmination.", false, true),
];

const legacyInput: StoryInput[] = [
  s("x-men", "X-Men", "Movie", "2000", "Earth-10005", "Legacy", [], "The Fox mutant universe begins.", true),
  s("x2", "X2: X-Men United", "Movie", "2003", "Earth-10005", "Legacy", ["x-men"], "The mutant ensemble expands.", true),
  s("last-stand", "X-Men: The Last Stand", "Movie", "2006", "Earth-10005", "Legacy", ["x2"], "The original X-Men trilogy closes.", true),
  s("xmen-origins", "X-Men Origins: Wolverine", "Movie", "2009", "Earth-10005", "Legacy", ["x-men"], "Logan and Wade’s earliest Fox history.", true),
  s("first-class", "X-Men: First Class", "Movie", "2011", "Earth-10005 / 1962", "Legacy", [], "Charles and Erik’s shared beginning.", true),
  s("the-wolverine", "The Wolverine", "Movie", "2013", "Earth-10005", "Legacy", ["last-stand"], "Logan’s journey continues in Japan.", true),
  s("days-future", "X-Men: Days of Future Past", "Movie", "2014", "Earth-10005", "Legacy", ["first-class", "the-wolverine"], "Two X-Men eras rewrite one timeline.", true),
  s("deadpool", "Deadpool", "Movie", "2016", "Earth-10005", "Legacy", ["days-future"], "Wade Wilson gets his proper origin.", true),
  s("logan", "Logan", "Movie", "2017", "Earth-10005 / 2029", "Legacy", ["days-future"], "Logan’s elegiac final future.", true),
  s("deadpool-2", "Deadpool 2", "Movie", "2018", "Earth-10005", "Legacy", ["deadpool"], "Time travel and the TVA-adjacent setup arrive.", true),
  s("raimi-1", "Spider-Man", "Movie", "2002", "Raimi universe", "Legacy", [], "Peter Parker’s first modern film continuity.", true),
  s("raimi-2", "Spider-Man 2", "Movie", "2004", "Raimi universe", "Legacy", ["raimi-1"], "Doctor Octopus tests Peter’s resolve.", true),
  s("raimi-3", "Spider-Man 3", "Movie", "2007", "Raimi universe", "Legacy", ["raimi-2"], "The Raimi trilogy’s full context for No Way Home.", true),
  s("amazing-1", "The Amazing Spider-Man", "Movie", "2012", "Webb universe", "Legacy", [], "A second cinematic Peter Parker begins.", true),
  s("amazing-2", "The Amazing Spider-Man 2", "Movie", "2014", "Webb universe", "Legacy", ["amazing-1"], "Electro and Gwen’s story feed No Way Home.", true),
  s("xmen97", "X-Men ’97", "Series", "2024", "Earth-92131", "Legacy", [], "The animated mutant timeline continues.", true),
  s("friendly-spider", "Your Friendly Neighborhood Spider-Man", "Series", "2025", "Alternate reality", "Legacy", [], "A standalone animated Peter Parker branch.", true),
];

const releaseSequence = [
  "iron-man", "hulk", "iron-man-2", "thor", "first-avenger", "avengers",
  "iron-man-3", "dark-world", "winter-soldier", "guardians", "agent-carter-1",
  "daredevil-1", "age-ultron", "ant-man", "jessica-jones", "agent-carter-2", "civil-war",
  "luke-cage", "daredevil-2", "doctor-strange", "iron-fist-1", "guardians-2", "homecoming",
  "defenders", "ragnarok", "punisher-1", "black-panther", "infinity-war",
  "ant-wasp", "jessica-jones-2", "luke-cage-2", "iron-fist-2", "daredevil-3",
  "captain-marvel", "punisher-2", "jessica-jones-3", "endgame",
  "far-from-home", "wandavision", "falcon", "loki-1", "black-widow",
  "what-if-1", "shang-chi", "eternals", "hawkeye", "no-way-home",
  "moon-knight", "doctor-strange-2", "ms-marvel", "love-thunder",
  "she-hulk", "werewolf", "wakanda-forever", "guardians-holiday",
  "quantumania", "guardians-3", "secret-invasion", "loki-2", "marvels",
  "what-if-2", "echo", "deadpool-wolverine", "agatha", "what-if-3", "friendly-spider",
  "daredevil-ba", "brave-new-world", "thunderbolts", "ironheart",
  "eyes", "fantastic-four", "marvel-zombies", "wonder-man",
  "daredevil-ba-2", "punisher-special", "brand-new-day", "doomsday",
  "secret-wars",
];

export const chronology = finalizeStories(chronologyInput, releaseSequence);
export const legacy = finalizeStories(
  legacyInput,
  legacyInput.map((story) => story.id),
);
export const stories = [...chronology, ...legacy] as const;
const allStories: Story[] = [...stories];
validateStories(allStories, { total: 95, canonical: 78, legacy: 17 });
const byId = new Map(allStories.map((story) => [story.id, story]));

type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

function transition(update: () => void) {
  const doc = document as TransitionDocument;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  if (doc.startViewTransition) doc.startViewTransition(update);
  else update();
}

export type NexusPage = "home" | "graph" | "timeline";

export default function MarvelNexus({ page = "home" }: { page?: NexusPage }) {
  const initial = typeof window === "undefined"
    ? { destinationId: FEATURED_STORY_ID, view: page === "timeline" ? "timeline" as const : "graph" as const, timelineMode: "story" as const, kind: "All" as const, showOptional: true }
    : parseUrlState(window.location.search, new Set(allStories.map(({ id }) => id)));
  const view: "graph" | "timeline" = page === "timeline" ? "timeline" : "graph";
  const [destinationId, setDestinationId] = useState(initial.destinationId);
  const [inspectedId, setInspectedId] = useState(initial.destinationId);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(initial.timelineMode);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"All" | Kind>(initial.kind);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [showOptional, setShowOptional] = useState(initial.showOptional);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [previewedId, setPreviewedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(.72);
  const [edgePaths, setEdgePaths] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const [headerCompact, setHeaderCompact] = useState(false);
  const graphScrollRef = useRef<HTMLDivElement>(null);
  const graphColumnsRef = useRef<HTMLDivElement>(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const destination = byId.get(destinationId) ?? byId.get(FEATURED_STORY_ID)!;
  const inspected = byId.get(inspectedId) ?? destination;

  useEffect(() => {
    if (page !== "home") return;
    const legacyView = new URLSearchParams(location.search).get("view");
    if (legacyView !== "graph" && legacyView !== "timeline") return;
    const params = new URLSearchParams(location.search);
    params.delete("view");
    location.replace(`/${legacyView}${params.size ? `?${params}` : ""}`);
  }, [page]);

  useEffect(() => {
    if (page === "home") return;
    let frame = 0;
    const updateHeader = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHeaderCompact(window.scrollY > 36));
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateHeader);
    };
  }, [page]);

  useEffect(() => {
    const stored = localStorage.getItem("marvel-nexus-watched");
    setWatched(parseWatchedState(stored, new Set(allStories.map(({ id }) => id))));
  }, []);

  useEffect(() => {
    const sync = () => {
      const state = parseUrlState(location.search, new Set(allStories.map(({ id }) => id)));
      setDestinationId(state.destinationId);
      setInspectedId(state.destinationId);
      setTimelineMode(state.timelineMode);
      setKind(state.kind);
      setShowOptional(state.showOptional);
    };
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    if (page === "home") return;
    const url = serializeUrlState({ destinationId, view, timelineMode, kind, showOptional }, `/${page}`);
    history.replaceState(null, "", url);
  }, [destinationId, view, timelineMode, kind, showOptional, page]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape" && searchOpen) closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [view, timelineMode, kind, showOptional]);

  useEffect(() => {
    if (view !== "timeline") return;
    let frame = 0;
    const update = () => {
      const shell = timelineRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight * 0.35);
      const progress = Math.min(
        1,
        Math.max(0, (window.innerHeight * 0.35 - rect.top) / distance),
      );
      shell.style.setProperty("--timeline-progress", String(progress));

      let closest: HTMLElement | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      shell
        .querySelectorAll<HTMLElement>(".timeline-item")
        .forEach((item) => {
          const itemRect = item.getBoundingClientRect();
          const delta = Math.abs(
            itemRect.top + itemRect.height / 2 - window.innerHeight * 0.48,
          );
          if (delta < closestDistance) {
            closestDistance = delta;
            closest = item;
          }
          item.classList.remove("is-active");
        });
      (closest as HTMLElement | null)?.classList.add("is-active");
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [view, timelineMode, kind, showOptional]);

  const toggleWatched = (id: string) => {
    setWatched((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("marvel-nexus-watched", serializeWatchedState(next));
      return next;
    });
  };

  const graphNodes = useMemo(
    () => graphStories(allStories, destination, byId, showOptional),
    [destination, showOptional],
  );
  const edges = useMemo(() => dependencyEdges(graphNodes), [graphNodes]);
  const metrics = useMemo(
    () => graphMetrics(graphNodes, destination.id, watched),
    [graphNodes, destination.id, watched],
  );
  const activeHighlightId = previewedId ?? focusedId;
  const highlighted = useMemo(() => {
    if (!activeHighlightId) return new Set<string>();
    const source = byId.get(activeHighlightId);
    if (!source) return new Set<string>();
    return new Set([
      activeHighlightId,
      ...ancestorIds(source, byId),
    ]);
  }, [activeHighlightId]);
  const depthMemo = new Map<string, number>();
  const maxDepth = Math.max(
    ...graphNodes.map((story) => depthOf(story.id, byId, depthMemo)),
    0,
  );
  const columns = Array.from({ length: maxDepth + 1 }, (_, depth) =>
    graphNodes.filter((story) => depthOf(story.id, byId, depthMemo) === depth),
  );

  const results = allStories.filter((story) => {
    const matchesQuery = story.title.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (kind === "All" || story.kind === kind);
  });
  const timelineResults = sortTimeline(
    chronology.filter((story) => {
      const matchesQuery = story.title
        .toLowerCase()
        .includes(query.toLowerCase());
      return (
        matchesQuery &&
        (kind === "All" || story.kind === kind) &&
        (showOptional || !story.optional)
      );
    }),
    timelineMode,
  );
  const requiredCount = metrics.unwatched;

  const choose = (id: string) => {
    if (page !== "graph") {
      window.location.href = serializeUrlState({
        destinationId: id, view: "graph", timelineMode, kind, showOptional,
      }, "/graph");
      return;
    }
    transition(() => {
      setDestinationId(id);
      setInspectedId(id);
      setFocusedId(null);
      closeSearch();
      setQuery("");
    });
    history.pushState(null, "", serializeUrlState({
      destinationId: id, view: "graph", timelineMode, kind, showOptional,
    }, "/graph"));
    requestAnimationFrame(() => {
      workspaceHeadingRef.current?.focus();
      workspaceHeadingRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      setAnnouncement(`Showing the path to ${byId.get(id)?.title}.`);
    });
  };

  const inspectStory = (id: string) => {
    transition(() => setInspectedId(id));
    setFocusedId(id);
    setPreviewedId(null);
  };

  const changeTimelineMode = (mode: TimelineMode) => {
    transition(() => setTimelineMode(mode));
  };

  const resetPath = () => {
    const reset = resetGraphState();
    transition(() => {
      setDestinationId(reset.selectedId);
      setInspectedId(reset.selectedId);
      setKind(reset.kind);
      setShowOptional(reset.showOptional);
      setQuery(reset.query);
    });
    setZoom(1);
    graphScrollRef.current?.scrollTo({
      left: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    requestAnimationFrame(() => searchTriggerRef.current?.focus());
  };

  const fitGraph = () => {
    const viewport = graphScrollRef.current;
    const content = graphColumnsRef.current;
    if (!viewport || !content) return;
    const widthScale = (viewport.clientWidth - 32) / content.scrollWidth;
    const heightScale = (viewport.clientHeight - 32) / content.scrollHeight;
    const scale = Math.max(.42, Math.min(1, widthScale, heightScale));
    setZoom(Number(scale.toFixed(2)));
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left: Math.max(0, (content.scrollWidth * scale - viewport.clientWidth) / 2),
        top: Math.max(0, (content.scrollHeight * scale - viewport.clientHeight) / 2),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  };

  useLayoutEffect(() => {
    const stage = graphColumnsRef.current;
    if (!stage) return;
    const draw = () => {
      const next: Record<string, string> = {};
      const positionInStage = (node: HTMLElement) => {
        let x = 0;
        let y = 0;
        let current: HTMLElement | null = node;
        while (current && current !== stage) {
          x += current.offsetLeft;
          y += current.offsetTop;
          current = current.offsetParent as HTMLElement | null;
        }
        return { x, y };
      };
      for (const edge of edges) {
        const from = stage.querySelector<HTMLElement>(`[data-node="${edge.from}"]`);
        const to = stage.querySelector<HTMLElement>(`[data-node="${edge.to}"]`);
        if (!from || !to) continue;
        const a = positionInStage(from);
        const b = positionInStage(to);
        const x1 = a.x + from.offsetWidth;
        const y1 = a.y + from.offsetHeight / 2;
        const x2 = b.x;
        const y2 = b.y + to.offsetHeight / 2;
        const bend = Math.max(24, (x2 - x1) * .45);
        next[`${edge.from}:${edge.to}`] = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      }
      setEdgePaths(next);
    };
    const frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    document.fonts.ready.then(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [edges]);

  const openSearch = () => {
    setActiveResult(0);
    setSearchOpen(true);
  };

  const searchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((index) => Math.min(index + 1, Math.min(results.length, 18) - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && results[activeResult]) {
      event.preventDefault();
      choose(results[activeResult].id);
    } else if (event.key === "Tab") {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
  };

  return (
    <main className={`page page-${page}`}>
      <header className={`topbar workspace-topbar ${headerCompact ? "is-compact" : ""}`}>
        <a className="brand" href="/" aria-label="Marvel Nexus home">
          <span className="brand-mark"><img src="/icon-32.png" alt="" /></span>
          <span className="brand-name">MARVEL <b>NEXUS</b></span>
          {page !== "home" && <span className="compact-page-title">{page === "graph" ? "Dependency graph" : "MCU timeline"}</span>}
        </a>
        <nav className="view-switch" aria-label="Explore Marvel Nexus">
          <a aria-current={page === "home" ? "page" : undefined} className={page === "home" ? "active" : ""} href="/">Home</a>
          <a aria-current={page === "graph" ? "page" : undefined} className={page === "graph" ? "active" : ""} href="/graph">Graph</a>
          <a aria-current={page === "timeline" ? "page" : undefined} className={page === "timeline" ? "active" : ""} href="/timeline">Timeline</a>
        </nav>
        <button ref={searchTriggerRef} className="search-trigger icon-search" onClick={openSearch} aria-label="Search Marvel titles">
          <NexusSearchIcon />
        </button>
      </header>

      {page === "home" && <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><i /> MCU STORY NAVIGATOR · UPDATED JUL 2026</div>
          <h1>Every story.<br /><em>One connected universe.</em></h1>
          <p>Pick any Marvel title. See what it depends on, trace every branch backward, then mark your way through {chronology.length} MCU season-level stops + {legacy.length} legacy branch titles.</p>
          <div className="hero-actions">
            <button className="primary" onClick={openSearch}>Choose your destination <span>→</span></button>
            <a className="secondary" href="/timeline">Browse the timeline</a>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit orbit-a"><span /></div>
          <div className="orbit orbit-b"><span /></div>
          <div className="arc-core">{allStories.length}<span>STORIES</span></div>
          <div className="orbit-label one">INFINITY</div>
          <div className="orbit-label two">MULTIVERSE</div>
          <div className="orbit-label three">STREET</div>
        </div>
      </section>}

      {page !== "home" && <section className="workspace">
        <div className="workspace-head">
          <div>
            <div className="section-kicker">{view === "graph" ? "THE NEXUS MAP" : "THE SACRED TIMELINE"}</div>
            <h2 ref={workspaceHeadingRef} tabIndex={-1}>{view === "graph" ? <>Trace any story’s <span>path</span></> : <>Watch it <span>chronologically</span></>}</h2>
            <p>{view === "graph" ? `${requiredCount} unwatched prerequisites · arrows flow toward your destination` : `${timelineResults.length} canonical MCU stops · branch universes stay in the graph`}</p>
          </div>
          <div className="workspace-controls">
            {view === "timeline" && (
              <div className="order-switch" aria-label="Timeline ordering">
                <button
                  aria-pressed={timelineMode === "story"}
                  className={timelineMode === "story" ? "active" : ""}
                  onClick={() => changeTimelineMode("story")}
                >
                  Story chronology
                </button>
                <button
                  aria-pressed={timelineMode === "release"}
                  className={timelineMode === "release" ? "active" : ""}
                  onClick={() => changeTimelineMode("release")}
                >
                  Release chronology
                </button>
              </div>
            )}
            <div className="segmented">
              {(["All", "Movie", "Series", "Special"] as const).map((item) => (
                <button key={item} aria-pressed={kind === item} className={kind === item ? "active" : ""} onClick={() => { setKind(item); setAnnouncement(`${item} filter selected.`); }}>{item}</button>
              ))}
            </div>
            <label className="optional-toggle">
              <input type="checkbox" checked={showOptional} onChange={(e) => setShowOptional(e.target.checked)} />
              <span /> Include deep cuts
            </label>
          </div>
        </div>

        {view === "graph" ? (
          <>
            <div className="graph-legend">
              <span><i className="dot required" /> Required</span>
              <span><i className="dot optional" /> Deep cut</span>
              <span><i className="dot watched" /> Watched</span>
              <div className="graph-actions">
                {destinationId !== FEATURED_STORY_ID && (
                  <button className="reset-path" onClick={resetPath}>↺ Reset path</button>
                )}
                <button onClick={openSearch}>Change destination ↗</button>
              </div>
            </div>
            <div className="graph-shell">
              <div className="graph-map">
                <div className="graph-toolbar" aria-label="Graph viewport controls">
                  <button onClick={() => setZoom((value) => Math.max(.42, value - .1))} aria-label="Zoom out">−</button>
                  <output aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
                  <button onClick={() => setZoom((value) => Math.min(1.35, value + .1))} aria-label="Zoom in">+</button>
                  <button onClick={fitGraph}>Fit</button>
                </div>
              <div
                className="graph-scroll"
                ref={graphScrollRef}
                tabIndex={0}
                aria-label="Dependency map. Use arrow keys to pan."
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const horizontal = event.key === "ArrowLeft" ? -120 : event.key === "ArrowRight" ? 120 : 0;
                  const vertical = event.key === "ArrowUp" ? -90 : event.key === "ArrowDown" ? 90 : 0;
                  graphScrollRef.current?.scrollBy({ left: horizontal, top: vertical, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                }}
              >
                <div className="graph-columns" ref={graphColumnsRef} style={{ zoom } as React.CSSProperties}>
                  <svg className="graph-edges" aria-hidden="true" width="100%" height="100%">
                    {edges.map((edge) => <path
                      key={`${edge.from}:${edge.to}`}
                      d={edgePaths[`${edge.from}:${edge.to}`] ?? ""}
                      className={`${activeHighlightId ? (highlighted.has(edge.from) && highlighted.has(edge.to) ? "active" : "muted") : ""} ${kind !== "All" && byId.get(edge.from)?.kind !== kind && byId.get(edge.to)?.kind !== kind ? "filtered-edge" : ""}`}
                    />)}
                  </svg>
                  {columns.map((column, columnIndex) => (
                    <div className="graph-column" key={columnIndex}>
                      <div className="column-label">{columnIndex === maxDepth ? "Destination" : `${maxDepth - columnIndex} ${maxDepth - columnIndex === 1 ? "step" : "steps"} back`}</div>
                      <div className="column-nodes">
                        {column.map((story) => (
                          <button
                            key={story.id}
                            data-node={story.id}
                            className={`story-node ${story.optional ? "optional" : ""} ${watched.has(story.id) ? "watched" : ""} ${story.id === destination.id ? "destination" : ""} ${story.id === inspected.id ? "inspected" : ""} ${activeHighlightId ? (highlighted.has(story.id) ? "highlighted" : "unrelated") : ""} ${kind !== "All" && story.kind !== kind && story.id !== inspected.id ? "filtered" : ""}`}
                            onClick={() => inspectStory(story.id)}
                            onMouseEnter={() => setPreviewedId(story.id)}
                            onMouseLeave={() => setPreviewedId(null)}
                            onFocus={() => setPreviewedId(story.id)}
                            onBlur={() => setPreviewedId(null)}
                            style={{ viewTransitionName: `story-${story.id}` }}
                          >
                            <StoryArtwork story={story} variant="backdrop" />
                            <span className="node-top"><b>{story.kind}</b><i>{story.storyYearLabel}</i></span>
                            <strong>{story.title}</strong>
                            <span className="node-bottom">{story.lane}<i>{watched.has(story.id) ? "✓" : story.deps.length || "ORIGIN"}</i></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
              <aside className="inspector" key={inspected.id} style={{ viewTransitionName: "story-inspector" }}>
                <StoryArtwork story={inspected} variant="backdrop" />
                <div className="inspector-top">
                  <span className={`kind-badge ${inspected.kind.toLowerCase()}`}>{inspected.kind}</span>
                  <span>{inspected.releaseYear} RELEASE</span>
                </div>
                <span className="index-label">Timeline position</span>
                <div className="inspector-index">{chronology.some((x) => x.id === inspected.id) ? String(chronology.findIndex((x) => x.id === inspected.id) + 1).padStart(2, "0") : "BR"}</div>
                <h3>{inspected.title}</h3>
                <p>{inspected.note}</p>
                <dl>
                  <div><dt>Story year</dt><dd>{inspected.storyYearLabel}{inspected.editorialPlacement ? " †" : ""}</dd></div>
                  <div><dt>Release year</dt><dd>{inspected.releaseYear}</dd></div>
                  <div><dt>Branch</dt><dd>{inspected.lane} Saga</dd></div>
                  <div><dt>Direct links</dt><dd>{inspected.deps.length}</dd></div>
                  <div><dt>Total path</dt><dd>{metrics.total} prerequisites</dd></div>
                </dl>
                {inspected.id === destination.id ? (
                  <p className="destination-note">{metrics.total === 0 ? `${destination.title} is an origin point — nothing is required. Start here.` : "This is your destination. Watched progress applies to prerequisites."}</p>
                ) : (
                  <>
                    <button className="destination-button" onClick={() => choose(inspected.id)}>Set as destination</button>
                    <button className={`watch-button ${watched.has(inspected.id) ? "done" : ""}`} onClick={() => toggleWatched(inspected.id)}>
                      {watched.has(inspected.id) ? "✓ Watched" : "+ Mark as watched"}
                    </button>
                  </>
                )}
                {inspected.deps.length > 0 && (
                  <div className="direct-list">
                    <span>DIRECTLY REQUIRES</span>
                    {inspected.deps.filter((id) => graphNodes.some((story) => story.id === id)).map((id) => <button key={id} onClick={() => inspectStory(id)}>{byId.get(id)?.title} <i>Inspect</i></button>)}
                  </div>
                )}
                {inspected.editorialPlacement && <p className="editorial-note">† Story placement is an editorial estimate; Marvel has not fixed an official year.</p>}
              </aside>
            </div>
          </>
        ) : (
          <div className="timeline-shell" ref={timelineRef}>
            <div className="timeline-spine" />
            <div className="timeline-progress" />
            {timelineResults.map((story, index) => (
              <article
                className={`timeline-item ${watched.has(story.id) ? "is-watched" : ""}`}
                key={story.id}
                data-reveal
                style={{
                  "--reveal-delay": `${Math.min(index % 6, 5) * 38}ms`,
                  viewTransitionName: `timeline-${story.id}`,
                } as React.CSSProperties}
              >
                <button className="timeline-check" onClick={() => toggleWatched(story.id)} aria-label={`Mark ${story.title} watched`}>
                  {watched.has(story.id) ? "✓" : ""}
                </button>
                <div className="timeline-dates">
                  <span className={timelineMode === "story" ? "active" : ""}>
                    <small>Story</small>{story.storyYearLabel}
                  </span>
                  <span className={timelineMode === "release" ? "active" : ""}>
                    <small>Released</small>{story.releaseYear}
                  </span>
                </div>
                <div className="timeline-card" onClick={() => choose(story.id)}>
                  <StoryArtwork story={story} variant="poster" />
                  <div className="timeline-card-copy">
                    <div><span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span>{story.optional && <span className="deep-badge">DEEP CUT</span>}{story.upcoming && <span className="future-badge">UPCOMING</span>}</div>
                    <h3>{story.title}</h3>
                    <p>{story.note}</p>
                    <span className="dependency-count">{story.deps.length ? `${story.deps.length} direct dependencies` : "Origin point"} <i>Open graph →</i></span>
                  </div>
                </div>
                <div className="timeline-number">{String(index + 1).padStart(2, "0")}</div>
              </article>
            ))}
          </div>
        )}
      </section>}

      {page === "home" && <section className="method" data-reveal>
        <div>
          <div className="section-kicker">HOW TO READ THE MAP</div>
          <h2>Chronology tells you <em>when.</em><br />Dependencies tell you <em>why.</em></h2>
        </div>
        <div className="method-grid">
          <div><span>01</span><h3>Pick the destination</h3><p>Choose the story you want to watch. The graph collapses the universe around it.</p></div>
          <div><span>02</span><h3>Trace the branches</h3><p>Direct links are the important setup. Deep cuts add texture, not homework.</p></div>
          <div><span>03</span><h3>Build your own path</h3><p>Mark stories watched. Your remaining prerequisite count updates on this device.</p></div>
        </div>
      </section>}

      {page === "home" && <footer>
        <div className="brand footer-brand"><span className="brand-mark"><img src="/icon-32.png" alt="" /></span><span>MARVEL <b>NEXUS</b></span></div>
        <p>An independent fan-made story navigator. Timeline placement follows Marvel’s published Disney+ chronology; narrative dependencies are editorial.</p>
        <span>DATA CUT · JUL 2026</span>
      </footer>}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      {searchOpen && (
        <div className="search-modal" role="dialog" aria-modal="true" aria-label="Find a Marvel title" onMouseDown={(e) => e.target === e.currentTarget && closeSearch()}>
          <div className="search-panel">
            <div className="search-input">
              <NexusSearchIcon />
              <input
                ref={searchInputRef}
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="title-results"
                aria-activedescendant={results[activeResult] ? `result-${results[activeResult].id}` : undefined}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveResult(0); setAnnouncement(`${results.length} matching stories.`); }}
                onKeyDown={searchKeyDown}
                placeholder="Where are you headed?"
              />
              <button onClick={closeSearch}>ESC</button>
            </div>
            <div className="search-meta"><span>{results.length} STORIES</span><span>SELECT A DESTINATION</span></div>
            <div className="search-results" id="title-results" role="listbox">
              {results.slice(0, 18).map((story, index) => (
                <button id={`result-${story.id}`} role="option" aria-selected={activeResult === index} className={activeResult === index ? "active" : ""} key={story.id} onMouseEnter={() => setActiveResult(index)} onClick={() => choose(story.id)}>
                  <StoryArtwork story={story} variant="thumb" />
                  <span className="result-copy">
                    <span className="result-badges"><span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span><span>{story.lane}</span></span>
                    <strong>{story.title}</strong>
                    <small>{story.storyYearLabel} · {story.releaseYear} release</small>
                  </span>
                  <i>{story.deps.length ? `${story.deps.length} links` : "Origin"} <b>→</b></i>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
