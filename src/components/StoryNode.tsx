import { memo } from "react";
import type { Story } from "../lib/graph";
import StoryArtwork from "./StoryArtwork";

/**
 * One node on the dependency map.
 *
 * Every prop is a primitive or a stable callback so `React.memo` can do a
 * useful shallow compare — hovering one node must not re-render the other 94.
 *
 * The collapse control is a sibling of the node button, not a child: an
 * interactive element inside a <button> is invalid HTML and several screen
 * readers flatten it out of the accessibility tree entirely.
 */
function StoryNode({
  story,
  className,
  summary,
  offsetTop,
  tabIndex,
  collapsible,
  isWatched,
  isCollapsed,
  hiddenCount,
  deepCutCount,
  onInspect,
  onPreview,
  onToggleCollapsed,
}: {
  story: Story;
  className: string;
  summary: string;
  /** Extra space above the card, from the graph's vertical placement pass. */
  offsetTop: number;
  tabIndex: number;
  collapsible: boolean;
  isWatched: boolean;
  isCollapsed: boolean;
  hiddenCount: number;
  /** Direct prerequisites the deep-cut filter is currently withholding. */
  deepCutCount: number;
  /** `fromKeyboard` decides whether the Inspector is allowed to pull focus. */
  onInspect: (id: string, fromKeyboard: boolean) => void;
  onPreview: (id: string | null) => void;
  onToggleCollapsed: (id: string) => void;
}) {
  return (
    <div className="story-node-wrap" style={{ marginTop: offsetTop }}>
      <button
        data-node={story.id}
        data-lane={story.lane}
        className={className}
        tabIndex={tabIndex}
        aria-describedby={`node-summary-${story.id}`}
        // detail === 0 means the click came from Enter/Space, not a pointer.
        onClick={(event) => onInspect(story.id, event.detail === 0)}
        onMouseEnter={() => onPreview(story.id)}
        onMouseLeave={() => onPreview(null)}
        onFocus={() => onPreview(story.id)}
        onBlur={() => onPreview(null)}
        style={{ viewTransitionName: `story-${story.id}` }}
      >
        <StoryArtwork story={story} variant="backdrop" />
        <span className="node-top"><b>{story.kind}</b><i>{story.storyYearLabel}</i></span>
        <strong>{story.title}</strong>
        <span className="node-bottom">
          {story.lane}
          {deepCutCount > 0 && !isWatched && (
            <em
              className="node-deep-cut"
              title={`${deepCutCount} deep-cut prerequisite${deepCutCount === 1 ? "" : "s"} hidden. Turn on “Include deep cuts” to see ${deepCutCount === 1 ? "it" : "them"}.`}
            >
              +{deepCutCount}
            </em>
          )}
          <i>{isWatched ? "✓" : story.deps.length || "ORIGIN"}</i>
        </span>
      </button>
      {/* The arrows are drawn as SVG and hidden from assistive tech, so this
          sentence is the only place a screen reader learns what connects to
          what. */}
      <span className="sr-only" id={`node-summary-${story.id}`}>{summary}</span>
      {collapsible && (
        <button
          type="button"
          className="node-collapse"
          aria-pressed={isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} prerequisites of ${story.title}`}
          onClick={() => onToggleCollapsed(story.id)}
        >
          {isCollapsed ? `+${hiddenCount}` : "−"}
        </button>
      )}
    </div>
  );
}

/**
 * Safe to memoise: node *size* is what the edge measurement depends on, and
 * that follows only from the title, which never changes. Everything the memo
 * can skip is purely visual state on other nodes.
 */
export default memo(StoryNode);
