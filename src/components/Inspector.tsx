import { useEffect, useRef, useState } from "react";
import { charactersInStory } from "../lib/characters";
import { nodeRelations, type GraphEdge, type Story } from "../lib/graph";
import StoryArtwork from "./StoryArtwork";

/** Leads only until asked; Endgame alone has sixty-odd named characters. */
const CAST_PREVIEW = 12;

/**
 * Detail panel for the inspected story.
 *
 * The caller keys this on the story id to force a remount, which is what
 * replays the inspector-in animation — do not drop that key.
 */
export default function Inspector({
  story,
  destination,
  chronology,
  byId,
  edges,
  visibleIds,
  watched,
  totalPrerequisites,
  takeFocus,
  onChoose,
  onInspect,
  onToggleWatched,
  onClose,
}: {
  story: Story;
  /** null when the map shows every story instead of one destination's path. */
  destination: Story | null;
  chronology: readonly Story[];
  byId: Map<string, Story>;
  edges: GraphEdge[];
  visibleIds: Set<string>;
  watched: Set<string>;
  totalPrerequisites: number;
  /**
   * Whether this panel should pull focus on mount. Only true when the inspect
   * came from the keyboard: stealing focus on a mouse click would eject the
   * user from the graph mid-traversal.
   */
  takeFocus: boolean;
  onChoose: (id: string) => void;
  onInspect: (id: string) => void;
  onToggleWatched: (id: string) => void;
  /** Lowers the phone bottom sheet. The control is hidden on wider screens. */
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const position = chronology.findIndex((entry) => entry.id === story.id);
  // One derivation shared with the graph nodes' screen-reader descriptions, so
  // the two can never disagree about what a story is connected to.
  const cast = charactersInStory(story.id);
  const [castOpenFor, setCastOpenFor] = useState<string | null>(null);
  const castOpen = castOpenFor === story.id;
  const shownCast = castOpen ? cast : cast.slice(0, CAST_PREVIEW);
  /** Swipe-down on the handle lowers the sheet. */
  const dragRef = useRef<number | null>(null);
  const { requires, unlocks: requiredBy } = nodeRelations(
    story.id,
    edges,
    visibleIds,
  );

  // Fires per remount, because the caller keys this component on the story id.
  useEffect(() => {
    if (takeFocus) panelRef.current?.focus({ preventScroll: true });
  }, [takeFocus]);

  return (
    <aside
      className="inspector"
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={`Details: ${story.title}`}
      style={{ viewTransitionName: "story-inspector" }}
    >
      <div
        className="sheet-handle"
        onTouchStart={(event) => { dragRef.current = event.touches[0]?.clientY ?? null; }}
        onTouchMove={(event) => {
          const start = dragRef.current;
          const y = event.touches[0]?.clientY;
          if (start !== null && y !== undefined && y - start > 56) {
            dragRef.current = null;
            onClose();
          }
        }}
        onTouchEnd={() => { dragRef.current = null; }}
      >
        <i aria-hidden="true" />
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <StoryArtwork story={story} variant="backdrop" />
      <div className="inspector-top">
        <span className={`kind-badge ${story.kind.toLowerCase()}`}>{story.kind}</span>
        <span>{story.releaseYear} RELEASE</span>
      </div>
      <span className="index-label">Timeline position</span>
      <div className="inspector-index">
        {position >= 0 ? String(position + 1).padStart(2, "0") : "BR"}
      </div>
      <h3>{story.title}</h3>
      <p>{story.note}</p>
      <dl>
        <div>
          <dt>Story year</dt>
          <dd>{story.storyYearLabel}{story.editorialPlacement ? " †" : ""}</dd>
        </div>
        <div><dt>Release year</dt><dd>{story.releaseYear}</dd></div>
        <div><dt>Branch</dt><dd>{story.lane} Saga</dd></div>
        <div><dt>Direct links</dt><dd>{story.deps.length}</dd></div>
        <div>
          <dt>{destination ? "Total path" : "On the map"}</dt>
          <dd>{totalPrerequisites} {destination ? "prerequisites" : "other titles"}</dd>
        </div>
      </dl>
      {destination && story.id === destination.id ? (
        <p className="destination-note">
          {totalPrerequisites === 0
            ? `${destination.title} is an origin point — nothing is required. Start here.`
            : "This is your destination. Watched progress applies to prerequisites."}
        </p>
      ) : (
        <>
          <button className="destination-button" onClick={() => onChoose(story.id)}>
            Set as destination
          </button>
          <button
            className={`watch-button ${watched.has(story.id) ? "done" : ""}`}
            onClick={() => onToggleWatched(story.id)}
          >
            {watched.has(story.id) ? "✓ Watched" : "+ Mark as watched"}
          </button>
        </>
      )}
      {requires.length > 0 && (
        <div className="direct-list">
          <span>DIRECTLY REQUIRES</span>
          {requires.map((id) => (
            <button key={id} onClick={() => onInspect(id)}>
              {byId.get(id)?.title} <i>Inspect</i>
            </button>
          ))}
        </div>
      )}
      {requiredBy.length > 0 && (
        <div className="direct-list">
          <span>ON THIS MAP BECAUSE OF</span>
          {requiredBy.map((id) => (
            <button key={id} onClick={() => onInspect(id)}>
              {byId.get(id)?.title} <i>Inspect</i>
            </button>
          ))}
        </div>
      )}
      {cast.length > 0 && (
        <div className="inspector-cast">
          <span>CHARACTERS · {cast.length}</span>
          <div>
            {shownCast.map((character) => (
              <a
                key={character.id}
                href={`/characters?c=${character.id}`}
                data-team={character.team}
                title={`${character.name}${character.alias ? ` — ${character.alias}` : ""}`}
              >
                {character.name}
              </a>
            ))}
            {cast.length > CAST_PREVIEW && (
              <button
                type="button"
                className="inspector-cast-more"
                aria-expanded={castOpen}
                onClick={() => setCastOpenFor(castOpen ? null : story.id)}
              >
                {castOpen ? "Show fewer" : `+${cast.length - CAST_PREVIEW} more`}
              </button>
            )}
          </div>
        </div>
      )}
      {story.editorialPlacement && (
        <p className="editorial-note">
          † Story placement is an editorial estimate; Marvel has not fixed an official year.
        </p>
      )}
    </aside>
  );
}
