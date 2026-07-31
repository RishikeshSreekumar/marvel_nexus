import type { Story, TimelineMode } from "../lib/graph";
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
  shellRef,
  onToggleWatched,
  onChoose,
}: {
  stories: Story[];
  timelineMode: TimelineMode;
  watched: Set<string>;
  shellRef: React.RefObject<HTMLDivElement | null>;
  onToggleWatched: (id: string) => void;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="timeline-shell" ref={shellRef}>
      <div className="timeline-spine" />
      <div className="timeline-progress" />
      {stories.map((story, index) => (
        <article
          className={`timeline-item ${watched.has(story.id) ? "is-watched" : ""}`}
          key={story.id}
          data-reveal
          style={{
            "--reveal-delay": `${Math.min(index % 6, 5) * 38}ms`,
            viewTransitionName: `timeline-${story.id}`,
          } as React.CSSProperties}
        >
          <button
            className="timeline-check"
            onClick={() => onToggleWatched(story.id)}
            aria-pressed={watched.has(story.id)}
            aria-label={`Mark ${story.title} watched`}
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
          <div className="timeline-card" onClick={() => onChoose(story.id)}>
            <StoryArtwork story={story} variant="poster" />
            <div className="timeline-card-copy">
              <div>
                <span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span>
                {story.optional && <span className="deep-badge">DEEP CUT</span>}
                {story.upcoming && <span className="future-badge">UPCOMING</span>}
              </div>
              <h3>{story.title}</h3>
              <p>{story.note}</p>
              <span className="dependency-count">
                {story.deps.length ? `${story.deps.length} direct dependencies` : "Origin point"}
                {/* The label goes visually, not from the accessibility tree. */}
                <i aria-label={`Open ${story.title} in the dependency graph`} role="img">
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
