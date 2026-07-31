import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ancestorIds,
  DEFAULT_SHOW_OPTIONAL,
  DEFAULT_TIMELINE_MODE,
  columnLabel,
  criticalPath,
  dependencyEdges,
  visibleGraph,
  FEATURED_STORY_ID,
  layerStories,
  orderColumns,
  graphMetrics,
  parseUrlState,
  resetGraphState,
  serializeUrlState,
  sortTimeline,
  type Kind,
  type TimelineMode,
  parseWatchedState,
  serializeWatchedState,
} from "../lib/graph";
import {
  allStories,
  byId,
  chronology,
  legacy,
} from "../lib/stories";
import { useGraphViewport, type ContentBox } from "../lib/useGraphViewport";
import AppHeader from "./AppHeader";
import { HomeFooter, HomeHero, HomeMethod } from "./HomeSections";
import Inspector from "./Inspector";
import GraphMinimap, { type MinimapNode } from "./GraphMinimap";
import StoryArtwork from "./StoryArtwork";
import SearchPalette, { MAX_RESULTS } from "./SearchPalette";
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

export default function MarvelNexus({ page = "home" }: { page?: NexusPage }) {
  const initial = typeof window === "undefined"
    ? { destinationId: FEATURED_STORY_ID, view: page === "timeline" ? "timeline" as const : "graph" as const, timelineMode: DEFAULT_TIMELINE_MODE, kind: "All" as const, showOptional: DEFAULT_SHOW_OPTIONAL }
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
  const contentBoxRef = useRef<ContentBox>({ width: 0, height: 0 });
  const [nodeRects, setNodeRects] = useState<MinimapNode[]>([]);
  // View-only state: deliberately not in the URL, so shared links keep
  // round-tripping to a clean address.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hideWatched, setHideWatched] = useState(false);
  const [showSpine, setShowSpine] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<
    { key: string; from: string; to: string; x: number; y: number } | null
  >(null);
  const [edgePaths, setEdgePaths] = useState<Record<string, string>>({});
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
          // Attribute, not a class — same reason as data-revealed above.
          item.removeAttribute("data-active");
        });
      (closest as HTMLElement | null)?.setAttribute("data-active", "");
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

  const toggleCollapsed = (id: string) => {
    transition(() =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    );
  };

  const toggleWatched = (id: string) => {
    setWatched((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("marvel-nexus-watched", serializeWatchedState(next));
      return next;
    });
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
    () => (showSpine ? new Set(criticalPath(destination.id, byId)) : null),
    [showSpine, destination.id],
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
  // Layer by longest-path depth, then reorder within each column to cut edge
  // crossings. Memoised because reordering is O(edges^2) per adjacent pair.
  const columns = useMemo(
    () => orderColumns(layerStories(graphNodes, byId), edges),
    [graphNodes, edges],
  );
  const maxDepth = columns.length - 1;

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
    requestAnimationFrame(() => searchTriggerRef.current?.focus());
  };

  // Measures every node once per pass, in layout space (offset*, never
  // getBoundingClientRect — see the rule in useGraphViewport.ts), and derives
  // both the edge paths and the content bounding box the viewport needs.
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

      let maxX = 0;
      let maxY = 0;
      const seen = new Map<string, { x: number; y: number; w: number; h: number }>();
      const measure = (id: string) => {
        const cached = seen.get(id);
        if (cached) return cached;
        const node = stage.querySelector<HTMLElement>(`[data-node="${id}"]`);
        if (!node) return null;
        const { x, y } = positionInStage(node);
        const rect = { x, y, w: node.offsetWidth, h: node.offsetHeight };
        seen.set(id, rect);
        maxX = Math.max(maxX, rect.x + rect.w);
        maxY = Math.max(maxY, rect.y + rect.h);
        return rect;
      };

      for (const edge of edges) {
        const from = measure(edge.from);
        const to = measure(edge.to);
        if (!from || !to) continue;
        const x1 = from.x + from.w;
        const y1 = from.y + from.h / 2;
        // Stop short of the target so the arrowhead sits in open space rather
        // than being buried under the node. Matches refX on the marker.
        const x2 = to.x - ARROW_GAP;
        const y2 = to.y + to.h / 2;
        const bend = Math.max(24, (x2 - x1) * .45);
        next[`${edge.from}:${edge.to}`] = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      }

      // Nodes with no edges still contribute to the box.
      for (const story of graphNodes) measure(story.id);

      const style = getComputedStyle(stage);
      contentBoxRef.current = {
        width: maxX + parseFloat(style.paddingRight || "0"),
        height: maxY + parseFloat(style.paddingBottom || "0"),
      };
      setEdgePaths(next);
      // Same measurements drive the minimap, so it costs no extra DOM reads.
      setNodeRects(
        [...seen.entries()].map(([id, rect]) => ({
          id,
          lane: byId.get(id)?.lane ?? "Infinity",
          ...rect,
        })),
      );
    };
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
    const next = allStories.filter(
      (story) =>
        story.title.toLowerCase().includes(value.toLowerCase()) &&
        (kind === "All" || story.kind === kind),
    ).length;
    setAnnouncement(`${next} matching stories.`);
  };

  const searchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((index) => Math.min(index + 1, Math.min(results.length, MAX_RESULTS) - 1));
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
      <AppHeader
        page={page}
        compact={headerCompact}
        searchTriggerRef={searchTriggerRef}
        onOpenSearch={openSearch}
      />

      {page === "home" && (
        <HomeHero
          chronologyCount={chronology.length}
          legacyCount={legacy.length}
          totalCount={allStories.length}
          onOpenSearch={openSearch}
        />
      )}

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
                {destinationId !== FEATURED_STORY_ID && (
                  <button className="reset-path" onClick={resetPath}>↺ Reset path</button>
                )}
                <button onClick={openSearch}>Change destination ↗</button>
                {/* Viewport controls sit beside the canvas rather than floating
                    over it, so they never cover a node. */}
                <div className="graph-toolbar" role="group" aria-label="Graph viewport controls">
                  <button onClick={() => viewport.zoomBy(-.1)} disabled={!viewport.canZoomOut} aria-label="Zoom out">−</button>
                  <output aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
                  <button onClick={() => viewport.zoomBy(.1)} disabled={!viewport.canZoomIn} aria-label="Zoom in">+</button>
                  <button onClick={viewport.fit}>Fit</button>
                  <button
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
                aria-label="Dependency map. Drag to pan, ctrl or pinch and scroll to zoom, arrow keys to pan."
                {...viewport.bindings}
                onKeyDown={(event) => {
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
                    </defs>
                    {renderedEdges.map((edge) => <path
                      key={edge.key}
                      d={edgePaths[edge.key] ?? ""}
                      markerEnd={`url(#nx-arrow-${edge.state || "base"})`}
                      className={`${edge.state} ${edge.filtered ? "filtered-edge" : ""} ${hoveredEdge?.key === edge.key ? "hovered" : ""}`}
                    />)}
                  </svg>
                  {columns.map((column, columnIndex) => {
                    const label = columnLabel(column, columnIndex, maxDepth);
                    return (
                    <div className="graph-column" key={columnIndex}>
                      <div className="column-label">
                        <b>{label.title}</b>
                        <i>{label.detail}</i>
                      </div>
                      <div className="column-nodes">
                        {column.map((story) => (
                          <button
                            key={story.id}
                            data-node={story.id}
                            data-lane={story.lane}
                            className={`story-node ${story.optional ? "optional" : ""} ${watched.has(story.id) ? "watched" : ""} ${story.id === destination.id ? "destination" : ""} ${story.id === inspected.id ? "inspected" : ""} ${activeHighlightId ? (highlighted.has(story.id) ? "highlighted" : "unrelated") : ""} ${kind !== "All" && story.kind !== kind && story.id !== inspected.id ? "filtered" : ""} ${spine ? (spine.has(story.id) ? "on-spine" : "off-spine") : ""}`}
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
                            {story.deps.length > 0 && story.id !== destination.id && (
                              // A span, not a button: nesting interactive
                              // elements is invalid, so this rides the parent's
                              // click and stops it reaching inspectStory.
                              <span
                                role="button"
                                tabIndex={0}
                                className="node-collapse"
                                aria-pressed={collapsed.has(story.id)}
                                aria-label={`${collapsed.has(story.id) ? "Expand" : "Collapse"} prerequisites of ${story.title}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleCollapsed(story.id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  toggleCollapsed(story.id);
                                }}
                              >
                                {collapsed.has(story.id)
                                  ? `+${disclosure.hiddenCounts.get(story.id) ?? 0}`
                                  : "−"}
                              </span>
                            )}
                          </button>
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
                      onMouseEnter={(event) => setHoveredEdge({
                        key: edge.key,
                        from: byId.get(edge.from)?.title ?? edge.from,
                        to: byId.get(edge.to)?.title ?? edge.to,
                        x: event.clientX,
                        y: event.clientY,
                      })}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />)}
                  </svg>
                </div>
              </div>
              {showMinimap && <GraphMinimap
                nodes={nodeRects}
                contentBox={contentBoxRef}
                zoom={zoom}
                scrollRef={graphScrollRef}
                destinationId={destination.id}
              />}
              </div>
              {hoveredEdge && (
                // Fixed, and outside .graph-columns: anything inside the stage
                // has its text scaled by `zoom`, and .graph-map clips overflow.
                <div
                  className="edge-tooltip"
                  role="tooltip"
                  style={{ left: hoveredEdge.x, top: hoveredEdge.y }}
                >
                  <b>{hoveredEdge.from}</b> sets up <b>{hoveredEdge.to}</b>
                </div>
              )}
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
                onChoose={choose}
                onInspect={inspectStory}
                onToggleWatched={toggleWatched}
              />
            </div>
          </>
        ) : (
          <TimelineView
            stories={timelineResults}
            timelineMode={timelineMode}
            watched={watched}
            shellRef={timelineRef}
            onToggleWatched={toggleWatched}
            onChoose={choose}
          />
        )}
      </section>}

      {page === "home" && <HomeMethod />}

      {page === "home" && <HomeFooter />}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      {searchOpen && (
        <SearchPalette
          query={query}
          results={results}
          activeResult={activeResult}
          inputRef={searchInputRef}
          onQueryChange={changeQuery}
          onActiveResultChange={setActiveResult}
          onKeyDown={searchKeyDown}
          onChoose={choose}
          onClose={closeSearch}
        />
      )}
    </main>
  );
}
