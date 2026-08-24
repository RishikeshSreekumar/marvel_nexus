import type { KindFilter, Story, TimelineMode } from "../lib/graph";
import { CheckIcon, GraphIcon } from "./icons";
import StoryArtwork from "./StoryArtwork";

/**
 * The chronology list. Scroll progress and the active-row highlight are driven
 * by the caller, which owns the observer and writes --timeline-progress onto
 * the shell.
 */
export default function TimelineView({
  stories,
  timelineMode,
  watched,
  kind,
  showOptional,
  shellRef,
  hrefFor,
  onToggleWatched,
  onChoose,
  onResetFilters,
}: {
  stories: Story[];
  timelineMode: TimelineMode;
  watched: Set<string>;
  kind: KindFilter;
  showOptional: boolean;
  shellRef: React.RefObject<HTMLDivElement | null>;
  /** Real URL for the story's graph view, so the card can be a true link. */
  hrefFor: (id: string) => string;
  onToggleWatched: (id: string) => void;
  onChoose: (id: string) => void;
  onResetFilters: () => void;
}) {
  if (stories.length === 0) {
    return (
      <div className="timeline-shell timeline-empty" ref={shellRef}>
        <p>No titles match the current filters.</p>
        <p>
          {kind !== "All" && <>The <b>{kind}</b> filter is active. </>}
          {!showOptional && <>Deep cuts are hidden. </>}
        </p>
        <button onClick={onResetFilters}>Reset filters</button>
      </div>
    );
  }

  return (
    <div className="timeline-shell" ref={shellRef}>
      <div className="timeline-spine" />
      <div className="timeline-progress" />
      {stories.map((story, index) => (
        <article
          className={`timeline-item ${watched.has(story.id) ? "is-watched" : ""}`}
          key={story.id}
          data-reveal
          // Read by the scroll pass to write the "34 / 78" position readout
          // without putting per-frame scroll state into React.
          data-index={index}
          // The dock's jump targets find their row through this.
          data-story={story.id}
          style={{
            "--reveal-delay": `${Math.min(index % 6, 5) * 38}ms`,
            viewTransitionName: `timeline-${story.id}`,
          } as React.CSSProperties}
        >
          <button
            className="timeline-check"
            onClick={() => onToggleWatched(story.id)}
            aria-pressed={watched.has(story.id)}
            aria-label={`${watched.has(story.id) ? "Unmark" : "Mark"} ${story.title} watched`}
          >
            {watched.has(story.id) && <CheckIcon />}
          </button>
          {/* Order is fixed at Story-then-Released so rows do not jump when the
              mode is toggled; only the highlight moves. */}
          <div className="timeline-dates">
            <span className={timelineMode === "story" ? "active" : ""}>
              <small>Story</small>{story.storyYearLabel}
            </span>
            <span className={timelineMode === "release" ? "active" : ""}>
              <small>Released</small>{story.releaseYear}
            </span>
          </div>
          <div className="timeline-card">
            <StoryArtwork story={story} variant="poster" />
            <div className="timeline-card-copy">
              <div>
                <span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span>
                {story.optional && <span className="deep-badge">DEEP CUT</span>}
                {story.upcoming && <span className="future-badge">UPCOMING</span>}
              </div>
              {/* A real link, not a div with onClick: this is the only way to
                  open a title from the timeline, so it has to be focusable,
                  and being an anchor makes middle-click and open-in-new-tab
                  work for free. The ::after overlay keeps the whole card
                  clickable without nesting the watched toggle inside it. */}
              <h3>
                <a
                  className="timeline-card-link"
                  href={hrefFor(story.id)}
                  onClick={(event) => {
                    // Let the browser handle modified clicks so new-tab works.
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    event.preventDefault();
                    onChoose(story.id);
                  }}
                >
                  {story.title}
                </a>
              </h3>
              <p>{story.note}</p>
              <span className="dependency-count">
                {story.deps.length ? `${story.deps.length} direct dependencies` : "Origin point"}
                {/* Decorative: the link above already names the action. */}
                <i aria-hidden="true">
                  <GraphIcon />
                </i>
              </span>
            </div>
          </div>
          <div className="timeline-number">{String(index + 1).padStart(2, "0")}</div>
        </article>
      ))}
    </div>
  );
}
