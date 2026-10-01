import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ancestorIds,
  nodeSummary,
  graphOutline,
  DEFAULT_SHOW_OPTIONAL,
  DEFAULT_TIMELINE_MODE,
  columnLabel,
  criticalPath,
  dependencyEdges,
  visibleGraph,
  FEATURED_STORY_ID,
  ALL_STORIES_ID,
  assignNodeTops,
  layerStories,
  orderColumns,
  graphMetrics,
  parseUrlState,
  resetGraphState,
  serializeUrlState,
  sortTimeline,
  type GraphEdge,
  type Kind,
  type TimelineMode,
  parseWatchedState,
  serializeWatchedState,
  parseRecentIds,
  parseStoredId,
  serializeRecentIds,
  pushRecentId,
  watchedProgress,
} from "../lib/graph";
import { defaultDestinations, searchStories } from "../lib/search";
import {
  allStories,
  byId,
  chronology,
  legacy,
} from "../lib/stories";
import { offsetWithin, useGraphViewport, type ContentBox } from "../lib/useGraphViewport";
import AppHeader from "./AppHeader";
import ErrorBoundary from "./ErrorBoundary";
import { HomeFooter, HomeHero, HomeMethod } from "./HomeSections";
import Inspector from "./Inspector";
import GraphMinimap, { type MinimapNode } from "./GraphMinimap";
import SearchPalette, { MAX_RESULTS } from "./SearchPalette";
import SplashScreen from "./SplashScreen";
import StatusDock from "./StatusDock";
import StoryNode from "./StoryNode";
import TimelineView from "./TimelineView";


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

/** Layout px reserved at the target end of an edge for its arrowhead. */
const ARROW_GAP = 9;

/** Spacing between two arrows sharing one card's edge, in layout px. */
const PORT_PITCH = 11;

/**
 * The island's real body. Exported only through the boundary below — a
 * boundary cannot catch a throw from its own render, so it has to sit above
 * this component rather than inside its returned tree.
 */
/**
 * localStorage throws (SecurityError) when site data is blocked and on a full
 * quota. Progress is a convenience, so a failure must never take the island
 * down with it.
 */
function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Ignored: see readStorage.
  }
}

function NexusApp({ page = "home" }: { page?: NexusPage }) {
  // Always the SSR defaults: reading location.search here would render
  // different markup than the static HTML and fail hydration on any ?to= link.
  // The URL is applied right after mount, before first paint (see below).
  const initial = { destinationId: ALL_STORIES_ID, timelineMode: DEFAULT_TIMELINE_MODE, kind: "All" as const, showOptional: DEFAULT_SHOW_OPTIONAL };
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
  /**
   * Which node is the grid's single tab stop. Deliberately separate from
   * focusedId: that one feeds activeHighlightId, so reusing it would repaint
   * the entire highlight set on every arrow keypress.
   */
  const [rovingId, setRovingId] = useState<string | null>(null);
  const [inspectorTakesFocus, setInspectorTakesFocus] = useState(false);
  /** Destinations chosen before, newest first — the palette's opening list. */
  const [recentIds, setRecentIds] = useState<string[]>([]);
  /** The story ticked most recently, for the dock's "last watched" jump. */
  const [lastWatchedId, setLastWatchedId] = useState<string | null>(null);
  const contentBoxRef = useRef<ContentBox>({ width: 0, height: 0 });
  const [nodeRects, setNodeRects] = useState<MinimapNode[]>([]);
  // View-only state: deliberately not in the URL, so shared links keep
  // round-tripping to a clean address.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hideWatched, setHideWatched] = useState(false);
  const [showSpine, setShowSpine] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  // The edge tooltip is DOM-only. It used to be React state, which meant every
  // edge hover re-rendered the entire map. Same attribute-not-class discipline
  // as data-revealed / data-active below.
  const edgeTooltipRef = useRef<HTMLDivElement>(null);
  const edgeFromRef = useRef<HTMLElement>(null);
  const edgeToRef = useRef<HTMLElement>(null);
  const hoveredEdgeKeyRef = useRef<string | null>(null);
  const [edgePaths, setEdgePaths] = useState<Record<string, string>>({});
  /**
   * Extra margin above each card, written by the layout pass. This is how the
   * barycentre placement reaches the DOM — see assignNodeTops for why cards
   * cannot simply stack from the top of their column.
   */
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");
  const [headerCompact, setHeaderCompact] = useState(false);
  const graphScrollRef = useRef<HTMLDivElement>(null);
  const graphColumnsRef = useRef<HTMLDivElement>(null);
  const viewport = useGraphViewport({
    scrollRef: graphScrollRef,
    stageRef: graphColumnsRef,
    contentBox: contentBoxRef,
  });
  const zoom = viewport.zoom;
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  // Written by the scroll pass, never rendered from state — see the comment in
  // the scroll effect for why.
  const timelinePositionRef = useRef<HTMLSpanElement>(null);
  /**
   * null means "no destination": the map shows every story rather than one
   * film's ancestry. That is the default — see ALL_STORIES_ID.
   */
  const destination = destinationId === ALL_STORIES_ID
    ? null
    : byId.get(destinationId) ?? null;
  const inspected =
    byId.get(inspectedId) ?? destination ?? byId.get(FEATURED_STORY_ID)!;

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
    const ids = new Set(allStories.map(({ id }) => id));
    setWatched(parseWatchedState(readStorage("marvel-nexus-watched"), ids));
    setRecentIds(parseRecentIds(readStorage("marvel-nexus-recent"), ids));
    setLastWatchedId(parseStoredId(readStorage("marvel-nexus-last"), ids));
  }, []);

  useLayoutEffect(() => {
    const sync = () => {
      const state = parseUrlState(location.search, new Set(allStories.map(({ id }) => id)));
      setDestinationId(state.destinationId);
      setInspectedId(state.destinationId);
      setTimelineMode(state.timelineMode);
      setKind(state.kind);
      setShowOptional(state.showOptional);
    };
    if (page !== "home") sync();
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
        setActiveResult(0);
        setSearchOpen(true);
      }
      if (event.key === "Escape" && searchOpen) closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // Reveal state is written as a data attribute, never a class.
  //
  // These elements also carry a React-managed `className` (a timeline row gains
  // `is-watched` when ticked). React rewrites the whole class attribute on every
  // such update, which would silently wipe an imperatively-added class — and
  // since the observer unobserves on reveal, the row would never come back and
  // would sit at opacity:0 forever. React does not touch attributes it never
  // rendered, so data-revealed survives.
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.setAttribute("data-revealed", ""));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
          }
        }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [view, timelineMode, kind, showOptional, query]);

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
          // Attribute, not a class — same reason as data-revealed above.
          item.removeAttribute("data-active");
        });
      const active = closest as HTMLElement | null;
      active?.setAttribute("data-active", "");

      // Position readout, written straight to the DOM in this same pass. It
      // must not go through setState: this runs on every scroll frame, and a
      // render per frame would re-reconcile all 95 rows.
      const position = timelinePositionRef.current;
      if (position && active) {
        const index = Number(active.dataset.index ?? 0) + 1;
        const total = shell.querySelectorAll(".timeline-item").length;
        const text = `${index} / ${total}`;
        if (position.textContent !== text) position.textContent = text;
      }
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
  }, [view, timelineMode, kind, showOptional, query]);

  // Stable identity, so React.memo on StoryNode is not defeated by a fresh
  // callback on every render.
  const toggleCollapsed = useCallback((id: string) => {
    transition(() =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    );
  }, []);

  /** Position and fill the tooltip, and light the matching visible path. */
  const showEdgeTooltip = (
    key: string,
    from: string,
    to: string,
    x: number,
    y: number,
  ) => {
    const tooltip = edgeTooltipRef.current;
    if (!tooltip) return;
    if (hoveredEdgeKeyRef.current !== key) {
      clearHoveredPath();
      graphColumnsRef.current
        ?.querySelector(`[data-edge="${key}"]`)
        ?.classList.add("hovered");
      hoveredEdgeKeyRef.current = key;
      if (edgeFromRef.current) edgeFromRef.current.textContent = from;
      if (edgeToRef.current) edgeToRef.current.textContent = to;
    }
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.setAttribute("data-visible", "");
  };

  const hideEdgeTooltip = () => {
    clearHoveredPath();
    edgeTooltipRef.current?.removeAttribute("data-visible");
  };

  const clearHoveredPath = () => {
    const previous = hoveredEdgeKeyRef.current;
    if (!previous) return;
    graphColumnsRef.current
      ?.querySelector(`[data-edge="${previous}"]`)
      ?.classList.remove("hovered");
    hoveredEdgeKeyRef.current = null;
  };

  const toggleWatched = (id: string) => {
    const next = new Set(watched);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setWatched(next);
    writeStorage("marvel-nexus-watched", serializeWatchedState(next));
    // The dock's jump target follows the tick, and is cleared when the story
    // it points at is un-ticked — otherwise it offers to take you to
    // something that is no longer watched.
    if (next.has(id)) {
      setLastWatchedId(id);
      writeStorage("marvel-nexus-last", id);
    } else if (lastWatchedId === id) {
      setLastWatchedId(null);
      writeStorage("marvel-nexus-last", null);
    }
    if (view === "timeline") {
      // Announced from the same list the meter counts, so the spoken figure
      // and the visible one cannot disagree.
      const after = watchedProgress(timelineResults, next);
      setAnnouncement(
        `${byId.get(id)?.title ?? id} ${next.has(id) ? "marked" : "unmarked"} watched. ${after.percent}% watched.`,
      );
    }
  };

  const disclosure = useMemo(
    () =>
      visibleGraph(destination, byId, {
        showOptional,
        collapsed,
        hidden: hideWatched ? watched : undefined,
      }),
    [destination, showOptional, collapsed, hideWatched, watched],
  );
  const graphNodes = useMemo(
    () => allStories.filter(({ id }) => disclosure.ids.has(id)),
    [disclosure],
  );
  const spine = useMemo(
    () =>
      showSpine && destination
        ? new Set(criticalPath(destination.id, byId))
        : null,
    [showSpine, destination],
  );
  const edges = useMemo(() => dependencyEdges(graphNodes), [graphNodes]);
  const metrics = useMemo(
    // With no destination the sentinel matches nothing, so "prerequisites"
    // becomes "everything on the map" — which is exactly the right count.
    () => graphMetrics(graphNodes, destination?.id ?? ALL_STORIES_ID, watched),
    [graphNodes, destination, watched],
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
  // Layer by longest-path depth, then reorder within each column to cut edge
  // crossings. Memoised because reordering is O(edges^2) per adjacent pair.
  const columns = useMemo(
    () => orderColumns(layerStories(graphNodes, byId), edges),
    [graphNodes, edges],
  );
  const maxDepth = columns.length - 1;

  /**
   * The grid's tab stop. Falls back to the first node so the graph is always
   * reachable, and re-anchors if the roving node is filtered off the map.
   */
  const activeRovingId = useMemo(() => {
    const visible = columns.flat();
    if (rovingId && visible.some(({ id }) => id === rovingId)) return rovingId;
    return visible[0]?.id ?? null;
  }, [columns, rovingId]);

  /**
   * Node descriptions, computed once per layout rather than per render — this
   * is 95 traversals of the edge list and it must not run on every hover.
   */
  const nodeSummaries = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((column, columnIndex) => {
      for (const story of column) {
        map.set(
          story.id,
          nodeSummary(story.id, byId, edges, disclosure.ids, {
            column: columnIndex + 1,
            columns: columns.length,
          }),
        );
      }
    });
    return map;
  }, [columns, edges, disclosure]);

  /** Linear read-out of the map for screen readers; the SVG carries no meaning. */
  const outline = useMemo(
    () =>
      view === "graph" ? graphOutline(columns, edges, byId, !!destination) : [],
    [view, columns, edges, destination],
  );

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const related =
          highlighted.has(edge.from) && highlighted.has(edge.to);
        return {
          ...edge,
          key: `${edge.from}:${edge.to}`,
          state: activeHighlightId ? (related ? "active" : "muted") : "",
          filtered:
            kind !== "All" &&
            byId.get(edge.from)?.kind !== kind &&
            byId.get(edge.to)?.kind !== kind,
        };
      }),
    [edges, activeHighlightId, highlighted, kind],
  );

  /**
   * Memoised because these used to recompute on every render — including every
   * hover-driven setPreviewedId, i.e. on every mouse move across the graph.
   */
  const searchHits = useMemo(
    () =>
      query
        ? searchStories(allStories, query, { kind })
        : defaultDestinations(
            allStories.filter((story) => kind === "All" || story.kind === kind),
            recentIds,
            MAX_RESULTS,
          ).map((story) => ({
            story,
            score: 0,
            ranges: [],
          })),
    [query, kind, recentIds],
  );
  const results = useMemo(() => searchHits.map((hit) => hit.story), [searchHits]);
  /**
   * Truncated once, here. Keyboard navigation and aria-activedescendant both
   * index into this, so a second slice inside the palette would let the arrow
   * keys run past the last rendered option.
   */
  const visibleHits = useMemo(
    () => searchHits.slice(0, MAX_RESULTS),
    [searchHits],
  );
  const timelineResults = useMemo(
    () =>
      sortTimeline(
        searchStories(chronology, query, { kind })
          .map((hit) => hit.story)
          .filter((story) => showOptional || !story.optional),
        timelineMode,
      ),
    [query, kind, showOptional, timelineMode],
  );
  const requiredCount = metrics.unwatched;
  /**
   * Completion against what the filters actually show, not a fixed 95 — with a
   * fixed denominator the percentage would drop when a filter is applied, for
   * no reason the user can see.
   */
  const progress = useMemo(
    () => watchedProgress(timelineResults, watched),
    [timelineResults, watched],
  );
  /**
   * What the dock counts and jumps to. The dock is a chronology control, so it
   * counts what the chronology filters actually show — the figures can never
   * describe a set the reader is not looking at.
   */
  const dockLastWatched = useMemo(() => {
    if (!lastWatchedId) return null;
    const story = byId.get(lastWatchedId);
    return story ? { id: story.id, title: story.title } : null;
  }, [lastWatchedId]);
  const dockNextUnwatched = useMemo(() => {
    const story = timelineResults.find(({ id }) => !watched.has(id));
    return story ? { id: story.id, title: story.title } : null;
  }, [timelineResults, watched]);

  const scrollBehavior = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? ("auto" as const)
      : ("smooth" as const);

  const backToTop = () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  };

  /** Scroll a chronology row into view. */
  const revealStory = (id: string) => {
    const title = byId.get(id)?.title ?? id;
    const row = timelineRef.current?.querySelector<HTMLElement>(
      `[data-story="${id}"]`,
    );
    if (!row) {
      setAnnouncement(`${title} is hidden by the current filters.`);
      return;
    }
    row.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    setAnnouncement(`Jumped to ${title}.`);
  };

  /**
   * The graph URL for a story. Shared by `choose` and the timeline card links
   * so a real href and an in-page navigation can never disagree.
   */
  const hrefFor = (id: string) =>
    serializeUrlState(
      { destinationId: id, view: "graph", timelineMode, kind, showOptional },
      "/graph",
    );

  const choose = (id: string) => {
    // Recorded before the early return so a pick made from the timeline is
    // remembered even though that path is a full page navigation.
    const nextRecent = pushRecentId(recentIds, id);
    setRecentIds(nextRecent);
    writeStorage("marvel-nexus-recent", serializeRecentIds(nextRecent));
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

  const inspectStory = useCallback((id: string, fromKeyboard = false) => {
    transition(() => setInspectedId(id));
    setFocusedId(id);
    setPreviewedId(null);
    // Focus only follows a keyboard activation. On a mouse click, moving focus
    // into the Inspector would drop the user out of the graph mid-traversal,
    // so the change is announced instead.
    setInspectorTakesFocus(fromKeyboard);
    setAnnouncement(
      `Inspecting ${byId.get(id)?.title ?? id}. ${
        (byId.get(id)?.deps.length ?? 0)
      } direct prerequisites.`,
    );
  }, []);

  /**
   * Arrow-key traversal inside the node grid.
   *
   * Left/Right cross columns at the same row index, Up/Down move within a
   * column, Home/End jump to its ends. Propagation is stopped so the same
   * keypress does not also reach .graph-scroll and pan the canvas.
   */
  const moveRoving = (
    event: React.KeyboardEvent<HTMLDivElement>,
    columnIndex: number,
  ) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const column = columns[columnIndex];
    if (!column) return;
    const currentId = (event.target as HTMLElement)
      .closest<HTMLElement>("[data-node]")
      ?.dataset.node;
    const row = column.findIndex((story) => story.id === currentId);
    if (row < 0) return;

    event.preventDefault();
    event.stopPropagation();

    let next: string | undefined;
    if (event.key === "ArrowUp") next = column[Math.max(0, row - 1)]?.id;
    else if (event.key === "ArrowDown") next = column[Math.min(column.length - 1, row + 1)]?.id;
    else if (event.key === "Home") next = column[0]?.id;
    else if (event.key === "End") next = column[column.length - 1]?.id;
    else {
      const target = columns[columnIndex + (event.key === "ArrowLeft" ? -1 : 1)];
      // Columns are ragged, so clamp rather than assuming the row exists.
      if (target?.length) next = target[Math.min(row, target.length - 1)]?.id;
    }
    if (!next || next === currentId) return;

    setRovingId(next);
    graphColumnsRef.current
      ?.querySelector<HTMLElement>(`[data-node="${next}"]`)
      ?.focus();
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
      setCollapsed(new Set());
      setHideWatched(false);
      setShowSpine(false);
    });
    // Re-fit once the new, smaller graph has been laid out.
    requestAnimationFrame(viewport.fit);
    graphScrollRef.current?.scrollTo({
      left: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    requestAnimationFrame(() => searchTriggerRef.current?.focus());
  };

  // Measures every node once per pass, in layout space (offset*, never
  // getBoundingClientRect — see the rule in useGraphViewport.ts), and derives
  // the vertical placement, the edge paths and the content bounding box the
  // viewport needs, all from one set of reads.
  useLayoutEffect(() => {
    const stage = graphColumnsRef.current;
    if (!stage) return;
    const draw = () => {
      const positionInStage = (node: HTMLElement) => offsetWithin(node, stage);

      const columnEls = [...stage.querySelectorAll<HTMLElement>(".column-nodes")];
      if (columnEls.length !== columns.length) return;

      // Pass 1: sizes only. Heights are independent of the offsets this pass
      // writes back, so measuring them first keeps the whole thing one-shot —
      // no measure/apply/re-measure loop.
      const nodeEls = new Map<string, HTMLElement>();
      const heights = new Map<string, number>();
      for (const columnEl of columnEls) {
        for (const node of columnEl.querySelectorAll<HTMLElement>("[data-node]")) {
          const id = node.dataset.node;
          if (!id) continue;
          nodeEls.set(id, node);
          // The wrapper, not the button: the collapse badge hangs off it.
          heights.set(id, (node.parentElement ?? node).offsetHeight);
        }
      }

      const columnStyle = getComputedStyle(columnEls[0]);
      const gap = parseFloat(columnStyle.rowGap) || 14;

      // Pass 2: where each card belongs vertically. Stacking every column from
      // the top is what made the arrows unreadable — see assignNodeTops.
      const tops = assignNodeTops(columns, edges, heights, { gap });
      const offsets: Record<string, number> = {};
      const columnTops = columnEls.map(
        (el) => positionInStage(el).y + (parseFloat(getComputedStyle(el).paddingTop) || 0),
      );
      const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
      let maxX = 0;
      let maxY = 0;

      columns.forEach((column, columnIndex) => {
        column.forEach((story, index) => {
          const top = tops.get(story.id) ?? 0;
          const previous = index > 0 ? column[index - 1] : null;
          // Flow layout does the moving: the extra margin is whatever the gap
          // and the previous card do not already account for. Absolute
          // positioning here would leave the columns with no height of their
          // own and collapse the stage before the first measurement.
          const flowTop = previous
            ? (tops.get(previous.id) ?? 0) + (heights.get(previous.id) ?? 0) + gap
            : 0;
          offsets[story.id] = Math.max(0, Math.round(top - flowTop));

          const el = nodeEls.get(story.id);
          if (!el) return;
          const box = {
            x: positionInStage(el).x,
            // From the assigned top, not from offsetTop: the DOM still carries
            // the previous pass's margins at this point.
            y: columnTops[columnIndex] + top,
            w: el.offsetWidth,
            h: heights.get(story.id) ?? el.offsetHeight,
          };
          boxes.set(story.id, box);
          maxX = Math.max(maxX, box.x + box.w);
          maxY = Math.max(maxY, box.y + box.h);
        });
      });

      // Pass 3: edge ports. Every arrow used to leave and arrive at the exact
      // middle of a card, so eight edges into one node were eight lines landing
      // on one pixel. Fanning them across the card's face — ordered by the
      // other end's height, so the fan itself does not cross — is what makes an
      // arrow's start and end readable.
      const centreOf = (id: string) => {
        const box = boxes.get(id);
        return box ? box.y + box.h / 2 : 0;
      };
      const ports = (
        group: Map<string, GraphEdge[]>,
        other: (edge: GraphEdge) => string,
      ) => {
        const index = new Map<string, { index: number; count: number }>();
        for (const list of group.values()) {
          list.sort(
            (a, b) =>
              centreOf(other(a)) - centreOf(other(b)) ||
              other(a).localeCompare(other(b)),
          );
          list.forEach((edge, position) =>
            index.set(`${edge.from}:${edge.to}`, {
              index: position,
              count: list.length,
            }),
          );
        }
        return index;
      };
      const incoming = new Map<string, GraphEdge[]>();
      const outgoing = new Map<string, GraphEdge[]>();
      for (const edge of edges) {
        if (!incoming.has(edge.to)) incoming.set(edge.to, []);
        incoming.get(edge.to)!.push(edge);
        if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
        outgoing.get(edge.from)!.push(edge);
      }
      const inPorts = ports(incoming, (edge) => edge.from);
      const outPorts = ports(outgoing, (edge) => edge.to);
      const portY = (
        box: { y: number; h: number },
        port: { index: number; count: number } | undefined,
      ) => {
        if (!port || port.count < 2) return box.y + box.h / 2;
        // Never wider than the card, and never further apart than PORT_PITCH.
        const spread = Math.max(0, Math.min(box.h - 26, (port.count - 1) * PORT_PITCH));
        return box.y + box.h / 2 + (port.index / (port.count - 1) - 0.5) * spread;
      };

      const round = (value: number) => Math.round(value * 10) / 10;
      const next: Record<string, string> = {};
      for (const edge of edges) {
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        if (!from || !to) continue;
        const key = `${edge.from}:${edge.to}`;
        const x1 = round(from.x + from.w);
        const y1 = round(portY(from, outPorts.get(key)));
        // Stop short of the target so the arrowhead sits in open space rather
        // than being buried under the node. Matches refX on the marker.
        const x2 = round(to.x - ARROW_GAP);
        const y2 = round(portY(to, inPorts.get(key)));
        const bend = round(Math.max(24, (x2 - x1) * .45));
        next[key] = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      }

      const style = getComputedStyle(stage);
      contentBoxRef.current = {
        width: maxX + parseFloat(style.paddingRight || "0"),
        height: maxY + parseFloat(style.paddingBottom || "0"),
      };
      // Bail out when the geometry is unchanged. This pass runs on every
      // ResizeObserver tick and on fonts.ready; without the comparison each one
      // hands every <path> a brand-new `d` string and re-renders the minimap.
      setEdgePaths((previous) => {
        const keys = Object.keys(next);
        if (
          keys.length === Object.keys(previous).length &&
          keys.every((key) => previous[key] === next[key])
        ) {
          return previous;
        }
        return next;
      });
      // Same comparison, and for the same reason: writing these back changes
      // the layout, which fires the observer that runs this pass.
      setNodeOffsets((previous) => {
        const keys = Object.keys(offsets);
        if (
          keys.length === Object.keys(previous).length &&
          keys.every((key) => previous[key] === offsets[key])
        ) {
          return previous;
        }
        return offsets;
      });
      // Same measurements drive the minimap, so it costs no extra DOM reads.
      const rects = [...boxes.entries()].map(([id, rect]) => ({
        id,
        lane: byId.get(id)?.lane ?? "Infinity",
        ...rect,
      }));
      setNodeRects((previous) =>
        previous.length === rects.length &&
        previous.every((entry, index) => {
          const candidate = rects[index];
          return (
            entry.id === candidate.id &&
            entry.x === candidate.x &&
            entry.y === candidate.y &&
            entry.w === candidate.w &&
            entry.h === candidate.h
          );
        })
          ? previous
          : rects,
      );
    };
    // Synchronously first: this pass writes the cards' vertical offsets, so
    // deferring it to the next frame would paint one frame of the stacked
    // layout every time the map changes shape.
    draw();
    const frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    document.fonts.ready.then(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // `columns` is included because reordering moves nodes without changing the
    // edge set — without it the paths would point at stale positions.
  }, [edges, columns, graphNodes]);

  const openSearch = () => {
    setActiveResult(0);
    setSearchOpen(true);
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    setActiveResult(0);
    // Count the matches for the value being typed. Reading results.length here
    // would announce the previous render's count, always one keystroke stale.
    // Routed through searchStories so the announced number cannot drift from
    // what actually renders.
    const next = value
      ? searchStories(allStories, value, { kind }).length
      : results.length;
    setAnnouncement(`${next} matching stories.`);
  };

  const searchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      // Bounded by what is rendered, not by the match count: visibleHits is the
      // single truncation point, so these can never point past the last option.
      setActiveResult((index) => Math.min(index + 1, visibleHits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && visibleHits[activeResult]) {
      event.preventDefault();
      choose(visibleHits[activeResult].story.id);
    }
    // Tab is deliberately NOT handled here. It used to be preventDefaulted and
    // bounced back to the input, which made the ESC button and every result
    // unreachable while Shift+Tab escaped to the page behind. SearchPalette
    // cycles focus within the dialog instead.
  };

  return (
    <main className={`page page-${page}`}>
      <SplashScreen />
      {/* Everything behind the palette goes inert while it is open, so Tab and
          screen-reader browse mode cannot escape the dialog. The live region
          below stays outside: inert content is not announced. */}
      <div className="page-body" inert={searchOpen || undefined}>
      <AppHeader
        page={page}
        compact={headerCompact}
        searchTriggerRef={searchTriggerRef}
        onOpenSearch={openSearch}
      />

      {page === "home" && (
        <div id="nexus-main">
          <HomeHero
            chronologyCount={chronology.length}
            legacyCount={legacy.length}
            watched={watched}
            onOpenSearch={openSearch}
          />
        </div>
      )}

      {page !== "home" && <section className="workspace" id="nexus-main">
        <div className="workspace-head">
          <div>
            <div className="section-kicker">{view === "graph" ? "THE NEXUS MAP" : "THE SACRED TIMELINE"}</div>
            <h1 ref={workspaceHeadingRef} tabIndex={-1}>{view === "graph" ? <>Trace any story’s <span>path</span></> : <>Watch it <span>chronologically</span></>}</h1>
            <p>{view === "graph"
              // Same helper as the timeline meter, so the two pages never
              // report different completion for the same watched set.
              // The watched figures live in the dock now, so this line says
              // what the map is showing rather than repeating them.
              ? destination
                ? `${requiredCount} unwatched prerequisites · arrows flow toward your destination`
                : `Every story, ${graphNodes.length} titles · pick a destination to trace one path`
              : `${timelineResults.length} canonical MCU stops · branch universes stay in the graph`}</p>
          </div>
          <div className="workspace-controls">
            {view === "timeline" && (
              <div className="order-switch" aria-label="Timeline ordering">
                <button
                  aria-pressed={timelineMode === "release"}
                  className={timelineMode === "release" ? "active" : ""}
                  onClick={() => changeTimelineMode("release")}
                >
                  Release chronology
                </button>
                <button
                  aria-pressed={timelineMode === "story"}
                  className={timelineMode === "story" ? "active" : ""}
                  onClick={() => changeTimelineMode("story")}
                >
                  Story chronology
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
              <span className="lane-key">
                {(["Infinity", "Multiverse", "Street", "Legacy", "Future"] as const).map((lane) => (
                  <i key={lane} data-lane={lane}>{lane}</i>
                ))}
              </span>
              <div className="graph-actions">
                <button
                  aria-pressed={hideWatched}
                  className={hideWatched ? "toggle-on" : ""}
                  onClick={() => setHideWatched((on) => !on)}
                >
                  Hide watched
                </button>
                <button
                  aria-pressed={showSpine}
                  className={showSpine ? "toggle-on" : ""}
                  onClick={() => setShowSpine((on) => !on)}
                  title="Highlight the shortest required chain. Not a watchlist — the full set of prerequisites is larger."
                >
                  Spine
                </button>
                {collapsed.size > 0 && (
                  <button onClick={() => setCollapsed(new Set())}>Expand all</button>
                )}
                {destinationId !== ALL_STORIES_ID && (
                  <button className="reset-path" onClick={resetPath}>↺ Show everything</button>
                )}
                <button onClick={openSearch}>
                  {destination ? "Change destination ↗" : "Pick a destination ↗"}
                </button>
                {/* Viewport controls sit beside the canvas rather than floating
                    over it, so they never cover a node. */}
                <div className="graph-toolbar" role="group" aria-label="Graph viewport controls">
                  <button onClick={() => viewport.zoomBy(-.1)} disabled={!viewport.canZoomOut} aria-label="Zoom out">−</button>
                  <output aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
                  <button onClick={() => viewport.zoomBy(.1)} disabled={!viewport.canZoomIn} aria-label="Zoom in">+</button>
                  <button onClick={viewport.fit}>Fit</button>
                  <button
                    // Named so the phone breakpoint can hide this specific
                    // control instead of "whichever button is last".
                    data-toolbar="minimap"
                    aria-pressed={showMinimap}
                    className={showMinimap ? "toggle-on" : ""}
                    onClick={() => setShowMinimap((on) => !on)}
                  >
                    Map
                  </button>
                </div>
              </div>
            </div>
            <div className="graph-shell">
              <div className="graph-map">
              <div
                className={`graph-scroll ${viewport.isPanning ? "is-panning" : ""}`}
                ref={graphScrollRef}
                tabIndex={0}
                aria-label={`Dependency map${destination ? `, showing the path to ${destination.title}` : ", showing every story"}. Drag or use the arrow keys to pan, ctrl-scroll or pinch to zoom. Tab into the map, then use the arrow keys to move between titles.`}
                {...viewport.bindings}
                onKeyDown={(event) => {
                  // Only pan when the canvas itself has focus. Arrow keys inside
                  // the node grid move the roving tab stop, and that handler
                  // stops propagation — this guard covers anything else nested
                  // here that might want the arrows too.
                  if (event.target !== event.currentTarget) return;
                  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const horizontal = event.key === "ArrowLeft" ? -120 : event.key === "ArrowRight" ? 120 : 0;
                  const vertical = event.key === "ArrowUp" ? -90 : event.key === "ArrowDown" ? 90 : 0;
                  graphScrollRef.current?.scrollBy({ left: horizontal, top: vertical, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                }}
              >
                <div
                  className="graph-columns"
                  ref={graphColumnsRef}
                  // --graph-zoom rides alongside zoom so edge strokes and their
                  // arrowheads can be scale-compensated together; they must never
                  // drift apart, hence the single style object.
                  style={{ zoom, "--graph-zoom": zoom } as React.CSSProperties}
                >
                  <svg className="graph-edges" aria-hidden="true" width="100%" height="100%">
                    <defs>
                      {/* One marker per state: markers are shared instances, so a
                          path cannot recolour its own head via CSS. */}
                      {["base", "active", "muted"].map((variant) => (
                        <marker
                          key={variant}
                          id={`nx-arrow-${variant}`}
                          className={`nx-arrow nx-arrow-${variant}`}
                          viewBox="0 0 10 10"
                          refX="9"
                          refY="5"
                          markerWidth="5"
                          markerHeight="5"
                          orient="auto-start-reverse"
                        >
                          <path d="M0 0 L10 5 L0 10 Z" />
                        </marker>
                      ))}
                      {/* A dot at the tail. With several arrows leaving one
                          card, the head alone tells you where a line ends but
                          not which card it started from. */}
                      {["base", "active", "muted"].map((variant) => (
                        <marker
                          key={`dot-${variant}`}
                          id={`nx-dot-${variant}`}
                          className={`nx-dot nx-dot-${variant}`}
                          viewBox="0 0 6 6"
                          refX="3"
                          refY="3"
                          markerWidth="3"
                          markerHeight="3"
                        >
                          <circle cx="3" cy="3" r="2.6" />
                        </marker>
                      ))}
                    </defs>
                    {renderedEdges.map((edge) => <path
                      key={edge.key}
                      // Located by the hover handler so the "hovered" class can
                      // be toggled without a render.
                      data-edge={edge.key}
                      d={edgePaths[edge.key] ?? ""}
                      markerStart={`url(#nx-dot-${edge.state || "base"})`}
                      markerEnd={`url(#nx-arrow-${edge.state || "base"})`}
                      className={`${edge.state} ${edge.filtered ? "filtered-edge" : ""}`}
                    />)}
                  </svg>
                  {columns.map((column, columnIndex) => {
                    const label = columnLabel(column, columnIndex, maxDepth, !!destination);
                    return (
                    <div className="graph-column" key={columnIndex}>
                      <div className="column-label">
                        <b>{label.title}</b>
                        <i>{label.detail}</i>
                      </div>
                      {/* One delegated handler, not 95. It stops propagation so
                          the arrow keys do not also reach .graph-scroll's pan
                          handler and scroll the canvas out from under the
                          moving focus. */}
                      <div
                        className="column-nodes"
                        onKeyDown={(event) => moveRoving(event, columnIndex)}
                      >
                        {column.map((story) => (
                          <StoryNode
                            key={story.id}
                            story={story}
                            className={`story-node ${story.optional ? "optional" : ""} ${watched.has(story.id) ? "watched" : ""} ${story.id === destination?.id ? "destination" : ""} ${story.id === inspected.id ? "inspected" : ""} ${activeHighlightId ? (highlighted.has(story.id) ? "highlighted" : "unrelated") : ""} ${kind !== "All" && story.kind !== kind && story.id !== inspected.id ? "filtered" : ""} ${spine ? (spine.has(story.id) ? "on-spine" : "off-spine") : ""}`}
                            summary={nodeSummaries.get(story.id) ?? ""}
                            offsetTop={nodeOffsets[story.id] ?? 0}
                            // Roving tabindex: the grid is a single tab stop and
                            // the arrow keys move within it. 95 sequential tab
                            // stops before the Inspector is not navigation.
                            tabIndex={story.id === activeRovingId ? 0 : -1}
                            isWatched={watched.has(story.id)}
                            // Collapse only means something when the map is a walk back from
                            // one destination; with everything shown, a folded node's
                            // prerequisites are still on screen as roots of their own.
                            collapsible={!!destination && story.deps.length > 0 && story.id !== destination.id}
                            isCollapsed={collapsed.has(story.id)}
                            hiddenCount={disclosure.hiddenCounts.get(story.id) ?? 0}
                            deepCutCount={disclosure.deepCutCounts.get(story.id) ?? 0}
                            onInspect={inspectStory}
                            onPreview={setPreviewedId}
                            onToggleCollapsed={toggleCollapsed}
                          />
                        ))}
                      </div>
                    </div>
                    );
                  })}
                  {/* Hit layer. The columns sit above .graph-edges (z-index 1 vs
                      0), so the visible paths cannot be hovered. This duplicate
                      renders above them with fat transparent strokes; the svg is
                      pointer-events:none so only the strokes themselves catch
                      the cursor and node clicks pass straight through. */}
                  <svg className="graph-edges graph-edges-hit" aria-hidden="true" width="100%" height="100%">
                    {renderedEdges.map((edge) => <path
                      key={edge.key}
                      d={edgePaths[edge.key] ?? ""}
                      onMouseEnter={(event) => showEdgeTooltip(
                        edge.key,
                        byId.get(edge.from)?.title ?? edge.from,
                        byId.get(edge.to)?.title ?? edge.to,
                        event.clientX,
                        event.clientY,
                      )}
                      onMouseLeave={hideEdgeTooltip}
                    />)}
                  </svg>
                </div>
              </div>
              {/* The canvas is SVG geometry and is hidden from assistive tech,
                  so the same graph is also emitted here as a nested list. A
                  screen-reader user can read the answer end to end instead of
                  reconstructing it by tabbing 95 nodes. */}
              <nav className="sr-only" aria-label="Dependency map outline">
                <ol>
                  {outline.map((group, index) => (
                    <li key={index}>
                      {group.title}{group.detail ? `, ${group.detail}` : ""}
                      <ol>
                        {group.items.map((item) => (
                          <li key={item.id}>
                            {item.title}.{" "}
                            {item.requires.length
                              ? `Requires ${item.requires.join(", ")}.`
                              : "Origin point."}{" "}
                            {item.unlocks.length ? `Sets up ${item.unlocks.join(", ")}.` : ""}
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ol>
              </nav>
              {showMinimap && <GraphMinimap
                nodes={nodeRects}
                contentBox={contentBoxRef}
                zoom={zoom}
                scrollRef={graphScrollRef}
                destinationId={destination?.id ?? null}
              />}
              </div>
              {/* Fixed, and outside .graph-columns: anything inside the stage
                  has its text scaled by `zoom`, and .graph-map clips overflow.
                  Always mounted and driven by a ref — mounting it from state
                  would re-render the whole map on every edge hover. */}
              <div className="edge-tooltip" role="tooltip" ref={edgeTooltipRef}>
                <b ref={edgeFromRef} /> sets up <b ref={edgeToRef} />
              </div>
              {/* Its own boundary: a bad story record should cost the detail
                  panel, not the whole map. */}
              <ErrorBoundary label="This story's details could not be shown.">
              <Inspector
                key={inspected.id}
                story={inspected}
                destination={destination}
                chronology={chronology}
                byId={byId}
                edges={edges}
                visibleIds={disclosure.ids}
                watched={watched}
                totalPrerequisites={metrics.total}
                takeFocus={inspectorTakesFocus}
                onChoose={choose}
                onInspect={inspectStory}
                onToggleWatched={toggleWatched}
              />
              </ErrorBoundary>
            </div>
          </>
        ) : (
          <>
            <TimelineView
              stories={timelineResults}
              timelineMode={timelineMode}
              watched={watched}
              kind={kind}
              showOptional={showOptional}
              shellRef={timelineRef}
              hrefFor={hrefFor}
              onToggleWatched={toggleWatched}
              onChoose={choose}
              onResetFilters={() => {
                setKind("All");
                setShowOptional(true);
                setQuery("");
                setAnnouncement("Filters reset.");
              }}
            />
            {/* Fixed to the viewport, so it is rendered last and owns no
                layout in the flow above it. The graph has its own toolbar and
                no scroll position worth reporting, so the dock is the
                chronology's alone. */}
            <StatusDock
              total={progress.total}
              watchedCount={progress.watched}
              percent={progress.percent}
              positionRef={timelinePositionRef}
              lastWatched={dockLastWatched}
              nextUnwatched={dockNextUnwatched}
              onJump={revealStory}
              onBackToTop={backToTop}
            />
          </>
        )}
      </section>}

      {page === "home" && <HomeMethod />}

      {page === "home" && <HomeFooter />}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      {searchOpen && (
        <SearchPalette
          query={query}
          hits={visibleHits}
          total={searchHits.length}
          kind={kind}
          activeResult={activeResult}
          inputRef={searchInputRef}
          onQueryChange={changeQuery}
          onActiveResultChange={setActiveResult}
          onKeyDown={searchKeyDown}
          onChoose={choose}
          onClearKind={() => {
            setKind("All");
            setAnnouncement("Type filter cleared.");
          }}
          onClose={closeSearch}
        />
      )}
    </main>
  );
}

export default function MarvelNexus(props: { page?: NexusPage }) {
  return (
    <ErrorBoundary label="The Nexus could not be drawn.">
      <NexusApp {...props} />
    </ErrorBoundary>
  );
}
